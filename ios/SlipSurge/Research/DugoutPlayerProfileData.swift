import Foundation
import SwiftUI

typealias DugoutPlayerStats = [String: DugoutPlayerStat]

enum DugoutPlayerStat: Decodable, Sendable {
    case number(Double)
    case text(String)
    case flag(Bool)
    case unavailable

    init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let number = try? value.decode(Double.self) {
            self = .number(number)
        } else if let text = try? value.decode(String.self) {
            self = .text(text)
        } else if let flag = try? value.decode(Bool.self) {
            self = .flag(flag)
        } else {
            self = .unavailable
        }
    }

    var number: Double? {
        switch self {
        case .number(let value): value
        case .text(let value): Double(value)
        default: nil
        }
    }

    var text: String? {
        switch self {
        case .number(let value): value.formatted(.number.grouping(.never))
        case .text(let value): value
        case .flag(let value): value ? "Yes" : "No"
        case .unavailable: nil
        }
    }
}

struct DugoutProfile: Decodable {
    enum Role: String, CaseIterable, Decodable, Identifiable {
        case batter, pitcher
        var id: Self { self }
        var title: String { self == .batter ? "Hitting" : "Pitching" }
        var statcastKey: String { self == .batter ? "hitting" : "pitching" }
        var statsKey: String { self == .batter ? "batting" : "pitching" }
    }

    struct Player: Decodable {
        let mlbId: Int
        let fullName: String?
        let primaryPosition: String?
        let currentTeamId: Int?
        let batSide: String?
        let pitchHand: String?
        let height: String?
        let weight: Int?
        let mlbDebut: String?
    }

    struct Team: Decodable {
        let code: String
        let name: String
        let logo: URL?
        let primary: String?
        let secondary: String?
        var color: Color { Color(hex: primary) ?? .blue }
        var secondaryColor: Color { Color(hex: secondary) ?? color }
    }

    struct PitchKind: Decodable {
        let label: String
        let color: String
    }

    struct Form: Decodable {
        let season: DugoutPlayerStats
        let recency: DugoutPlayerStats
    }

    struct Fielding: Decodable {
        let position: String?
        let category: String?
        let metrics: DugoutPlayerStats
    }

    struct Split: Decodable {
        let dims: DugoutPlayerStats
        let metrics: DugoutPlayerStats
    }

    struct SplitWindow: Decodable {
        let season: [Split]
        let recency: [Split]
    }

    let season: Int
    let player: Player
    let headshot: URL?
    let team: Team?
    let isBatter: Bool?
    let isPitcher: Bool?
    let seasonStats: [String: DugoutPlayerStats?]
    let careerStats: [String: DugoutPlayerStats?]
    let statcastSeason: [String: [String: DugoutPlayerStats]]
    let fielding: [Fielding]
    let baserunning: [String: DugoutPlayerStats]
    let pitchArsenal: [String: [DugoutPlayerStats]]
    let form: [String: Form]
    let splits: [String: [String: SplitWindow]]
    let swingTake: [String: [Split]]
    let battingStance: SplitWindow?
    let homeRuns: [String: [DugoutPlayerStats]]
    let leaguePools: [String: [String: [Double]]]
    let pitches: [String: PitchKind]
    let teams: [String: Team]
    let opponents: [String: URL]

    var name: String { player.fullName ?? "Player \(player.mlbId)" }
    var roles: [Role] { Role.allCases.filter { $0 == .batter ? isBatter == true : isPitcher == true } }
    var accent: Color { team?.color ?? .blue }

    func pitch(_ code: String) -> PitchKind { pitches[code] ?? .init(label: code, color: "#95A5A6") }
}

struct DugoutPlayerProfileAPI {
    let account: AccountStore
    let userID: UUID

    func profile(_ id: Int) async throws -> DugoutProfile {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(DugoutProfile.self, from: await data(id, "profile"))
    }

    func log(_ id: Int, kind: DugoutPlayerPitchLog.Kind) async throws -> DugoutPlayerPitchLog {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(DugoutPlayerPitchLog.self, from: await data(id, kind.rawValue))
    }

    func today(_ id: Int) async throws -> DugoutPlayerPitchLog.Today? {
        struct TodayResponse: Decodable { let context: DugoutPlayerPitchLog.Today? }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(TodayResponse.self, from: await data(id, "today")).context
    }

    private func data(_ id: Int, _ view: String) async throws -> Data {
        try await SlipSurgeHTTP.memberData("/api/mobile/dugout/player",
            query: [.init(name: "id", value: String(id)), .init(name: "view", value: view)],
            account: account, userID: userID)
    }
}

struct DugoutPlayerPitchLog: Decodable {
    enum Kind: String {
        case batting, pitching, spray
        var title: String {
            switch self {
            case .batting: "Matchup Explorer"
            case .pitching: "Zone Profile"
            case .spray: "Spray Chart"
            }
        }
    }

    struct Today: Decodable {
        struct Starter: Decodable { let id: Int; let name: String }
        struct Batter: Decodable { let mlbId: Int }
        let role: DugoutProfile.Role
        let opponentTeam: String
        let opponentTeamName: String
        let opponentPitcher: Starter?
        let opponentLineup: [Batter]
        let lineupConfirmed: Bool
    }

    struct Row: Decodable, Sendable {
        let gamePk: DugoutPlayerStat
        let gameDate: String
        let opponentId: Int
        let opponentName: String
        let opponentTeam: String?
        let venueName: String?
        let venueId: Int?
        let parkKey: String?
        let homeTeam: String?
        let pitchType: String?
        let stand: String?
        let pThrows: String?
        let zone: Int?
        let plateX: Double?
        let plateZ: Double?
        let dayNight: String?
        let inning: Int?
        let isInPlay: Bool?
        let isSwing: Bool?
        let isWhiff: Bool?
        let isHomeRun: Bool?
        let isNearHr: Bool?
        let parksHrCount: Int?
        let events: String?
        let description: String?
        let launchSpeed: Double?
        let launchAngle: Double?
        let launchSpeedAngle: Int?
        let batSpeed: Double?
        let attackAngle: Double?
        let swingLength: Double?
        let swingPathTilt: Double?
        let attackDirection: Double?
        let hitDistance: Double?
        let hcX: Double?
        let hcY: Double?
        let xwoba: Double?
        let runValue: Double?
        let velocity: Double?
        let spinRate: Double?
        let balls: Int?
        let strikes: Int?

        var pitchCount: String? {
            guard let balls, let strikes else { return nil }
            return "\(balls)–\(strikes)"
        }
    }

    struct Park: Decodable {
        let name: String
        let team: DugoutBoard.Team?
        let shape: DugoutParkShape?
    }

    let rows: [Row]
    let nearHrAvailable: Bool
    let opponents: [String: URL]
    let parks: [String: Park]?
}

struct DugoutProfileMetric: Identifiable {
    enum Style {
        case integer, decimal(Int), percent, fraction, speed, distance, degrees
    }

    let id: String
    let label: String
    var style: Style = .integer
    var lowerIsBetter = false

    func format(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        switch style {
        case .integer: return value.formatted(.number.precision(.fractionLength(0)))
        case .decimal(let digits): return value.formatted(.number.precision(.fractionLength(digits)))
        case .percent: return ResearchFormat.decimal(value, suffix: "%")
        case .fraction: return ResearchFormat.decimal(value * 100, suffix: "%")
        case .speed: return ResearchFormat.decimal(value, suffix: " mph")
        case .distance: return ResearchFormat.decimal(value, suffix: " ft")
        case .degrees: return ResearchFormat.decimal(value, suffix: "°")
        }
    }

    func value(_ stats: DugoutPlayerStats?, tone: Color? = nil) -> ResearchToolValues.Value {
        .init(label: label, text: format(stats?[id]?.number), tone: tone)
    }
}

func dugoutProfileWord(_ key: String) -> String {
    key.replacingOccurrences(of: "_", with: " ").capitalized
}
