import Foundation

struct LivePlayUpdate: Decodable, Sendable {
    struct Header: Decodable, Sendable {
        struct Match: Decodable, Sendable {
            struct Status: Decodable, Sendable { let type: LiveScorePacket.Status }
            let status: Status
            let competitors: [LiveScorePacket.Side]
        }
        let id: String
        let competitions: [Match]
    }

    private struct Event: Decodable, Equatable, Sendable {
        struct Label: Decodable, Equatable, Sendable { let displayValue: String?; let number: Int? }
        struct Team: Decodable, Equatable, Sendable { let id: String? }
        struct Kind: Decodable, Equatable, Sendable { let text: String? }
        struct Participant: Decodable, Equatable, Sendable {
            struct Athlete: Decodable, Equatable, Sendable { let id: String }
            let athlete: Athlete
        }
        let id: String
        let text: String?
        let type: Kind?
        let period: Label?
        let clock: Label?
        let homeScore: Int?
        let awayScore: Int?
        let scoringPlay: Bool?
        let shootingPlay: Bool?
        let pointsAttempted: Int?
        let scoreValue: Int?
        let team: Team?
        let participants: [Participant]?

        func play(confirmed: GameCenterData.Play?, roster: [String: Box.Athlete]) -> GameCenterData.Play {
            let participants = (participants ?? []).compactMap { roster[$0.athlete.id]?.playAthlete }
            let attempted = pointsAttempted.flatMap { (1...3).contains($0) ? $0 : nil }
            let shot = shootingPlay == true ? attempted.map {
                GameCenterData.Play.Shot(attempted: $0, scored: max(0, scoreValue ?? 0))
            } : nil
            return .init(id: id, title: type?.text ?? confirmed?.title, text: text ?? confirmed?.text ?? "",
                period: period?.displayValue, clock: clock?.displayValue,
                home: homeScore, away: awayScore, scoring: scoringPlay == true, teamId: team?.id,
                athletes: confirmed?.athletes.isEmpty == false ? confirmed?.athletes ?? [] : participants,
                reactions: confirmed?.reactions ?? [:], pitches: confirmed?.pitches, shot: shot)
        }
    }

    private struct Box: Decodable, Sendable {
        struct Athlete: Decodable, Equatable, Sendable {
            struct Headshot: Decodable, Equatable, Sendable { let href: URL? }
            let id: String
            let displayName: String
            let headshot: Headshot?
            var playAthlete: GameCenterData.Play.Athlete { .init(id: id, name: displayName, headshot: headshot?.href) }
        }
        struct PlayerTeam: Decodable, Sendable {
            struct Statistics: Decodable, Sendable {
                struct Line: Decodable, Sendable { let athlete: Athlete }
                let athletes: [Line]?
            }
            let statistics: [Statistics]?
        }
        let players: [PlayerTeam]?
    }

    let header: Header
    private let plays: [Event]?
    private let boxscore: Box?

    var score: LiveScorePacket? {
        guard let match = header.competitions.first else { return nil }
        return .init(status: match.status.type,
            away: match.competitors.first { $0.homeAway == "away" }?.score,
            home: match.competitors.first { $0.homeAway == "home" }?.score)
    }

    func hasSamePlays(as other: Self?) -> Bool { plays == other?.plays }

    func canAdvance(_ previous: Self?) -> Bool {
        guard let next = plays?.last else { return false }
        guard let prior = previous?.plays?.last else { return true }
        if plays?.contains(where: { $0.id == prior.id }) == true { return true }
        // A scoring correction can remove the previous event. Only allow a
        // packet without it to take over if the game clock has moved forward.
        guard let nextPeriod = next.period?.number, let priorPeriod = prior.period?.number else { return false }
        if nextPeriod != priorPeriod { return nextPeriod > priorPeriod }
        guard let nextClock = next.clock?.displayValue, let priorClock = prior.clock?.displayValue,
              let nextSeconds = Self.seconds(nextClock), let priorSeconds = Self.seconds(priorClock) else { return false }
        return nextSeconds < priorSeconds
    }

    private static func seconds(_ clock: String) -> Double? {
        let parts = clock.split(separator: ":").compactMap { Double($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : parts.first
    }

    func merge(with confirmed: [GameCenterData.Play], basketball: Bool = false)
        -> (plays: [GameCenterData.Play], completeHistory: Bool) {
        guard let plays, let newest = plays.last?.id else { return (confirmed, false) }
        let fresh = basketball ? plays[...] : plays.suffix(220)
        if let official = confirmed.first?.id, official != newest {
            // Only prepend an update that overlaps the last confirmed play. An older provider
            // response or a reset cannot replace a newer timeline.
            guard fresh.contains(where: { $0.id == official }) else { return (confirmed, false) }
        }
        var existing: [String: GameCenterData.Play] = [:]
        for play in confirmed { existing[play.id] = play }
        var roster: [String: Box.Athlete] = [:]
        if basketball {
            for team in boxscore?.players ?? [] {
                for set in team.statistics ?? [] {
                    for line in set.athletes ?? [] { roster[line.athlete.id] = line.athlete }
                }
            }
        }
        let complete = basketball && plays.first?.period?.number == 1 && plays.first?.clock?.displayValue == "12:00"
        return (fresh.reversed().map { event in
            let confirmed = existing[event.id]
            return basketball ? event.play(confirmed: confirmed, roster: roster) : confirmed ?? event.play(confirmed: nil, roster: [:])
        }, complete)
    }

    static func load(sport: String, id: String) async throws -> Self? {
        guard let path = LiveScorePacket.paths[sport] else { return nil }
        let request = try SlipSurgeHTTP.request(host: "site.api.espn.com", path: "/apis/site/v2/sports/\(path)/summary",
            query: [.init(name: "event", value: id)], timeout: 5)
        let bytes = try await SlipSurgeHTTP.send(request)
        guard bytes.count < 4_000_000 else { throw URLError(.dataLengthExceedsMaximum) }
        let update = try JSONDecoder().decode(Self.self, from: bytes)
        guard update.header.id == id, update.score != nil else { throw URLError(.cannotParseResponse) }
        return update
    }
}
