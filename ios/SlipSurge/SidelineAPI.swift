import Foundation

struct SidelineBoard: Decodable {
    struct Game: Decodable, Identifiable {
        let id: String
        let away: String
        let home: String
        let status: String
    }

    struct Team: Decodable {
        let game: String
        let abbreviation: String
        let logo: URL?
        let primary: String
        let secondary: String

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            game = try row.decode(String.self)
            abbreviation = try row.decode(String.self)
            primary = try row.decode(String.self)
            secondary = try row.decode(String.self)
            logo = try row.decodeIfPresent(URL.self)
        }
    }

    struct Portrait: Decodable {
        let player: PlayerIdentity
        let urls: [URL]

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            player = try PlayerIdentity(from: &row)
            let primary = try row.decodeIfPresent(URL.self)
            let fallbacks = try row.decode([URL].self)
            urls = (primary.map { [$0] } ?? []) + fallbacks
        }
    }

    struct PlayerIdentity: Hashable {
        let game: String
        let id: Int
        let name: String
        let team: String

        init(from row: inout UnkeyedDecodingContainer) throws {
            game = try row.decode(String.self)
            id = try row.decode(Int.self)
            name = try row.decode(String.self)
            team = try row.decode(String.self)
        }
    }

    struct Quote: Decodable, Identifiable {
        struct ID: Hashable {
            let player: PlayerIdentity
            let market: String
            let book: String
            let line: Double
        }

        let id: ID
        let position: String
        let price: Int
        let observedAt: Date
        let previousPrice: Int?
        let previousObservedAt: Date?
        let openingPrice: Int?
        let openingConflict: Bool

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            let player = try PlayerIdentity(from: &row)
            position = try row.decode(String.self)
            let market = try row.decode(String.self)
            let book = try row.decode(String.self)
            let line = try row.decode(Double.self)
            id = ID(player: player, market: market, book: book, line: line)
            price = try row.decode(Int.self)
            let timestamp = try row.decode(String.self)
            guard let date = SidelineBoard.timestamp(timestamp) else {
                throw DecodingError.dataCorruptedError(in: row, debugDescription: "Invalid odds observation timestamp")
            }
            observedAt = date
            let prior = row.isAtEnd ? nil : try row.decodeIfPresent(Int.self)
            let priorDate = row.isAtEnd ? nil : try row.decodeIfPresent(String.self)
            previousObservedAt = priorDate.flatMap(SidelineBoard.timestamp).flatMap { $0 < date ? $0 : nil }
            previousPrice = previousObservedAt == nil ? nil : prior
            openingPrice = row.isAtEnd ? nil : try row.decodeIfPresent(Int.self)
            openingConflict = row.isAtEnd ? false : try row.decode(Bool.self)
        }
    }

    struct Final: Decodable {
        let game: String
        let playerID: Int
        let team: String
        let value: Double

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            game = try row.decode(String.self)
            playerID = try row.decode(Int.self)
            team = try row.decode(String.self)
            value = try row.decode(Double.self)
        }
    }

    struct Picks: Decodable {
        let game: String
        let playerID: Int
        let team: String
        let market: String
        let book: String
        let line: Double
        let count: Int
        let estimated: Bool

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            game = try row.decode(String.self)
            playerID = try row.decode(Int.self)
            team = try row.decode(String.self)
            market = try row.decode(String.self)
            book = try row.decode(String.self)
            line = try row.decode(Double.self)
            count = try row.decode(Int.self)
            estimated = try row.decode(Bool.self)
        }
    }

    let date: String
    let market: String
    let book: String
    let phaseToken: String
    let phaseObservedAt: String
    let availabilityObservedAt: String
    let nextStart: String?
    let games: [Game]
    let markets: [String]
    let books: [String]
    let quotes: [Quote]
    let identities: [Portrait]
    let teams: [Team]
    let availabilityUnavailable: [String]
    let finals: [Final]?
    let picks: [Picks]?
    let resultsPending: Bool?
    let resultsUnavailable: [String]?

    func refreshDeadline() throws -> Date? {
        guard phaseToken.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let observation = Self.timestamp(phaseObservedAt), observation <= .now else {
            throw URLError(.cannotParseResponse)
        }
        guard let nextStart else { return nil }
        guard let start = Self.timestamp(nextStart),
              let availability = Self.timestamp(availabilityObservedAt), availability <= .now else {
            throw URLError(.cannotParseResponse)
        }
        let deadline = min(start, observation.addingTimeInterval(48), availability.addingTimeInterval(90))
        guard deadline > .now else { throw URLError(.resourceUnavailable) }
        return deadline
    }

    static func timestamp(_ value: String) -> Date? {
        timestampParser.parse(value)
    }

    private static let timestampParser = TimestampParser()

    private final class TimestampParser: @unchecked Sendable {
        private let lock = NSLock()
        private let fractional: ISO8601DateFormatter = {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter
        }()
        private let standard = ISO8601DateFormatter()

        func parse(_ value: String) -> Date? {
            lock.withLock { fractional.date(from: value) ?? standard.date(from: value) }
        }
    }
}

struct OddsSelection: Equatable {
    var market = "receiving_yards"
    var book = "fanduel"
}

struct SidelineSchedule: Decodable {
    struct Team: Decodable {
        let abbreviation: String
        let name: String
        let logo: URL?
        let color: String
        let secondary: String?
    }

    struct Game: Decodable, Identifiable {
        let id: String
        let kickoff: String?
        let away: Team
        let home: Team
    }

    let date: String
    let games: [Game]
}

struct SidelineAPI {
    enum Scope {
        case featured
        case member(AccountStore, UUID)
    }

    var scope: Scope = .featured

    var isFeatured: Bool {
        if case .featured = scope { return true }
        return false
    }

    func schedule(date: String?, game: String? = nil) async throws -> SidelineSchedule {
        guard case .member(let account, let userID) = scope else { throw URLError(.userAuthenticationRequired) }
        var query = date.map { [URLQueryItem(name: "date", value: $0)] } ?? []
        if let game { query.append(.init(name: "game", value: game)) }
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/sideline/schedule", query: query, account: account, userID: userID)
        let schedule = try JSONDecoder().decode(SidelineSchedule.self, from: data)
        guard let parsed = SlateDate.fromKey(schedule.date), SlateDate.key(parsed) == schedule.date,
              (date == nil || date == schedule.date), schedule.games.count <= 24,
              Set(schedule.games.map(\.id)).count == schedule.games.count else { throw URLError(.cannotParseResponse) }
        return schedule
    }

    struct MarketObservation {
        let offers: [GameMarketBook]
        let cutoff: Date?
    }

    func gameMarkets(gameID: String, date: String) async throws -> MarketObservation {
        struct Payload: Decodable {
            struct Odds: Decodable {
                let gameLines: [GameMarketBook]
                let availabilityCutoffAt: String?
            }
            let odds: Odds
        }
        let data = try await marketData(gameID: gameID, date: date)
        let payload = try JSONDecoder().decode(Payload.self, from: data)
        return MarketObservation(offers: payload.odds.gameLines, cutoff: payload.odds.availabilityCutoffAt.flatMap(SidelineBoard.timestamp))
    }

    func marketData(gameID: String, date: String) async throws -> Data {
        var query: [URLQueryItem] = [.init(name: "game", value: gameID), .init(name: "date", value: date), .init(name: "summary", value: "1")]
        let data: Data
        switch scope {
        case .featured:
            query.append(.init(name: "resource", value: "/the-sideline/market"))
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/preview/nfl/data", query: query, timeout: 120)
            data = try await SlipSurgeHTTP.send(request)
        case .member(let account, let userID):
            data = try await SlipSurgeHTTP.memberData(
                "/api/mobile/sideline/market", query: query, account: account, userID: userID
            )
        }
        guard data.count <= 4_194_304 else { throw URLError(.cannotParseResponse) }
        return data
    }

    func board(for selection: OddsSelection, date: String) async throws -> SidelineBoard {
        let resource = "/api/the-sideline/odds-board"
        let filters = [
            URLQueryItem(name: "market", value: selection.market),
            URLQueryItem(name: "book", value: selection.book)
        ]
        let board: SidelineBoard
        switch scope {
        case .featured:
            board = try await SlipSurgeHTTP.get(
                "/preview/nfl/data", query: [URLQueryItem(name: "resource", value: resource)] + filters
            )
        case .member(let account, let userID):
            let query = [URLQueryItem(name: "date", value: date)] + filters
            let data = try await SlipSurgeHTTP.memberData(resource, query: query, account: account, userID: userID)
            board = try JSONDecoder().decode(SidelineBoard.self, from: data)
        }

        let gameIDs = Set(board.games.map(\.id))
        guard board.market == selection.market, board.book == selection.book,
              (isFeatured ? board.games.count <= 1 : board.date == date && board.games.count <= 24),
              gameIDs.count == board.games.count, board.quotes.count <= 5_000,
              board.quotes.allSatisfy({ quote in
                  gameIDs.contains(quote.id.player.game) &&
                  quote.id.market == selection.market && quote.id.book == selection.book &&
                  quote.id.line.isFinite && quote.id.line >= 0 && abs(Double(quote.price)) >= 100
              }),
              Set(board.quotes.map(\.id)).count == board.quotes.count else {
            throw URLError(.cannotParseResponse)
        }
        return board
    }
}
