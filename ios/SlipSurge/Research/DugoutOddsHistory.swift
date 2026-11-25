import Foundation

struct DugoutOddsHistory: Decodable {
    struct Capture: Decodable, Identifiable {
        let time: Date
        let odds: Int
        var id: Date { time }

        var implied: Double {
            let price = Double(odds)
            return price > 0 ? 100 / (price + 100) : abs(price) / (abs(price) + 100)
        }
    }

    struct Series: Decodable, Identifiable {
        let playerId: Int
        let market: String
        let book: String
        let line: Double?
        let points: [Capture]

        var id: String { "\(playerId):\(market):\(book):\(line.map { String($0) } ?? "")" }
        var opening: Capture? { points.first }
        var latest: Capture? { points.last }
        var movement: Int { (latest?.odds ?? 0) - (opening?.odds ?? 0) }

        func nearest(to date: Date) -> Capture? {
            points.min { abs($0.time.timeIntervalSince(date)) < abs($1.time.timeIntervalSince(date)) }
        }
    }

    let date: String
    let gameId: Int
    let sourceCount: Int
    let firstPitchAt: String?
    let series: [Series]

    struct Market: Identifiable {
        let id: String
        let label: String

        static let all: [Self] = [
            .init(id: "fhr", label: "First Home Run"), .init(id: "sa", label: "Anytime Home Run"),
            .init(id: "hr2", label: "2+ Home Runs"), .init(id: "hr3", label: "3+ Home Runs"),
            .init(id: "hits", label: "1+ Hit"), .init(id: "hits2", label: "2+ Hits"), .init(id: "hits3", label: "3+ Hits"),
            .init(id: "singles", label: "1+ Single"), .init(id: "singles2", label: "2+ Singles"),
            .init(id: "doubles", label: "1+ Double"), .init(id: "triples", label: "1+ Triple"),
            .init(id: "rbi", label: "1+ RBI"), .init(id: "rbi2", label: "2+ RBI"), .init(id: "rbi3", label: "3+ RBI"),
            .init(id: "runs", label: "1+ Run"), .init(id: "runs2", label: "2+ Runs"),
            .init(id: "hrr", label: "Hits + Runs + RBI"), .init(id: "hrr3", label: "3+ Hits + Runs + RBI"),
            .init(id: "tb", label: "2+ Total Bases"), .init(id: "tb3", label: "3+ Total Bases"),
            .init(id: "tb4", label: "4+ Total Bases"), .init(id: "tb5", label: "5+ Total Bases"),
            .init(id: "stolen_bases", label: "1+ Stolen Base"), .init(id: "stolen_bases2", label: "2+ Stolen Bases"),
            .init(id: "strikeouts", label: "1+ Batter Strikeout"), .init(id: "strikeouts2", label: "2+ Batter Strikeouts"),
            .init(id: "strikeouts3", label: "3+ Batter Strikeouts"),
        ]
    }
}

extension DugoutAPI {
    func oddsHistory(date: String, game: Int) async throws -> DugoutOddsHistory {
        let bytes = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/odds-history", query: [
            .init(name: "date", value: date), .init(name: "gamePk", value: String(game)),
        ], account: account, userID: userID)
        guard bytes.count <= 18_000_000 else { throw URLError(.cannotParseResponse) }
        let decoder = JSONDecoder()
        let formatter = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        decoder.dateDecodingStrategy = .custom { value in
            let container = try value.singleValueContainer()
            let stamp = try container.decode(String.self)
            guard let date = try? formatter.parse(stamp) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid archived capture timestamp")
            }
            return date
        }
        let history = try decoder.decode(DugoutOddsHistory.self, from: bytes)
        guard history.date == date, history.gameId == game, history.sourceCount >= 0,
              Set(history.series.map(\.id)).count == history.series.count else { throw URLError(.cannotParseResponse) }
        return history
    }
}
