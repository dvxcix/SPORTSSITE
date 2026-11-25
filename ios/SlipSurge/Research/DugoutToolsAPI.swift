import Foundation

struct DugoutWeather: Decodable {
    struct Hour: Decodable, Identifiable {
        struct Compass: Decodable { let from: String; let to: String }
        struct Carry: Decodable { let score: Double; let label: String; let color: String? }

        let label: String
        let tempF: Double?
        let windMph: Double?
        let windGustMph: Double?
        let humidity: Double?
        let conditions: String?
        let windField: String?
        let windAngle: Double?
        let compass: Compass?
        let carry: Carry
        let isCurrent: Bool?
        var id: String { label }
        var title: String { isCurrent == true ? "Now" : label.uppercased() }
    }

    struct Game: Decodable, Identifiable {
        let id: Int
        let startsAt: String
        let away: DugoutBoard.Team
        let home: DugoutBoard.Team
        let park: String
        let city: String
        let shape: DugoutParkShape?
        let roofStatus: String
        let source: String
        let hours: [Hour]

        var roofTitle: String {
            switch roofStatus {
            case "open": "Open roof"
            case "closed": "Closed roof"
            case "fixed": "Fixed roof"
            default: "Roof status unavailable"
            }
        }
    }

    let date: String
    let fetchedAt: String
    let refreshSeconds: Int
    let games: [Game]
}

struct DugoutParkHistory: Decodable {
    struct Batter: Decodable, Identifiable {
        let mlbId: Int
        let name: String
        let team: String
        let position: String
        let career: Int
        let season: Int
        let headshot: URL
        var id: Int { mlbId }
    }
    let confirmed: Bool
    let season: Int
    let teams: [DugoutBoard.Team]
    let batters: [Batter]
}

struct DugoutSpraySlate: Decodable {
    enum Result: String, CaseIterable, Decodable {
        case all, homeRun = "home_run", nearHomeRun = "near_hr", hit, out, other

        var title: String {
            switch self {
            case .all: "All contact"
            case .homeRun: "Home runs"
            case .nearHomeRun: "Near home runs"
            case .hit: "Hits"
            case .out: "Outs"
            case .other: "Other"
            }
        }
    }

    struct Game: Decodable, Identifiable {
        let id: Int
        let venue: String
        let status: String
        let away: DugoutBoard.Team
        let home: DugoutBoard.Team
        let shape: DugoutParkShape?
    }

    struct Event: Decodable, Identifiable {
        struct Market: Decodable {
            struct Quote: Decodable, Identifiable {
                let marketKey: String
                let marketLabel: String
                let book: String
                let odds: Int
                var id: String { "\(marketKey):\(book)" }
            }
            let primaryLabel: String
            let primary: [Quote]
            let specials: [Quote]
            let frozenAt: String?
        }

        let id: String
        let kind: Result
        let gamePk: Int
        let batterId: Int
        let batterName: String
        let batterTeam: String
        let pitcherName: String
        let inning: Int?
        let half: String
        let result: String
        let description: String
        let rbi: Int
        let isFirstHr: Bool
        let isGrandSlam: Bool
        let exitVelocity: Double?
        let launchAngle: Double?
        let distance: Double?
        let hcX: Double
        let hcY: Double
        let coordinateSource: String
        let pitchType: String?
        let pitchSpeed: Double?
        let bbType: String?
        let parksHrCount: Int?
        let parksHrList: String?
        let headshot: URL
        let marketContext: Market?

        var resultTitle: String { result.replacingOccurrences(of: "_", with: " ").capitalized }
        var sourceTitle: String {
            switch coordinateSource {
            case "bearing_projection": "Landing point projected from recorded bearing and distance"
            case "mlb_live": "Official MLB live-game coordinate"
            default: "Official Statcast coordinate"
            }
        }
    }

    let date: String
    let generatedAt: String
    let games: [Game]
    let notes: [String]
    let contacts: [Event]
}

struct DugoutToolsAPI {
    let account: AccountStore
    let userID: UUID

    func weather(date: String) async throws -> DugoutWeather {
        let value: DugoutWeather = try await load("weather", .init(name: "date", value: date))
        guard value.date == date else { throw URLError(.cannotParseResponse) }
        return value
    }

    func parkHistory(game: Int) async throws -> DugoutParkHistory {
        try await load("park-hr", .init(name: "gamePk", value: String(game)))
    }

    func spray(date: String) async throws -> DugoutSpraySlate {
        let slate: DugoutSpraySlate = try await load("spray", .init(name: "date", value: date))
        guard slate.date == date else { throw URLError(.cannotParseResponse) }
        return slate
    }

    private func load<T: Decodable>(_ tool: String, _ query: URLQueryItem) async throws -> T {
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/tools", query: [.init(name: "tool", value: tool), query],
            account: account, userID: userID)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
