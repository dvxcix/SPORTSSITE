import Foundation

enum SidelineResearchTool: String {
    case mismatch = "mm"
    case cheatsheets
    case slateEdge = "slate-edge"
    case ladders
    case board
    case matchup
    case compare
}

enum SidelineResearchSample: String, CaseIterable, Codable {
    case automatic, previous, preseason, regular

    var label: String {
        switch self {
        case .automatic: "Default season"
        case .previous: "Prior regular season"
        case .preseason: "Preseason"
        case .regular: "Current regular season"
        }
    }
}

extension SidelineAPI {
    func research<Payload: Decodable>(_ type: Payload.Type, tool: SidelineResearchTool,
        date: String, game: String? = nil, sample: SidelineResearchSample, filters: [URLQueryItem] = []) async throws -> Payload {
        guard case .member(let account, let userID) = scope else { throw SlipSurgeHTTP.Status(code: 403, data: Data()) }
        var query = filters + [.init(name: "tool", value: tool.rawValue), .init(name: "date", value: date)]
        if let game { query.append(.init(name: "game", value: game)) }
        if sample != .automatic { query.append(.init(name: "sample", value: sample.rawValue)) }
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/sideline/research", query: query, account: account, userID: userID)
        guard data.count <= 4_194_304 else { throw URLError(.cannotParseResponse) }
        return try JSONDecoder().decode(type, from: data)
    }
}

struct SidelineResearchPayload: Decodable {
    struct Player: Decodable {
        let id: Int
        let name: String
        let team: String
        let position: String?
        let headshot: URL?
        let headshotFallbacks: [URL]?

        var portraits: [URL] { (headshot.map { [$0] } ?? []) + (headshotFallbacks ?? []) }
    }

    struct Hit: Decodable {
        let hits: Int
        let total: Int
        let rate: Double
    }

    struct Row: Decodable, Identifiable {
        struct Matrix: Decodable, Identifiable {
            let id: String
            let name: String
            let color: String
        }

        struct Game: Decodable {
            struct Matchup {
                let season: Int
                let week: Int
                let away: String
                let home: String

                init?(id: String) {
                    let parts = id.split(separator: "_", omittingEmptySubsequences: false)
                    guard parts.count == 4, parts[0].count == 4, let season = Int(parts[0]),
                          let week = Int(parts[1]), week > 0,
                          parts.suffix(2).allSatisfy({ $0.range(of: #"^[A-Z]{2,3}$"#, options: .regularExpression) != nil }) else { return nil }
                    self.season = season
                    self.week = week
                    away = String(parts[2])
                    home = String(parts[3])
                }

                func opponent(of team: String) -> String? {
                    let code = SidelineResearchMarket.normalizeTeam(team)
                    if code == SidelineResearchMarket.normalizeTeam(away) { return home }
                    if code == SidelineResearchMarket.normalizeTeam(home) { return away }
                    return nil
                }
            }

            let id: String
            let value: Double

            var matchup: Matchup? { Matchup(id: id) }
        }

        let player: Player
        let status: String?
        let score: Double?
        let mm: Int?
        let sportsbookRank: Int?
        let performanceRank: Int?
        let line: Double?
        let milestone: Bool?
        let odds: Int?
        let opening: Int?
        let movement: Double?
        let picks: Int?
        let projection: Double?
        let modeled: Double?
        let edge: Double?
        let hits: [Hit?]?
        let gameLog: [Game]?
        let matrices: [Matrix]?

        var id: Int { player.id }
    }

    struct Explosive: Decodable, Identifiable {
        let player: Player
        let games: Int
        let deepTargets: Int?
        let receiving20: Int?
        let receiving30: Int?
        let receiving40: Int?
        let rushing10: Int?
        let rushing20: Int?
        let rushing30: Int?
        let rushing40: Int?

        var id: Int { player.id }
    }

    struct RunGap: Decodable, Identifiable {
        let team: String
        let opponent: String
        let gap: String
        let attempts: Int
        let yardsPerCarry: Double
        let successRate: Double
        let explosiveRate: Double
        let defenseAttempts: Int
        let defenseYardsPerCarry: Double
        let edge: Double

        var id: String { "\(team):\(opponent):\(gap)" }
    }

    struct Defense: Decodable, Identifiable {
        let defense: String
        let position: String
        let stat: String
        let pctDiff: Double
        let games: Int

        var id: String { "\(defense):\(position):\(stat)" }
    }

    let gameId: String
    let date: String
    let tool: String
    let market: String
    let book: String
    let window: String
    let sampleLabel: String
    let status: String
    let availabilityStale: Bool
    let cutoffAt: String?
    let rows: [Row]
    let matricesUnavailable: Bool?
    let books: [String]?
    let markets: [String]?
    let explosives: [Explosive]?
    let runGaps: [RunGap]?
    let defense: [Defense]?
}

struct SidelineEdgePayload: Decodable {
    struct Game: Decodable, Identifiable {
        let id: String
        let label: String
    }

    struct Market: Decodable {
        let label: String
        let line: Double?
        let openingLine: Double?
        let odds: Int?
        let openingOdds: Int?
        let vendor: String?
        let picks: Int?
        let bookGap: Double?
        let books: [String]
    }

    struct Player: Decodable, Identifiable {
        let id: String
        let gameId: String
        let gameLabel: String
        let team: String
        let teamLogo: URL?
        let name: String
        let position: String
        let headshot: URL?
        let score: [String: Double?]
        let mm: [String: Int?]
        let markets: [String: Market]
        let volume: Double?
        let redZone: Double?
        let breakaway: Double?
        let evidence: Double?
        let roleShare: Double?
        let redZoneLooks: Int?
        let explosivePlays: Int?
    }

    let unavailableGames: [String]?
    let legacyUnverifiedGames: [String]?
    let snapshots: [String: String]?
    let date: String
    let sampleLabel: String
    let games: [Game]
    let entries: [Player]
}

enum SidelineResearchMarket {
    static let edge = ["anytime_td", "first_td", "receiving_yards", "receptions", "rushing_yards", "passing_yards"]
    static let mismatch = edge + ["rushing_attempts", "passing_attempts", "completions", "passing_tds"]

    static func title(_ name: String) -> String {
        switch name {
        case "anytime_td": "Anytime TD"
        case "first_td": "First TD"
        case "passing_tds": "Passing TDs"
        case "passing_completions", "completions": "Completions"
        default: name.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func glyph(_ name: String) -> String {
        switch name {
        case "anytime_td": "flag.checkered"
        case "first_td": "1.circle"
        case "receiving_yards": "ruler"
        case "receptions": "hands.clap"
        case "rushing_yards": "figure.run"
        case "passing_yards": "football"
        case "rushing_attempts": "shoeprints.fill"
        case "passing_attempts": "arrow.up.right"
        case "passing_completions", "completions": "checkmark.circle"
        case "passing_tds": "flag"
        default: "ticket"
        }
    }

    static func normalizeTeam(_ name: String) -> String {
        switch name.uppercased() {
        case "LA": "LAR"
        case "JAC": "JAX"
        case "WAS": "WSH"
        case "OAK": "LV"
        case "SD": "LAC"
        case "STL": "LAR"
        default: name.uppercased()
        }
    }
}
