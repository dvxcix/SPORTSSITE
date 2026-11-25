import Foundation

enum SidelineStatMode: String, CaseIterable {
    case gameDay = "Game Day", usage = "Usage", tracking = "Tracking", team = "Team"
    case all = "All", custom = "Custom", matchup = "Matchup Lab"
}

enum SidelineStatWindow: String, CaseIterable {
    case season, l1, l3, l5, l10

    var label: String { self == .season ? "Season" : "L" + rawValue.dropFirst() }
}

struct SidelineStatColumn: Identifiable {
    enum Category: String { case core = "Core", usage = "Usage", tracking = "Tracking", team = "Team" }
    enum Unit {
        case count, decimal, percent, seconds

        func format(_ value: Double) -> String {
            switch self {
            case .count: value.formatted(.number.precision(.fractionLength(0)))
            case .decimal: value.formatted(.number.precision(.fractionLength(0...1)))
            case .percent: value.formatted(.number.precision(.fractionLength(0...1))) + "%"
            case .seconds: value.formatted(.number.precision(.fractionLength(2))) + " s"
            }
        }
    }

    let id: String
    let label: String
    let category: Category
    let unit: Unit
    var lowerIsBetter: Bool

    init(_ id: String, _ label: String, _ category: Category, _ unit: Unit = .count, lowerIsBetter: Bool = false) {
        self.id = id
        self.label = label
        self.category = category
        self.unit = unit
        self.lowerIsBetter = lowerIsBetter
    }

    static let columns: [Self] = [
        .init("score", "SlipSurge Score", .core, .decimal), .init("mm", "MM", .core),
        .init("volume", "Volume", .core), .init("geometry", "Route score", .core),
        .init("redZone", "Score zone", .core), .init("breakaway", "Breakaway", .core),
        .init("evidence", "Sample confidence", .core),
        .init("roleOpps", "Opportunities", .usage), .init("roleShare", "Role share", .usage, .percent),
        .init("roleYards", "Role yards", .usage), .init("targets", "Targets", .usage),
        .init("targetShare", "Target share", .usage, .percent), .init("receptions", "Receptions", .usage),
        .init("carries", "Carries", .usage), .init("carryShare", "Carry share", .usage, .percent),
        .init("redZoneLooks", "Red-zone looks", .usage), .init("redZoneTargets", "Red-zone targets", .usage),
        .init("redZoneTargetShare", "Red-zone target share", .usage, .percent),
        .init("redZoneCarries", "Red-zone carries", .usage),
        .init("redZoneCarryShare", "Red-zone carry share", .usage, .percent),
        .init("goalLineLooks", "Goal-line looks", .usage), .init("receivingYards", "Receiving yards", .usage),
        .init("rushingYards", "Rushing yards", .usage), .init("passingYards", "Passing yards", .usage),
        .init("passAttempts", "Pass attempts", .usage), .init("completions", "Completions", .usage),
        .init("passingTouchdowns", "Passing TDs", .usage), .init("touchdowns", "Touchdowns", .usage),
        .init("airYards", "Average depth of target", .tracking, .decimal), .init("totalAirYards", "Air yards", .tracking),
        .init("airYardsShare", "Air-yard share", .tracking, .percent), .init("separation", "Separation", .tracking, .decimal),
        .init("yacAboveExpected", "YAC over expected", .tracking, .decimal),
        .init("rushOverExpected", "Rush yards over expected", .tracking, .decimal),
        .init("catchRate", "Catch rate", .tracking, .percent), .init("completionRate", "Completion rate", .tracking, .percent),
        .init("cpoe", "CPOE", .tracking, .decimal), .init("timeToThrow", "Time to throw", .tracking, .seconds, lowerIsBetter: true),
        .init("explosivePlays", "Explosive plays", .tracking),
        .init("passRate", "Pass rate", .team, .percent), .init("neutralPassRate", "Neutral pass rate", .team, .percent),
        .init("shotgunRate", "Shotgun rate", .team, .percent), .init("noHuddleRate", "No-huddle rate", .team, .percent),
        .init("successRate", "Offensive success", .team, .percent), .init("explosiveRate", "Explosive rate", .team, .percent),
        .init("redZoneTdRate", "Red-zone TD rate", .team, .percent), .init("thirdDownRate", "Third-down conversions", .team, .percent),
        .init("defenseSuccessAllowed", "Success allowed", .team, .percent, lowerIsBetter: true),
        .init("defenseExplosiveAllowed", "Explosive rate allowed", .team, .percent, lowerIsBetter: true),
    ]
}
