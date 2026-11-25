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

        init(from decoder: Decoder) throws {
            var row = try decoder.unkeyedContainer()
            game = try row.decode(String.self)
            abbreviation = try row.decode(String.self)
            _ = try row.decode(String.self) // Primary team color
            _ = try row.decode(String.self) // Secondary team color
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

    private static func timestamp(_ value: String) -> Date? {
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
    func board(for selection: OddsSelection) async throws -> SidelineBoard {
        var url = URLComponents()
        url.scheme = "https"
        url.host = "www.slipsurge.com"
        url.path = "/preview/nfl/data"
        url.queryItems = [
            URLQueryItem(name: "resource", value: "/api/the-sideline/odds-board"),
            URLQueryItem(name: "market", value: selection.market),
            URLQueryItem(name: "book", value: selection.book)
        ]
        guard let endpoint = url.url else { throw URLError(.badURL) }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 120)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let session = URLSession(configuration: .ephemeral)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.url?.host == url.host, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let board = try JSONDecoder().decode(SidelineBoard.self, from: data)
        guard board.market == selection.market, board.book == selection.book,
              board.games.count <= 1,
              board.quotes.allSatisfy({ quote in
                  quote.id.player.game == board.games.first?.id &&
                  quote.id.market == selection.market && quote.id.book == selection.book
              }),
              Set(board.quotes.map(\.id)).count == board.quotes.count else {
            throw URLError(.cannotParseResponse)
        }
        return board
    }
}
