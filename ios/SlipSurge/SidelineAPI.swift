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
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

struct OddsSelection: Equatable {
    var market = "receiving_yards"
    var book = "fanduel"
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
              gameIDs.count == board.games.count,
              board.quotes.allSatisfy({ quote in
                  gameIDs.contains(quote.id.player.game) &&
                  quote.id.market == selection.market && quote.id.book == selection.book
              }),
              Set(board.quotes.map(\.id)).count == board.quotes.count else {
            throw URLError(.cannotParseResponse)
        }
        return board
    }
}
