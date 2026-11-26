import Foundation
import Observation

struct LiveScorePacket: Decodable, Equatable, Sendable {
    struct Status: Decodable, Equatable, Sendable {
        let state: String
        let shortDetail: String?
    }

    struct Side: Decodable, Equatable, Sendable {
        let homeAway: String
        let score: String?
        let team: Team?
        struct Team: Decodable, Equatable, Sendable { let abbreviation: String? }
    }

    private struct Event: Decodable, Sendable {
        struct EventStatus: Decodable, Sendable { let type: Status }
        struct Competition: Decodable, Sendable { let competitors: [Side] }
        let id: String
        let date: Date?
        let status: EventStatus
        let competitions: [Competition]
    }

    let status: Status
    let away: String?
    let home: String?

    static let paths = ["nba": "basketball/nba", "nhl": "hockey/nhl", "soccer": "soccer/usa.1"]
    private static let scoreboardPaths = paths.merging(["nfl": "football/nfl"]) { current, _ in current }
    static let fastLeagues = scoreboardPaths.keys.sorted()
    static let fastLifetime: Duration = .seconds(14)
    static let fallbackLifetime: Duration = .seconds(40)

    func trails(_ prior: Self) -> Bool {
        if status.state == "post" { return false }
        if prior.status.state == "post" || prior.status.state == "in" && status.state == "pre" { return true }
        if let next = status.progress, let previous = prior.status.progress {
            if next.period != previous.period { return next.period < previous.period }
            if next.seconds != previous.seconds { return next.seconds > previous.seconds }
        }
        return [(away, prior.away), (home, prior.home)].contains { pair in
            guard let next = pair.0.flatMap(Int.init), let previous = pair.1.flatMap(Int.init) else { return false }
            return next < previous
        }
    }

    struct Observation: Equatable, Sendable {
        let packet: LiveScorePacket
        let receivedAt: ContinuousClock.Instant

        func isFresh(asOf now: ContinuousClock.Instant, lifetime: Duration) -> Bool {
            receivedAt.duration(to: now) < lifetime
        }

        static func preferred(fast: Self?, fallback: Self?, asOf now: ContinuousClock.Instant) -> (score: Self?, delayed: Bool) {
            if fallback?.packet.status.state == "post" { return (fallback, false) }
            if fast?.packet.status.state == "post" { return (fast, false) }
            if let fast, let fallback {
                if fast.packet.trails(fallback.packet) || !fallback.packet.trails(fast.packet) &&
                    !fast.isFresh(asOf: now, lifetime: LiveScorePacket.fastLifetime) {
                    return (fallback, !fallback.isFresh(asOf: now, lifetime: LiveScorePacket.fallbackLifetime))
                }
                return (fast, !fast.isFresh(asOf: now, lifetime: LiveScorePacket.fastLifetime))
            }
            if let fast { return (fast, !fast.isFresh(asOf: now, lifetime: LiveScorePacket.fastLifetime)) }
            if let fallback { return (fallback, !fallback.isFresh(asOf: now, lifetime: LiveScorePacket.fallbackLifetime)) }
            return (nil, true)
        }
    }

    static func load(sport: String, day: String, games: [Scoreboard.Match]) async throws -> [String: Self] {
        guard let path = scoreboardPaths[sport] else { return [:] }
        struct Feed: Decodable { let events: [Event] }
        let request = try SlipSurgeHTTP.request(host: "site.api.espn.com", path: "/apis/site/v2/sports/\(path)/scoreboard",
            query: [.init(name: "dates", value: day.replacingOccurrences(of: "-", with: ""))], timeout: 5)
        let bytes = try await SlipSurgeHTTP.send(request)
        guard bytes.count < 2_500_000 else { throw URLError(.dataLengthExceedsMaximum) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let date = try decoder.singleValueContainer().decode(String.self)
            let timestamp = date.utf8.count == 17 && date.hasSuffix("Z") ? date.dropLast() + ":00Z" : date
            guard let parsed = SidelineBoard.timestamp(timestamp) else { throw URLError(.cannotParseResponse) }
            return parsed
        }
        let events = try decoder.decode(Feed.self, from: bytes).events
        var packets: [String: Self] = [:]
        for event in events where event.status.type.state == "in" || event.status.type.state == "post" {
            guard let sides = event.competitions.first?.competitors,
                  let away = sides.first(where: { $0.homeAway == "away" }),
                  let home = sides.first(where: { $0.homeAway == "home" }),
                  away.score.flatMap(Int.init) != nil, home.score.flatMap(Int.init) != nil else { continue }
            let key: String
            if sport == "nfl" {
                guard let start = event.date, let awayCode = away.team?.abbreviation,
                      let homeCode = home.team?.abbreviation else { continue }
                // ESPN and SlipSurge use different NFL IDs. Require one matching matchup near kickoff.
                let matches = games.filter {
                    nflTeam($0.away.abbreviation) == nflTeam(awayCode) &&
                    nflTeam($0.home.abbreviation) == nflTeam(homeCode) &&
                    abs($0.startDate?.timeIntervalSince(start) ?? .infinity) <= 90 * 60
                }
                guard matches.count == 1, let match = matches.first else { continue }
                key = match.id
            } else {
                key = event.id
            }
            packets[key] = .init(status: event.status.type, away: away.score, home: home.score)
        }
        return packets
    }

    private static func nflTeam(_ code: String) -> String {
        ["LA": "LAR", "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS"][code] ?? code
    }
}

private extension LiveScorePacket.Status {
    var progress: (period: Int, seconds: Int)? {
        guard let shortDetail,
              let clock = shortDetail.range(of: #"[0-9]{1,2}:[0-9]{2}"#, options: .regularExpression),
              let periodRange = shortDetail[clock.upperBound...].range(of: #"[1-9](?=st|nd|rd|th)"#, options: .regularExpression),
              let period = Int(shortDetail[periodRange]) else { return nil }
        let parts = shortDetail[clock].split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return (period, parts[0] * 60 + parts[1])
    }
}

@MainActor @Observable
final class LiveScoreboard {
    private(set) var source: Scoreboard?
    private(set) var error: (any Error)?
    private var packets: [String: [String: LiveScorePacket.Observation]] = [:]
    private var delayedGames = Set<String>()
    @ObservationIgnored private var requestDay: String?
    private var latestRequest: UUID?

    func board(for day: String) -> Scoreboard? {
        guard let source, source.date == day else { return nil }
        let now = ContinuousClock.now
        let delayed = delayedGames
        return Scoreboard(date: day, leagues: source.leagues.map { group in
            .init(id: group.id, available: group.available, games: group.games.map { match in
                let preferred = LiveScorePacket.Observation.preferred(fast: packets[group.id]?[match.id], fallback: match.observation, asOf: now)
                var displayed = preferred.score.map { match.applying($0.packet) } ?? match
                displayed.scoreObservedAt = preferred.score?.receivedAt
                displayed.delayed = displayed.live && (preferred.delayed || delayed.contains(group.id + ":" + match.id))
                return displayed
            })
        })
    }

    func refresh(day: String) async {
        if requestDay != day {
            requestDay = day
            packets.removeAll()
            delayedGames.removeAll()
        }
        let request = UUID()
        latestRequest = request
        do {
            let next = try await Scoreboard.load(date: day)
            guard !Task.isCancelled, latestRequest == request else { return }
            let now = ContinuousClock.now
            let previous = (source?.date == day ? source?.leagues : nil) ?? []
            source = .init(date: day, leagues: next.leagues.map { league in
                let retained = previous.first { $0.id == league.id }?.games ?? []
                let byID = Dictionary(retained.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
                let keys = Set(league.games.map(\.id))
                let games = league.games.map { match in
                    if let old = byID[match.id], match.scorePacket.trails(old.scorePacket) { return old }
                    var confirmed = match
                    confirmed.scoreObservedAt = now
                    return confirmed
                }
                let missingLive = retained.filter { $0.live && !keys.contains($0.id) }
                return .init(id: league.id, available: league.available && !(games.isEmpty && !missingLive.isEmpty),
                    games: league.available ? games + missingLive : retained)
            })
            updateDelays(now: now)
            error = nil
        } catch {
            if !Task.isCancelled, latestRequest == request { self.error = error }
        }
    }

    func follow(through day: String, todayOnly: Bool = false) async {
        // Separate requests let a fast league update immediately when another source stalls.
        await withTaskGroup(of: Void.self) { tasks in
            tasks.addTask { [self] in await followSlipSurge(through: day, todayOnly: todayOnly) }
            tasks.addTask { [self] in await followFreshness() }
            for sport in LiveScorePacket.fastLeagues {
                tasks.addTask { [self] in await followProvider(sport: sport, day: day, todayOnly: todayOnly) }
            }
        }
    }

    private func followSlipSurge(through day: String, todayOnly: Bool) async {
        repeat {
            let requested = todayOnly ? SlateDate.key(.now) : day
            let games = board(for: requested)?.leagues.flatMap(\.games) ?? []
            if source?.date != requested || requested == SlateDate.key(.now) || games.contains(where: \.live) {
                await refresh(day: requested)
            }
            let opening = (board(for: requested)?.leagues.flatMap(\.games) ?? []).contains {
                $0.live || $0.state == "pre" && ($0.startDate?.timeIntervalSinceNow ?? .infinity) < 180
            }
            do { try await Task.sleep(for: .seconds(opening ? 8 : 24)) } catch { return }
        } while !Task.isCancelled
    }

    private func followProvider(sport: String, day: String, todayOnly: Bool) async {
        repeat {
            let requested = todayOnly ? SlateDate.key(.now) : day
            let games = board(for: requested)?.leagues.first { $0.id == sport }?.games ?? []
            let active = games.contains {
                $0.live || $0.state == "pre" && ($0.startDate?.timeIntervalSinceNow ?? .infinity) < 90
            }
            if active, let date = SlateDate.fromKey(requested), abs(date.timeIntervalSinceNow) < 32 * 3600,
               let received = try? await LiveScorePacket.load(sport: sport, day: requested, games: games),
               !Task.isCancelled, requestDay == requested, source?.date == requested, !received.isEmpty {
                let now = ContinuousClock.now
                let next = (packets[sport] ?? [:]).merging(received.mapValues { .init(packet: $0, receivedAt: now) }) { old, new in
                    new.packet.trails(old.packet) ? old : new
                }
                if next != packets[sport] { packets[sport] = next }
                updateDelays(now: now)
            }
            do { try await Task.sleep(for: .seconds(active ? 2 : 4)) } catch { return }
        } while !Task.isCancelled
    }

    private func followFreshness() async {
        while !Task.isCancelled {
            updateDelays(now: .now)
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
        }
    }

    private func updateDelays(now: ContinuousClock.Instant) {
        var next = Set<String>()
        for league in source?.leagues ?? [] {
            for match in league.games {
                let observation = LiveScorePacket.Observation.preferred(fast: packets[league.id]?[match.id],
                    fallback: match.observation, asOf: now)
                if observation.score?.packet.status.state == "in", observation.delayed {
                    next.insert(league.id + ":" + match.id)
                }
            }
        }
        if delayedGames != next { delayedGames = next }
    }

}

extension Scoreboard.Match {
    var scorePacket: LiveScorePacket { .init(status: .init(state: state, shortDetail: status), away: away.score, home: home.score) }
    var observation: LiveScorePacket.Observation? {
        scoreObservedAt.map { .init(packet: scorePacket, receivedAt: $0) }
    }

    fileprivate func applying(_ packet: LiveScorePacket) -> Self {
        guard state != "post" || packet.status.state == "post" else { return self }
        return .init(id: id, sport: sport, start: start, state: packet.status.state, status: packet.status.shortDetail ?? status,
                     venue: venue, away: away.scoring(packet.away), home: home.scoring(packet.home))
    }
}

private extension Scoreboard.Match.Team {
    func scoring(_ newScore: String?) -> Self {
        .init(id: id, name: name, abbreviation: abbreviation, logo: logo, color: color, secondary: secondary,
              record: record, score: newScore ?? score)
    }
}
