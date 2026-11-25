import Foundation

struct CourtBoard: Decodable {
    struct Team: Decodable {
        let id: Int
        let abbreviation: String
        let fullName: String

        var logo: URL? {
            guard abbreviation.range(of: "^[A-Z]{2,3}$", options: .regularExpression) != nil else { return nil }
            let aliases = ["GSW": "gs", "NOP": "no", "NYK": "ny", "SAS": "sa", "UTA": "utah"]
            let code = aliases[abbreviation] ?? abbreviation.lowercased()
            return URL(string: "https://a.espncdn.com/i/teamlogos/nba/500/\(code).png")
        }
    }

    struct Game: Decodable, Identifiable {
        let id: Int
        let date: String
        let datetime: String?
        let visitorTeam: Team
        let homeTeam: Team
    }

    struct Snapshot: Decodable {
        let frozen: Bool
        let observedAt: String?
    }

    struct Player: Decodable, Identifiable {
        struct Averages: Decodable {
            let pts: Double?
            let reb: Double?
            let ast: Double?
        }

        let id: Int
        let firstName: String
        let lastName: String
        let position: String?
        let team: Team
        let headshot: URL?
        let average: Averages?
        let props: [Prop]
    }

    struct Prop: Decodable, Identifiable {
        struct Market: Decodable {
            let type: String
            let odds: Int?
            let overOdds: Int?
            let underOdds: Int?
        }

        let id: Int
        let gameId: Int
        let playerId: Int
        let vendor: String
        let propType: String
        let lineValue: String
        let market: Market
        let updatedAt: String
    }

    let game: Game
    let players: [Player]
    let issues: [String]
    let oddsMode: String
    let historical: Bool
    let researchSnapshot: Snapshot?

    var isFrozen: Bool { researchSnapshot?.frozen == true }
    var tip: Date? { game.datetime.flatMap(SidelineBoard.timestamp) }

    var hasUsableResearch: Bool {
        // The server's frozen snapshot is required at and after tip. If the
        // clock is unknown, fail closed for any non-frozen research.
        oddsMode == "pregame" && (isFrozen || (!historical && (tip.map { $0 > Date.now } ?? false)))
    }
}

struct CourtAPI {
    private struct Schedule: Decodable {
        let date: String
        let games: [CourtBoard.Game]
    }

    func featuredBoard() async throws -> CourtBoard {
        let request = try SlipSurgeHTTP.request(
            host: SlipSurgeHTTP.site,
            path: "/preview/nba/data",
            query: [.init(name: "resource", value: "/the-paint/board")],
            timeout: 120
        )
        return try await board(request, matching: nil)
    }

    func slate(date: String, account: AccountStore, userID: UUID) async throws -> [CourtBoard.Game] {
        let data = try await memberData(
            "/api/mobile/court/schedule", query: [.init(name: "date", value: date)], account: account, userID: userID
        )
        let schedule = try Self.decode(Schedule.self, from: data)
        guard schedule.date == date, schedule.games.count <= 16,
              Set(schedule.games.map(\.id)).count == schedule.games.count,
              schedule.games.allSatisfy({ $0.date == date }) else { throw URLError(.cannotParseResponse) }
        return schedule.games
    }

    func memberBoard(game: CourtBoard.Game, account: AccountStore, userID: UUID) async throws -> CourtBoard {
        let data = try await memberData(
            "/api/mobile/court/board", query: [.init(name: "game", value: String(game.id)), .init(name: "slate_date", value: game.date)],
            account: account, userID: userID
        )
        return try Self.validatedBoard(data, matching: game)
    }

    private func board(_ request: URLRequest, matching game: CourtBoard.Game?) async throws -> CourtBoard {
        try Self.validatedBoard(await SlipSurgeHTTP.send(request), matching: game)
    }

    private func memberData(_ path: String, query: [URLQueryItem], account: AccountStore, userID: UUID) async throws -> Data {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path, query: query, timeout: 120)
        let token = try await account.accessToken(for: userID)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        do {
            return try await SlipSurgeHTTP.send(request)
        } catch let error as SlipSurgeHTTP.Status where error.code == 401 {
            let refreshed = try await account.accessToken(for: userID, replacing: token)
            request.setValue("Bearer \(refreshed)", forHTTPHeaderField: "Authorization")
            return try await SlipSurgeHTTP.send(request)
        }
    }

    private static func validatedBoard(_ data: Data, matching game: CourtBoard.Game?) throws -> CourtBoard {
        let board = try decode(CourtBoard.self, from: data)
        guard (game.map { $0.id == board.game.id && $0.date == board.game.date } ?? true),
              Set(board.players.map(\.id)).count == board.players.count,
              board.players.allSatisfy({ player in
                  [board.game.homeTeam.id, board.game.visitorTeam.id].contains(player.team.id)
              }) else { throw URLError(.cannotParseResponse) }
        return board
    }

    private static func decode<Value: Decodable>(_ type: Value.Type, from data: Data) throws -> Value {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}
