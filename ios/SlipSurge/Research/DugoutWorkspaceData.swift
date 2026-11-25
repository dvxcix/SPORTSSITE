import Foundation

struct DugoutWorkspaceMechanics: Decodable {
    struct Player: Decodable, Identifiable {
        struct Scores: Decodable {
            let overall: Double
            let powerFormation: Double
            let transferEfficiency: Double
            let planeMatch: Double
            let timing: Double
            let trajectory: Double
            let pitcherBreakdown: Double
            let trend: Double
            let confidence: Double
        }

        let playerId: Int
        let playerName: String
        let team: String
        let position: String
        let lineupStatus: String
        let rank: Int
        let scores: Scores
        let metrics: [String: Metric]?
        let reasons: [String]
        let cautions: [String]

        var id: Int { playerId }
        var contactShape: Double { ((scores.planeMatch + scores.trajectory) * 5).rounded() / 10 }
    }

    struct Metric: Decodable {
        let number: Double?

        init(from decoder: Decoder) throws {
            let value = try decoder.singleValueContainer()
            number = try? value.decode(Double.self)
        }
    }

    let gamePk: Int
    let gameDate: String
    let window: Int
    let lineupConfirmed: Bool
    let sourceThroughDate: String?
    let players: [Player]
}

extension DugoutWindow {
    var gameCount: Int? { Int(rawValue.dropFirst()) }
}

extension DugoutAPI {
    func workspaceMechanics(date: String, game: Int, window: DugoutWindow) async throws -> DugoutWorkspaceMechanics? {
        struct Response: Decodable { let mechanics: DugoutWorkspaceMechanics? }
        guard let count = window.gameCount else { throw URLError(.badURL) }
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/workspace", query: [
            .init(name: "date", value: date), .init(name: "game", value: String(game)), .init(name: "window", value: String(count)),
        ], account: account, userID: userID)
        guard data.count <= 4_000_000 else { throw URLError(.cannotParseResponse) }
        guard let model = try JSONDecoder().decode(Response.self, from: data).mechanics else { return nil }
        guard model.gameDate == date, model.gamePk == game, model.window == count,
              Set(model.players.map(\.id)).count == model.players.count else { throw URLError(.cannotParseResponse) }
        return model
    }
}
