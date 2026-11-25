import Foundation
import SwiftUI

enum DugoutMode: String, CaseIterable, Decodable {
    case pregame, live
}

enum DugoutWindow: String, CaseIterable {
    case l1, l3, l5, l10, season

    static let form: [Self] = [.l1, .l3, .l5, .l10]
    var title: String { self == .season ? "Season" : rawValue.uppercased() }
}

struct DugoutBoard: Decodable {
    struct Team: Decodable {
        let code: String
        let name: String
        let score: Int?
        let logo: URL?
        let primary: String?
        let secondary: String?

        var color: Color { Color(hex: primary) ?? .blue }
        var secondaryColor: Color { Color(hex: secondary) ?? color }
        var matchup: ResearchMatchup.Team { .init(name: code, logo: logo, color: color, secondary: secondaryColor) }
    }

    struct Snapshot: Decodable {
        let unavailable: Bool?
        let frozen: Bool?
        let observedAt: String?
        let startAt: String?
    }

    struct Market: Decodable, Identifiable {
        struct Quote: Decodable, Identifiable {
            let book: String
            let price: Int?
            let opening: Int?
            let line: Double?
            var id: String { book }
        }

        let key: String
        let label: String
        let quotes: [Quote]
        var id: String { key }
    }

    struct Batter: Decodable, Identifiable {
        struct Crowd: Decodable {
            struct Movement: Decodable {
                let previous: Int?
                let delta: Int?
                let capturedAt: String
            }
            let count: Int
            let movement: Movement?
        }

        struct Cost: Decodable {
            let homeRunVsSeason: Double?
            let firstHomeRunVsSeason: Double?
            let power: Bool
        }

        struct Matrix: Decodable, Identifiable {
            let id: String
            let name: String
            let color: String?
        }

        struct Mechanics: Decodable {
            let index: Double?
            let rank: Int?
            let confidence: Double?
            let trend: Double?
        }

        let id: Int
        let name: String
        let team: String
        let order: Int
        let position: String
        let bats: String
        let projected: Bool
        let headshot: URL
        let markets: [Market]
        let outcome: [String: Double?]?
        let matrixMatches: [Matrix]
        let mm: [String: Int?]?
        let bookRank: [String: Int?]?
        let paperRank: [String: Int?]?
        let statcast: [String: [String: Double?]]?
        let mechanics: [String: Mechanics]?
        let crowd: [String: Crowd]?
        let cost: Cost?

        func mismatch(_ window: DugoutWindow) -> Int? { mm?[window.rawValue] ?? nil }
        func bookRanking(_ window: DugoutWindow) -> Int? { bookRank?[window.rawValue] ?? nil }
        func paperRanking(_ window: DugoutWindow) -> Int? { paperRank?[window.rawValue] ?? nil }
        func stat(_ field: String, window: DugoutWindow) -> Double? { statcast?[window.rawValue]?[field] ?? nil }
    }

    struct Pitcher: Decodable, Identifiable {
        let id: Int
        let name: String
        let hand: String
        let headshot: URL
        let markets: [Market]
    }

    struct Game: Decodable, Identifiable {
        struct NoHomeRun: Decodable {
            let fanduel: Int
            let openingFanduel: Int?
        }

        let id: Int
        let key: String
        let number: Int
        let startsAt: String
        let locked: Bool
        let status: String
        let detailedStatus: String
        let isVoid: Bool
        let venue: String
        let snapshot: Snapshot
        let away: Team
        let home: Team
        let awayLineup: [Batter]
        let homeLineup: [Batter]
        let awayLineupConfirmed: Bool
        let homeLineupConfirmed: Bool
        let awayPitcher: Pitcher?
        let homePitcher: Pitcher?
        let noHr: NoHomeRun?

        var batters: [Batter] { awayLineup + homeLineup }

        func statusLabel(doubleheader: Bool = false) -> String {
            let label: String
            if status == "Preview", !isVoid, let date = Self.timestamp(startsAt) {
                var style = Date.FormatStyle().hour().minute()
                style.timeZone = SlateDate.zone
                label = "\(date.formatted(style)) ET"
            } else {
                label = detailedStatus.isEmpty ? status : detailedStatus
            }
            return doubleheader || number > 1 ? "Game \(number) · \(label)" : label
        }

        func team(for batter: Batter) -> Team { batter.team == home.code ? home : away }
        func opponentPitcher(for batter: Batter) -> Pitcher? { batter.team == home.code ? awayPitcher : homePitcher }

        private static func timestamp(_ value: String) -> Date? {
            let formatter = ISO8601DateFormatter()
            if let date = formatter.date(from: value) { return date }
            formatter.formatOptions.insert(.withFractionalSeconds)
            return formatter.date(from: value)
        }
    }

    let date: String
    let mode: DugoutMode
    let games: [Game]
    let publicAccess: Bool?
    let batterCostAccess: Bool?
}

struct DugoutAPI {
    let account: AccountStore
    let userID: UUID
    private static let path = "/api/mobile/dugout"

    func watchTarget(date: Date, game: Int, player: Int) -> DugoutWatchTarget {
        .init(api: .init(account: account, userID: userID), date: SlateDate.key(date), game: game, player: player)
    }

    func available() async throws -> Bool {
        struct Access: Decodable { let allowed: Bool }
        let data = try await SlipSurgeHTTP.memberData(Self.path, query: [.init(name: "view", value: "access")],
            account: account, userID: userID)
        return try JSONDecoder().decode(Access.self, from: data).allowed
    }

    func board(date: String, mode: DugoutMode) async throws -> DugoutBoard {
        let data = try await SlipSurgeHTTP.memberData(Self.path, query: [
            .init(name: "date", value: date), .init(name: "mode", value: mode.rawValue),
        ], account: account, userID: userID)
        let board = try JSONDecoder().decode(DugoutBoard.self, from: data)
        guard board.date == date, board.mode == mode else { throw URLError(.cannotParseResponse) }
        return board
    }
}
