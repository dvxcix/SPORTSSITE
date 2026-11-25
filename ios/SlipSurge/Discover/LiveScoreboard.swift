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
    }

    private struct Event: Decodable, Sendable {
        struct EventStatus: Decodable, Sendable { let type: Status }
        struct Competition: Decodable, Sendable { let competitors: [Side] }
        let id: String
        let status: EventStatus
        let competitions: [Competition]
    }

    let status: Status
    let away: String?
    let home: String?

    static let paths = ["nba": "basketball/nba", "nhl": "hockey/nhl", "soccer": "soccer/usa.1"]

    fileprivate static func load(sport: String, day: String) async throws -> [String: Self] {
        guard let path = paths[sport] else { return [:] }
        struct Feed: Decodable { let events: [Event] }
        // Read the same public feed as the SlipSurge scoreboard. Never attach account credentials.
        let request = try SlipSurgeHTTP.request(host: "site.api.espn.com", path: "/apis/site/v2/sports/\(path)/scoreboard",
            query: [.init(name: "dates", value: day.replacingOccurrences(of: "-", with: ""))], timeout: 5)
        let bytes = try await SlipSurgeHTTP.send(request)
        guard bytes.count < 2_500_000 else { throw URLError(.dataLengthExceedsMaximum) }
        let events = try JSONDecoder().decode(Feed.self, from: bytes).events
        var packets: [String: Self] = [:]
        for event in events where event.status.type.state == "in" || event.status.type.state == "post" {
            guard let sides = event.competitions.first?.competitors else { continue }
            packets[event.id] = .init(status: event.status.type,
                away: sides.first { $0.homeAway == "away" }?.score, home: sides.first { $0.homeAway == "home" }?.score)
        }
        return packets
    }
}

@MainActor @Observable
final class LiveScoreboard {
    private(set) var source: Scoreboard?
    private(set) var error: (any Error)?
    private var packets: [String: [String: LiveScorePacket]] = [:]
    private var latestRequest: UUID?

    func board(for day: String) -> Scoreboard? {
        guard let source, source.date == day else { return nil }
        return Scoreboard(date: day, leagues: source.leagues.map { group in
            guard let changes = packets[group.id], !changes.isEmpty else { return group }
            return .init(id: group.id, available: group.available, games: group.games.map { match in
                guard let packet = changes[match.id] else { return match }
                return match.applying(packet)
            })
        })
    }

    func refresh(day: String) async {
        if source?.date != day { packets.removeAll() }
        let request = UUID()
        latestRequest = request
        do {
            let next = try await Scoreboard.load(date: day)
            guard !Task.isCancelled, latestRequest == request else { return }
            if let current = source, current.date == day {
                let previous = Dictionary(uniqueKeysWithValues: current.leagues.map { ($0.id, $0) })
                source = .init(date: day, leagues: next.leagues.map { league in
                    guard let retained = previous[league.id],
                          !league.available || (league.games.isEmpty && retained.games.contains(where: \.live)) else { return league }
                    return .init(id: league.id, available: false, games: retained.games)
                })
            } else {
                source = next
            }
            error = nil
        } catch {
            if !Task.isCancelled, latestRequest == request { self.error = error }
        }
    }

    func follow(through day: String, todayOnly: Bool = false) async {
        // Separate requests let a fast league update immediately when another source stalls.
        await withTaskGroup(of: Void.self) { tasks in
            tasks.addTask { [self] in await followSlipSurge(through: day, todayOnly: todayOnly) }
            for sport in ["nba", "nhl", "soccer"] {
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
            if requested == SlateDate.key(.now), active,
               let received = try? await LiveScorePacket.load(sport: sport, day: requested), !Task.isCancelled, source?.date == requested,
               !received.isEmpty {
                let retained = packets[sport] ?? [:]
                let next = retained.merging(received) { old, new in
                    old.status.state == "post" && new.status.state != "post" ? old : new
                }
                if next != retained { packets[sport] = next }
            }
            do { try await Task.sleep(for: .seconds(active ? 2 : 4)) } catch { return }
        } while !Task.isCancelled
    }
}

private extension Scoreboard.Match {
    func applying(_ packet: LiveScorePacket) -> Self {
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
