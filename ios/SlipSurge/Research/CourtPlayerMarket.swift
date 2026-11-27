import Foundation

// Metric names, reference selection and push handling mirror nbaPaint.ts.
enum CourtPlayerMarket: String, CaseIterable, Codable {
    case points, rebounds, assists, threes, steals, blocks, turnovers
    case pointsReboundsAssists = "points_rebounds_assists"
    case pointsRebounds = "points_rebounds"
    case pointsAssists = "points_assists"
    case reboundsAssists = "rebounds_assists"
    case doubleDouble = "double_double"
    case tripleDouble = "triple_double"
    case pointsFirstQuarter = "points_1q"
    case reboundsFirstQuarter = "rebounds_1q"
    case assistsFirstQuarter = "assists_1q"

    enum Side: String, CaseIterable, Codable {
        case over = "Over", under = "Under"
    }

    enum Venue: String, CaseIterable, Codable {
        case all = "All venues", home = "Home", away = "Away"

        func accepts(_ log: CourtBoard.PlayerLog) -> Bool {
            if self == .all { return true }
            guard let id = log.team?.id else { return false }
            return id == (self == .home ? log.game.homeTeamId : log.game.visitorTeamId)
        }
    }

    struct Reference {
        let line: Double
        let vendor: String
        let odds: Int
        let milestone: Bool
    }

    struct HitRate {
        let wins: Int
        let decisions: Int
        let pushes: Int

        var percent: Double? { decisions > 0 ? Double(wins) / Double(decisions) : nil }
    }

    var label: String {
        switch self {
        case .pointsReboundsAssists: "Pts + Reb + Ast"
        case .pointsRebounds: "Pts + Reb"
        case .pointsAssists: "Pts + Ast"
        case .reboundsAssists: "Reb + Ast"
        case .doubleDouble: "Double-double"
        case .tripleDouble: "Triple-double"
        case .pointsFirstQuarter: "First-quarter points"
        case .reboundsFirstQuarter: "First-quarter rebounds"
        case .assistsFirstQuarter: "First-quarter assists"
        default: rawValue.capitalized
        }
    }

    var symbol: String {
        switch self {
        case .points: "basketball"
        case .rebounds: "arrow.uturn.up"
        case .assists: "arrow.turn.up.right"
        case .threes: "3.circle"
        case .steals: "hand.raised"
        case .blocks: "shield"
        case .turnovers: "arrow.left.arrow.right"
        case .pointsReboundsAssists: "square.stack.3d.up"
        case .pointsRebounds, .pointsAssists, .reboundsAssists: "plus.circle"
        case .doubleDouble: "2.circle"
        case .tripleDouble: "3.square"
        case .pointsFirstQuarter, .reboundsFirstQuarter, .assistsFirstQuarter: "1.circle"
        }
    }

    private var fields: [String] {
        switch self {
        case .points, .pointsFirstQuarter: ["pts"]
        case .rebounds, .reboundsFirstQuarter: ["reb"]
        case .assists, .assistsFirstQuarter: ["ast"]
        case .threes: ["fg3m"]
        case .steals: ["stl"]
        case .blocks: ["blk"]
        case .turnovers: ["turnover"]
        case .pointsReboundsAssists: ["pts", "reb", "ast"]
        case .pointsRebounds: ["pts", "reb"]
        case .pointsAssists: ["pts", "ast"]
        case .reboundsAssists: ["reb", "ast"]
        case .doubleDouble, .tripleDouble: ["pts", "reb", "ast", "stl", "blk"]
        }
    }

    var isFirstQuarter: Bool { rawValue.hasSuffix("_1q") }
    var isBinary: Bool { self == .doubleDouble || self == .tripleDouble }

    func average(_ values: [String: Double?]?) -> Double? {
        guard let values else { return nil }
        if isBinary {
            if let count = values[self == .doubleDouble ? "dd2" : "td3"] ?? nil,
               let games = values["gp"] ?? nil, games > 0, count >= 0, count <= games { return count / games }
            return values[rawValue] ?? nil
        }
        if isFirstQuarter { return values[rawValue] ?? nil }
        return sum(fields.map { values[$0] ?? nil })
    }

    func offers(_ player: CourtBoard.Player, gameID: Int, side: Side) -> [Reference] {
        player.props.compactMap { prop -> Reference? in
            guard prop.gameId == gameID, prop.playerId == player.id, prop.propType == rawValue,
                  let line = Double(prop.lineValue), (0...1000).contains(line) else { return nil }
            let milestone = prop.market.type == "milestone"
            guard milestone || prop.market.type == "over_under" else { return nil }
            let price = milestone ? (side == .over ? prop.market.odds : nil) :
                (side == .over ? prop.market.overOdds : prop.market.underOdds)
            guard let price, abs(Double(price)) >= 100 else { return nil }
            return Reference(line: line, vendor: prop.vendor, odds: price, milestone: milestone)
        }
    }

    func reference(_ player: CourtBoard.Player, gameID: Int, vendor: String?, side: Side,
        contract: CourtLinkContext.Contract? = nil, target: Double? = nil) -> Reference? {
        let offers = offers(player, gameID: gameID, side: side).filter {
            (contract == nil || $0.milestone == (contract == .milestone)) && (target == nil || $0.line == target)
        }
        let matching = offers.filter { vendor == nil || $0.vendor == vendor }
        if isBinary {
            return matching.filter { $0.line == 0.5 || ($0.milestone && $0.line == 1) }
                .max { $0.odds < $1.odds }
        }

        let milestones = matching.filter { $0.milestone && $0.line > 0 && abs(Double($0.odds)) >= 100 }
        if let balanced = milestones.min(by: balancedReference) { return balanced }

        let standard = matching.filter { !$0.milestone }
        if standard.isEmpty {
            return isFirstQuarter ? matching.filter(\.milestone).min(by: balancedReference) : nil
        }

        let counts = Dictionary(grouping: offers.filter { !$0.milestone }, by: \.line).mapValues(\.count)
        guard let common = counts.min(by: { lhs, rhs in
            lhs.value == rhs.value ? lhs.key < rhs.key : lhs.value > rhs.value
        })?.key else { return nil }
        let candidates = vendor == nil ? standard.filter { $0.line == common } : standard
        return candidates.min { lhs, rhs in
            let left = abs(lhs.line - common), right = abs(rhs.line - common)
            return left == right ? lhs.odds > rhs.odds : left < right
        }
    }

    private func balancedReference(_ lhs: Reference, _ rhs: Reference) -> Bool {
        let left = abs(abs(Double(lhs.odds)) - 100), right = abs(abs(Double(rhs.odds)) - 100)
        if left != right { return left < right }
        if lhs.line != rhs.line { return lhs.line < rhs.line }
        return lhs.odds > rhs.odds
    }

    func target(_ reference: Reference, side: Side) -> String {
        if isBinary { return side == .over ? "Yes" : "No" }
        if reference.milestone { return "\(reference.line.formatted())+" }
        return "\(side == .over ? "O" : "U") \(reference.line.formatted())"
    }

    func history(_ player: CourtBoard.Player, board: CourtBoard) -> [CourtBoard.PlayerLog] {
        history(player, game: board.game, sampleSeason: board.sampleSeason)
    }

    func history(_ player: CourtBoard.Player, game: CourtBoard.Game, sampleSeason: Int?) -> [CourtBoard.PlayerLog] {
        guard let season = sampleSeason else { return [] }
        let logs = (isFirstQuarter ? player.periodLogs : player.logs) ?? []
        return Dictionary(logs.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last }).values
            .filter { log in
                log.player.id == player.id && log.game.id != game.id &&
                log.game.season == season && String(log.game.date.prefix(10)) < game.date &&
                (log.game.statusState == "final" || log.game.status == "Final") &&
                (log.period ?? 0) == (isFirstQuarter ? 1 : 0) && log.played
            }
            .sorted { lhs, rhs in
                lhs.game.date == rhs.game.date ? lhs.game.id > rhs.game.id : lhs.game.date > rhs.game.date
            }
    }

    func rate(_ logs: ArraySlice<CourtBoard.PlayerLog>, against reference: Reference, side: Side) -> HitRate {
        let values = logs.compactMap(statistic)
        let pushes = reference.milestone ? 0 : values.count { $0 == reference.line }
        let wins = values.count { value in
            if reference.milestone { return value >= reference.line }
            return side == .over ? value > reference.line : value < reference.line
        }
        return HitRate(wins: wins, decisions: values.count - pushes, pushes: pushes)
    }

    func statistic(_ log: CourtBoard.PlayerLog) -> Double? {
        let stats = ["pts": log.pts, "reb": log.reb, "ast": log.ast, "fg3m": log.fg3m,
                     "stl": log.stl, "blk": log.blk, "turnover": log.turnover]
        let values = fields.map { stats[$0] ?? nil }
        if !isBinary { return sum(values) }
        let needed = self == .doubleDouble ? 2 : 3
        let successes = values.count { ($0 ?? 0) >= 10 }
        let unknown = values.count { $0 == nil || ($0 ?? 0) < 0 }
        if successes >= needed { return 1 }
        return successes + unknown >= needed ? nil : 0
    }

    private func sum(_ fields: [Double?]) -> Double? {
        let valid = fields.compactMap { $0 }.filter { $0.isFinite && $0 >= 0 }
        return valid.count == fields.count ? valid.reduce(0, +) : nil
    }
}
