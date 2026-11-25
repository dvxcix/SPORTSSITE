import Foundation

struct SidelineLadderData: Decodable {
    struct Contract: Decodable, Identifiable {
        let line: Double
        let current: Int?
        let opening: Int?
        let openingOnly: Bool
        let openingLine: Double?
        let movement: Double?
        let ratio: Double?
        let picks: Int?
        let estimated: Bool
        let leg: TrackedPickAPI.Leg?
        var id: Double { line }
    }

    struct Row: Decodable, Identifiable {
        let player: SidelineResearchPayload.Player
        let status: String?
        let eligible: Bool
        let score: Double?
        let mm: Int?
        let picks: Int?
        let matrices: [SidelineResearchPayload.Row.Matrix]
        let contracts: [Contract]
        var id: Int { player.id }
    }

    let gameId: String
    let date: String
    let market: String
    let book: String
    let kind: String
    let side: String
    let cutoffAt: String?
    let availabilityStale: Bool
    let matricesUnavailable: Bool
    let canPost: Bool
    let books: [String]
    let markets: [String]
    let rows: [Row]
}
