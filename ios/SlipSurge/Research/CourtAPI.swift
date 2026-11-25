import Foundation

enum CourtResearchMode: String, CaseIterable, Decodable {
    case pregame, live
}

struct CourtBoard: Decodable {
    struct Team: Decodable {
        let id: Int
        let abbreviation: String
        let fullName: String

        var logo: URL? { Self.logo(for: abbreviation) }

        static func logo(for abbreviation: String) -> URL? {
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
        let season: Int?
        let status: String
        let statusState: String?
        let period: Int?
        let homeTeamScore: Int?
        let visitorTeamScore: Int?
        let visitorTeam: Team
        let homeTeam: Team

        var isFinal: Bool { statusState == "final" || status.lowercased().hasPrefix("final") }
        var isInProgress: Bool { !isFinal && (statusState == "in_progress" || (period ?? 0) > 0) }
    }

    struct Snapshot: Decodable {
        let frozen: Bool
        let observedAt: String?
    }

    struct GameOdds: Decodable {
        let vendor: String
        let spreadAwayValue: String?
        let spreadHomeValue: String?
        let spreadAwayOdds: Int?
        let spreadHomeOdds: Int?
        let moneylineAwayOdds: Int?
        let moneylineHomeOdds: Int?
        let totalValue: String?
        let totalOverOdds: Int?
        let totalUnderOdds: Int?
        let updatedAt: String?

        var book: GameMarketBook {
            GameMarketBook(
                vendor: vendor, moneylineAway: moneylineAwayOdds, moneylineHome: moneylineHomeOdds,
                spreadAway: spreadAwayValue.flatMap(Double.init), spreadHome: spreadHomeValue.flatMap(Double.init),
                spreadAwayOdds: spreadAwayOdds, spreadHomeOdds: spreadHomeOdds,
                total: totalValue.flatMap(Double.init), totalOverOdds: totalOverOdds, totalUnderOdds: totalUnderOdds,
                updatedAt: updatedAt, isOpeningOnly: nil
            )
        }
    }

    struct Player: Decodable, Identifiable {
        struct Injury: Decodable {
            let status: String
            let description: String?
            let returnDate: String?
        }

        let id: Int
        let firstName: String
        let lastName: String
        let position: String?
        let team: Team
        let headshot: URL?
        let average: [String: Double?]?
        let logs: [PlayerLog]?
        let periodLogs: [PlayerLog]?
        let injury: Injury?
        let draftYear: Int?
        let draftNumber: Int?
        let props: [Prop]

        var seasonMinutes: Double? { average?["min"] ?? nil }
    }

    struct PlayerLog: Decodable {
        struct Identity: Decodable { let id: Int }
        struct LoggedGame: Decodable {
            let id: Int
            let date: String
            let season: Int?
            let status: String
            let statusState: String?
            let homeTeamId: Int?
            let visitorTeamId: Int?
        }

        let id: Int
        let period: Int?
        let player: Identity
        let team: Identity?
        let game: LoggedGame
        let min: String?
        let pts: Double?
        let reb: Double?
        let ast: Double?
        let fg3m: Double?
        let stl: Double?
        let blk: Double?
        let turnover: Double?
        let fga: Double?
        let fgm: Double?
        let fg3a: Double?
        let fta: Double?
        let ftm: Double?

        var played: Bool {
            guard let min, min.range(of: #"^\d+(?:\.\d+|:[0-5]\d)?$"#, options: .regularExpression) != nil else { return false }
            return min.contains { ("1"..."9").contains(String($0)) }
                || [pts, reb, ast, fg3m, stl, blk, turnover, fga, fgm, fg3a, fta, ftm].contains { ($0 ?? 0) > 0 }
        }

        var minutes: Double? {
            guard let min else { return nil }
            let parts = min.split(separator: ":")
            if parts.count == 2, let whole = Double(parts[0]), let seconds = Double(parts[1]), (0..<60).contains(seconds) {
                return whole + seconds / 60
            }
            return Double(min)
        }
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

    struct TeamStats: Decodable {
        let team: Team
        let stats: [String: Double?]
    }

    let game: Game
    let players: [Player]
    let gameOdds: [GameOdds]?
    let issues: [String]
    let oddsMode: CourtResearchMode
    let historical: Bool
    let sampleSeason: Int?
    let teamStats: [TeamStats]?
    let teamStatsSeason: Int?
    let starters: [Int]?
    let fetchedAt: String?
    let researchSnapshot: Snapshot?

    var isFrozen: Bool { researchSnapshot?.frozen == true }
    var observationID: String? { researchSnapshot?.observedAt ?? fetchedAt }
    var tip: Date? { game.datetime.flatMap(SidelineBoard.timestamp) }

    var hasUsableResearch: Bool {
        // The server's frozen snapshot is required at and after tip. If the
        // clock is unknown, fail closed for any non-frozen research.
        if oddsMode == .live { return game.isInProgress || game.isFinal }
        return isFrozen || (!historical && (tip.map { $0 > Date.now } ?? false))
    }
}

struct CourtAPI {
    struct Rank: Decodable {
        let playerId: Int
        let mm: Int
        let marketRank: Int
        let statRank: Int
    }

    private struct Ranking: Decodable {
        let gameId: Int
        let date: String
        let mode: CourtResearchMode
        let market: String
        let book: String
        let snapshotAt: String
        let rows: [Rank]
    }

    private struct Schedule: Decodable {
        let date: String
        let games: [CourtBoard.Game]
    }

    func previewBoard(mode: CourtResearchMode) async throws -> CourtBoard {
        let request = try SlipSurgeHTTP.request(
            host: SlipSurgeHTTP.site,
            path: "/preview/nba/data",
            query: [.init(name: "resource", value: "/the-paint/board"), .init(name: "mode", value: mode.rawValue)],
            timeout: 120
        )
        return try Self.validatedBoard(await SlipSurgeHTTP.send(request), matching: nil, mode: mode)
    }

    func slate(date: String, account: AccountStore, userID: UUID) async throws -> [CourtBoard.Game] {
        let data = try await SlipSurgeHTTP.memberData(
            "/api/mobile/court/schedule", query: [.init(name: "date", value: date)], account: account, userID: userID
        )
        let schedule = try Self.decode(Schedule.self, from: data)
        guard schedule.date == date, schedule.games.count <= 16,
              Set(schedule.games.map(\.id)).count == schedule.games.count,
              schedule.games.allSatisfy({ $0.date == date }) else { throw URLError(.cannotParseResponse) }
        return schedule.games
    }

    func memberBoard(game: CourtBoard.Game, mode: CourtResearchMode, account: AccountStore, userID: UUID) async throws -> CourtBoard {
        let data = try await SlipSurgeHTTP.memberData(
            "/api/mobile/court/board", query: [
                .init(name: "game", value: String(game.id)), .init(name: "slate_date", value: game.date),
                .init(name: "mode", value: mode.rawValue),
            ],
            account: account, userID: userID
        )
        return try Self.validatedBoard(data, matching: game, mode: mode)
    }

    func ranks(board: CourtBoard, market: CourtPlayerMarket, book: String?, scope: CourtView.Scope) async throws -> [Int: Rank] {
        guard let snapshot = board.observationID else { return [:] }
        var query = [
            URLQueryItem(name: "game", value: String(board.game.id)), .init(name: "slate_date", value: board.game.date),
            .init(name: "mode", value: board.oddsMode.rawValue), .init(name: "native_mm", value: market.rawValue),
            .init(name: "book", value: book ?? "all")
        ]
        let data: Data
        switch scope {
        case .preview:
            query.append(.init(name: "resource", value: "/the-paint/board"))
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/preview/nba/data", query: query, timeout: 120)
            data = try await SlipSurgeHTTP.send(request)
        case .member(let account, let userID):
            data = try await SlipSurgeHTTP.memberData("/api/mobile/court/board", query: query, account: account, userID: userID)
        }
        let rank = try Self.decode(Ranking.self, from: data)
        let players = Set(board.players.map(\.id))
        guard rank.gameId == board.game.id, rank.date == board.game.date, rank.mode == board.oddsMode,
              rank.market == market.rawValue, rank.book == (book ?? "all"), rank.snapshotAt == snapshot,
              rank.rows.count <= players.count, Set(rank.rows.map(\.playerId)).count == rank.rows.count,
              rank.rows.allSatisfy({ players.contains($0.playerId) && (1...players.count).contains($0.marketRank) &&
                  (1...players.count).contains($0.statRank) && $0.mm == $0.marketRank - $0.statRank }) else {
            throw URLError(.cannotParseResponse)
        }
        return Dictionary(uniqueKeysWithValues: rank.rows.map { ($0.playerId, $0) })
    }

    private static func validatedBoard(_ data: Data, matching game: CourtBoard.Game?, mode: CourtResearchMode) throws -> CourtBoard {
        let board = try decode(CourtBoard.self, from: data)
        guard board.oddsMode == mode,
              (game.map { $0.id == board.game.id && $0.date == board.game.date } ?? true),
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
