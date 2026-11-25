import Foundation

struct CourtToolPlayer: Decodable {
    let id: Int
    let firstName: String
    let lastName: String
    let position: String?
    let team: CourtBoard.Team
    let headshot: URL?

    var name: String { "\(firstName) \(lastName)" }
}

struct CourtToolHit: Decodable {
    let wins: Int
    let pushes: Int
    let games: Int
    let rate: Double?

    var label: String { ResearchFormat.decimal(rate, suffix: "%") }

    var sample: String {
        "\(wins)/\(games - pushes)" + (pushes > 0 ? " · \(pushes) push" + (pushes == 1 ? "" : "es") : "")
    }
}

struct CourtToolOffer: Decodable {
    let id: Int
    let gameId: Int
    let playerId: Int
    let vendor: String
    let propType: String
    let lineValue: String
    let market: CourtBoard.Prop.Market
    let updatedAt: String

    func price(_ side: CourtPlayerMarket.Side) -> Int? {
        if market.type == "milestone" { return side == .over ? market.odds : nil }
        return side == .over ? market.overOdds : market.underOdds
    }
}

struct CourtFirstBasketHistory: Decodable {
    struct Player: Decodable {
        let playerId: Int
        let games: Int
        let firstScores: Int
        let firstAttempts: Int
        let firstFieldGoals: Int
        let teamFirstFieldGoals: Int
    }

    struct Team: Decodable {
        let teamId: Int
        let tips: Int
        let tipWins: Int
    }

    let rows: [Player]
    let teams: [Team]
    let coveredGames: Int
    let requestedGames: Int
    let mode: CourtResearchMode
    let stale: Bool?
    let researchSnapshot: CourtBoard.Snapshot?
}

struct CourtFirstBasketOdds: Decodable {
    struct Row: Decodable, Identifiable {
        struct Movement: Decodable {
            let change: Double?
            let previousOdds: Int?
        }

        let player: CourtToolPlayer
        let game: CourtBoard.Game
        let offer: CourtToolOffer
        let movement: Movement?

        var id: String { "\(game.id):\(player.id):\(offer.vendor):\(offer.id)" }

        func isVisible(mode: CourtResearchMode, now: Date, frozen: Bool) -> Bool {
            guard offer.gameId == game.id, offer.playerId == player.id,
                  let tip = SidelineBoard.timestamp(game.datetime ?? game.status),
                  let updated = SidelineBoard.timestamp(offer.updatedAt), updated <= now,
                  mode == .pregame ? updated < tip : updated >= tip else { return false }
            if frozen { return mode == .pregame ? now >= tip : game.isFinal }
            let phaseOpen = mode == .pregame ? now < tip && !game.isInProgress && !game.isFinal : now >= tip && game.isInProgress
            return phaseOpen && now.timeIntervalSince(updated) <= 300
        }
    }

    let rows: [Row]
    let date: String
    let requestedDate: String
    let mode: CourtResearchMode
    let fetchedAt: String
    let frozenGameIds: [Int]
    let status: String
}

struct CourtCheatsheetsPayload: Decodable {
    struct Market: Decodable {
        let key: String
        let label: String
    }

    struct Row: Decodable, Identifiable {
        let playerId: Int
        let market: String
        let label: String
        let book: String
        let line: Double
        let odds: Int?
        let mm: Int?
        let hit: CourtToolHit
        let gap: Double?
        let average: Double?
        let recent: Double?
        let season: Double?
        let milestone: Bool

        var id: String { "\(playerId):\(market):\(book):\(line)" }
    }

    let gameId: Int
    let date: String
    let mode: CourtResearchMode
    let complete: Bool
    let markets: [Market]
    let books: [String]
    let lines: [Double]
    let rows: [Row]
}

struct CourtSlateEdgePayload: Decodable {
    struct Row: Decodable, Identifiable {
        let player: CourtToolPlayer
        let game: CourtBoard.Game
        let offer: CourtToolOffer
        let estimate: Double?
        let score: Double?
        let mm: Int?
        let average: Double?
        let gap: Double?
        let hit: CourtToolHit
        let researchObservedAt: String?

        var id: String { "\(game.id):\(player.id)" }
    }

    let rows: [Row]
    let date: String
    let mode: CourtResearchMode
    let complete: Bool
    let games: Int
    let loaded: Int
    let stale: Bool
    let frozenMmUnavailable: [Int]?
}
