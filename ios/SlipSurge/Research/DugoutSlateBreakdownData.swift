import Foundation
import SwiftUI

struct DugoutSlateBreakdownData: Decodable {
    enum Side: String, CaseIterable, Identifiable {
        case away, home
        var id: Self { self }
    }

    struct Game: Decodable, Identifiable {
        let id: Int
        let key: String
        let startsAt: String
        let status: String
        let locked: Bool
        let away: DugoutBoard.Team
        let home: DugoutBoard.Team

        var label: String { "\(away.name) at \(home.name)" }
        var title: String { "\(away.code) at \(home.code)" }
        func team(_ side: Side) -> DugoutBoard.Team { side == .away ? away : home }
        func opposition(_ side: Side) -> DugoutBoard.Team { side == .away ? home : away }
    }

    struct Starter: Decodable {
        let id: Int
        let name: String
        let hand: String?
        let headshot: URL?
    }

    struct Batter: Decodable, Identifiable {
        let id: Int
        let name: String
        let position: String?
        let bats: String?
        let order: Int
        let projected: Bool?
        let headshot: URL?
    }

    struct Roster: Decodable {
        let awayStarter: Starter?
        let homeStarter: Starter?
        let awayLineupConfirmed: Bool
        let homeLineupConfirmed: Bool
        let awayLineup: [Batter]
        let homeLineup: [Batter]

        func starter(_ side: Side) -> Starter? { side == .away ? awayStarter : homeStarter }
        func opponents(_ side: Side) -> [Batter] { side == .away ? homeLineup : awayLineup }
        func confirmed(_ side: Side) -> Bool { side == .away ? homeLineupConfirmed : awayLineupConfirmed }
    }

    struct Archive: Decodable {
        let live: Bool
        let unavailable: Bool
        let frozen: Bool?
        let observedAt: String?
        let startAt: String?

        var label: String {
            if live { return "Live research" }
            if unavailable { return "Pregame archive unavailable" }
            return frozen == true ? "Frozen at first pitch" : "Pregame"
        }
    }

    struct Matchup: Decodable {
        let game: Game
        let archive: Archive
        let pitches: [String: DugoutProfile.PitchKind]
        let roster: Roster?
        func pitch(_ code: String) -> DugoutProfile.PitchKind { pitches[code] ?? .init(label: code, color: "#95A5A6") }
    }

    struct Sample: Decodable {
        struct Value: Decodable {
            let rows: [DugoutPlayerPitchLog.Row]?
            let pitcherIds: [Int]?
        }
        let archive: Archive
        let sample: Value?
    }

    let date: String
    let games: [Game]
    let paused: Bool?
    let liveUnavailable: Bool?
}

struct DugoutSlateBreakdownAPI {
    let account: AccountStore
    let userID: UUID

    func games(date: String, mode: DugoutMode) async throws -> DugoutSlateBreakdownData {
        try await read(date: date, mode: mode, view: "games")
    }

    func matchup(date: String, mode: DugoutMode, game: Int) async throws -> DugoutSlateBreakdownData.Matchup {
        try await read(date: date, mode: mode, view: "matchup", game: game)
    }

    func sample(date: String, mode: DugoutMode, game: Int, side: DugoutSlateBreakdownData.Side,
        view: String, batter: Int? = nil) async throws -> DugoutSlateBreakdownData.Sample {
        try await read(date: date, mode: mode, view: view, game: game, side: side, batter: batter)
    }

    private func read<Response: Decodable>(date: String, mode: DugoutMode, view: String, game: Int? = nil,
        side: DugoutSlateBreakdownData.Side? = nil, batter: Int? = nil) async throws -> Response {
        var query: [URLQueryItem] = [.init(name: "date", value: date), .init(name: "mode", value: mode.rawValue),
            .init(name: "view", value: view)]
        if let game { query.append(.init(name: "game", value: String(game))) }
        if let side { query.append(.init(name: "side", value: side.rawValue)) }
        if let batter { query.append(.init(name: "batter", value: String(batter))) }
        let payload = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/slate-breakdown", query: query, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(Response.self, from: payload)
    }
}
