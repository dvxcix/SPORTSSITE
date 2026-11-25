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

    private struct Event: Decodable, Sendable {
        struct Label: Decodable, Sendable { let displayValue: String? }
        struct Team: Decodable, Sendable { let id: String? }
        struct Kind: Decodable, Sendable { let text: String? }
        let id: String
        let text: String?
        let type: Kind?
        let period: Label?
        let clock: Label?
        let homeScore: Int?
        let awayScore: Int?
        let scoringPlay: Bool?
        let team: Team?

        var play: GameCenterData.Play {
            .init(id: id, title: type?.text, text: text ?? "", period: period?.displayValue, clock: clock?.displayValue,
                home: homeScore, away: awayScore, scoring: scoringPlay == true, teamId: team?.id,
                athletes: [], reactions: [:], pitches: nil)
        }
    }

    let header: Header
    private let plays: [Event]?

    var score: LiveScorePacket? {
        guard let match = header.competitions.first else { return nil }
        return .init(status: match.status.type,
            away: match.competitors.first { $0.homeAway == "away" }?.score,
            home: match.competitors.first { $0.homeAway == "home" }?.score)
    }

    var latestPlayID: String? { plays?.last?.id }

    func merge(with confirmed: [GameCenterData.Play]) -> [GameCenterData.Play] {
        guard let plays, let newest = plays.last?.id else { return confirmed }
        let fresh = plays.suffix(220)
        if let official = confirmed.first?.id, official != newest {
            // Only prepend an update that overlaps the last confirmed play. An older provider
            // response or a reset cannot replace a newer timeline.
            guard fresh.contains(where: { $0.id == official }) else { return confirmed }
        }
        var existing: [String: GameCenterData.Play] = [:]
        for play in confirmed { existing[play.id] = play }
        return fresh.reversed().map { existing[$0.id] ?? $0.play }
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
