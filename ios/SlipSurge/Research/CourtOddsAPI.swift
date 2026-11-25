import SwiftUI

struct CourtOddsAPI {
    struct Identity: Hashable {
        let gameID: Int
        let playerID: Int
    }

    private struct PackedBoard: Decodable {
        struct Player: Decodable {
            let id: Int
            let gameId: Int
            let firstName: String
            let lastName: String
            let position: String?
            let team: CourtBoard.Team
            let headshot: URL?
            let injuryStatus: String?
            let publicPicks: Int?

            var identity: Identity { .init(gameID: gameId, playerID: id) }
        }

        struct Time: Decodable {
            let prefix: Int
            let suffix: String

            init(from decoder: Decoder) throws {
                var values = try decoder.unkeyedContainer()
                prefix = try values.decode(Int.self)
                suffix = try values.decode(String.self)
                guard values.isAtEnd else { throw URLError(.cannotParseResponse) }
            }
        }

        struct Quote: Decodable {
            let identity: Int
            let book: Int
            let line: Double
            let price: Int
            let time: Int
            let opening: Int?
            let openingTime: Int?
            let prior: Int?
            let priorTime: Int?

            init(from decoder: Decoder) throws {
                var values = try decoder.unkeyedContainer()
                identity = try values.decode(Int.self)
                book = try values.decode(Int.self)
                line = try values.decode(Double.self)
                price = try values.decode(Int.self)
                time = try values.decode(Int.self)
                opening = try values.decodeIfPresent(Int.self)
                openingTime = try values.decodeIfPresent(Int.self)
                prior = try values.decodeIfPresent(Int.self)
                priorTime = try values.decodeIfPresent(Int.self)
                guard values.isAtEnd else { throw URLError(.cannotParseResponse) }
            }
        }

        let date: String
        let selectedBook: String
        let books: [String]
        let games: [CourtBoard.Game]
        let players: [Player]
        let identities: [[Int]]
        let quotes: [Quote]
        let prefixes: [String]
        let times: [Time]
        let phaseCheckedAt: Int64
        let stale: Bool?
        let failed: [Int]
        let unavailable: [Int]
        let firstUnavailable: [Int]?
        let captureWarning: [Int]?
        let complete: Bool

        func unpack(date requestedDate: String?, book: String, mode: CourtResearchMode) throws -> ResearchOddsSlate {
            let now = Date.now
            let checked = Date(timeIntervalSince1970: Double(phaseCheckedAt) / 1000)
            let maxAge: TimeInterval = 81
            guard requestedDate.map({ $0 == date }) ?? true, selectedBook == book,
                  games.count <= (requestedDate == nil ? 1 : 16), games.allSatisfy({ $0.date == date }),
                  Set(games.map(\.id)).count == games.count, books.count <= 64, Set(books).count == books.count,
                  identities.count <= 1024, players.count <= 1024, quotes.count <= 12_000,
                  prefixes.count <= 36_000, times.count <= 36_000,
                  checked.timeIntervalSince(now) <= 5, now.timeIntervalSince(checked) < maxAge else {
                throw URLError(.cannotParseResponse)
            }
            let gamesByID = Dictionary(uniqueKeysWithValues: games.map { ($0.id, $0) })
            let roster = try players.reduce(into: [Identity: Player]()) { map, player in
                guard let game = gamesByID[player.gameId],
                      player.id > 0, [game.homeTeam.id, game.visitorTeam.id].contains(player.team.id),
                      map.updateValue(player, forKey: player.identity) == nil else { throw URLError(.cannotParseResponse) }
            }
            let earliestOpen = games.filter { !$0.isFinal && !$0.isInProgress }.compactMap(clock).filter { $0 > now }.min()
            if mode == .pregame && games.compactMap(clock).contains(where: { $0 > checked && $0 <= now }) {
                throw URLError(.resourceUnavailable)
            }

            var decoded: [Identity: [Double: ResearchOddsSlate.Price]] = [:]
            for quote in quotes {
                guard identities.indices.contains(quote.identity), books.indices.contains(quote.book),
                      books[quote.book] == book, quote.line.isFinite, quote.line >= 0,
                      abs(Double(quote.price)) >= 100 else { throw URLError(.cannotParseResponse) }
                let pair = identities[quote.identity]
                guard pair.count == 2 else { throw URLError(.cannotParseResponse) }
                let identity = Identity(gameID: pair[0], playerID: pair[1])
                // The site intentionally omits ineligible roster rows. The matched
                // quote indexes must never be used to manufacture player artwork.
                guard let game = gamesByID[identity.gameID] else { throw URLError(.cannotParseResponse) }
                guard roster[identity] != nil else { continue }
                let observed = try timestamp(quote.time)
                guard let tip = clock(game), observed <= now,
                      mode == .pregame ? observed < tip : observed >= tip else { throw URLError(.resourceUnavailable) }
                let opening = try baseline(quote.opening, index: quote.openingTime, before: observed, earliest: mode == .live ? tip : nil)
                let earlier = try baseline(quote.prior, index: quote.priorTime, before: observed, earliest: mode == .live ? tip : nil)
                let entry = ResearchOddsSlate.Price(line: quote.line, current: quote.price,
                    opening: opening?.price, earlier: earlier?.price, observedAt: observed,
                    openingAt: opening?.stamp, earlierAt: earlier?.stamp)
                guard decoded[identity, default: [:]].updateValue(entry, forKey: quote.line) == nil else {
                    throw URLError(.cannotParseResponse)
                }
            }

            let rows = players.compactMap { player -> ResearchOddsSlate.Player? in
                guard let prices = decoded[player.identity], !prices.isEmpty else { return nil }
                let team = player.team
                let palette = CourtTeamColors.colors(for: team.abbreviation)
                return .init(gameID: String(player.gameId), playerID: player.id, name: "\(player.firstName) \(player.lastName)",
                    team: .init(code: team.abbreviation, name: team.fullName), position: player.position,
                    portraits: player.headshot.map { [$0] } ?? [], logo: team.logo, primary: palette.primary,
                    secondary: palette.secondary, prices: Array(prices.values), status: player.injuryStatus,
                    totalPicks: player.publicPicks)
            }
            let matchups = games.map { ResearchOddsSlate.Game(id: String($0.id), title: title($0)) }
            var notices: [String] = []
            if stale == true { notices.append("Last observed prices") }
            if !complete || !failed.isEmpty || !unavailable.isEmpty { notices.append("Some games have unavailable prices.") }
            if firstUnavailable?.isEmpty == false { notices.append(mode == .live ? "Some first-seen prices are unavailable." : "Some opening prices are unavailable.") }
            if captureWarning?.isEmpty == false { notices.append("Some recorded prices may be out of date.") }
            let needsRefresh = mode == .live || earliestOpen != nil
            let expiry = needsRefresh ? min(earliestOpen ?? .distantFuture, checked.addingTimeInterval(maxAge)) : nil
            return ResearchOddsSlate(games: matchups, players: rows, books: books, notices: notices, expiry: expiry)
        }

        private func clock(_ game: CourtBoard.Game) -> Date? {
            SidelineBoard.timestamp(game.datetime ?? game.status)
        }

        private func title(_ game: CourtBoard.Game) -> String {
            "\(game.visitorTeam.abbreviation) at \(game.homeTeam.abbreviation)"
        }

        private func timestamp(_ index: Int) throws -> Date {
            guard times.indices.contains(index), prefixes.indices.contains(times[index].prefix) else {
                throw URLError(.cannotParseResponse)
            }
            let value = prefixes[times[index].prefix] + times[index].suffix
            guard value.utf8.count <= 64, let date = SidelineBoard.timestamp(value) else { throw URLError(.cannotParseResponse) }
            return date
        }

        private func baseline(_ price: Int?, index: Int?, before current: Date, earliest: Date?) throws -> (price: Int, stamp: Date)? {
            if price == nil && index == nil { return nil }
            guard let price, abs(Double(price)) >= 100, let index else { throw URLError(.cannotParseResponse) }
            let stamp = try timestamp(index)
            return stamp < current && (earliest.map { stamp >= $0 } ?? true) ? (price, stamp) : nil
        }
    }

    func fetch(date: String, market: String, book: String, mode: CourtResearchMode, scope: CourtView.Scope) async throws -> ResearchOddsSlate {
        var query = [
            URLQueryItem(name: "market", value: market), URLQueryItem(name: "book", value: book),
            URLQueryItem(name: "mode", value: mode.rawValue)
        ]
        let data: Data
        let requestedDate: String?
        switch scope {
        case .preview:
            query.append(.init(name: "resource", value: "/the-paint/odds-board"))
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/preview/nba/data", query: query, timeout: 120)
            data = try await SlipSurgeHTTP.send(request)
            requestedDate = nil
        case .member(let account, let userID):
            query.append(.init(name: "date", value: date))
            data = try await SlipSurgeHTTP.memberData("/api/mobile/court/odds-board", query: query, account: account, userID: userID)
            requestedDate = date
        }
        guard data.count <= 2_097_152 else { throw URLError(.cannotParseResponse) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(PackedBoard.self, from: data).unpack(date: requestedDate, book: book, mode: mode)
    }
}
