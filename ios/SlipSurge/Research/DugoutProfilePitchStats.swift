import SwiftUI

struct DugoutPitchLine {
    typealias Row = DugoutPlayerPitchLog.Row
    let values: [String: Double]
    let count: Int

    init(_ rows: [Row], total: Int? = nil) {
        count = rows.count
        let events = rows.compactMap(\.events).filter { !$0.isEmpty }
        let eventCounts = Dictionary(grouping: events, by: { $0 }).mapValues(\.count)
        func event(_ key: String) -> Int { eventCounts[key] ?? 0 }
        let swings = rows.filter { $0.isSwing == true }
        let inPlay = rows.filter { $0.isInPlay == true }
        let outside = rows.filter { ($0.zone ?? 0) >= 11 }
        let exitSpeeds = inPlay.compactMap(\.launchSpeed)
        let launchAngles = inPlay.compactMap(\.launchAngle)
        let classifications = inPlay.compactMap(\.launchSpeedAngle)
        let walks = event("walk") + event("intent_walk")
        let hitByPitch = event("hit_by_pitch")
        let strikeouts = event("strikeout") + event("strikeout_double_play")
        let singles = event("single")
        let doubles = event("double")
        let triples = event("triple")
        let homeRuns = event("home_run")
        let hits = singles + doubles + triples + homeRuns
        let sacrificeFlies = event("sac_fly") + event("sac_fly_double_play")
        let sacrificeBunts = event("sac_bunt") + event("sac_bunt_double_play")
        let atBats = events.count - walks - hitByPitch - sacrificeFlies - sacrificeBunts
        let onBaseDenominator = atBats + walks + hitByPitch + sacrificeFlies
        let totalBases = singles + 2 * doubles + 3 * triples + 4 * homeRuns

        let measured: [String: Double?] = [
            "pitches": Double(count), "usage": Self.ratio(count, total ?? 0),
            "pa": Double(events.count), "hits": Double(hits), "singles": Double(singles),
            "doubles": Double(doubles), "triples": Double(triples), "hr": Double(homeRuns),
            "bb": Double(walks), "k": Double(strikeouts),
            "avg": Self.ratio(hits, atBats, scale: 1), "obp": Self.ratio(hits + walks + hitByPitch, onBaseDenominator, scale: 1),
            "slg": Self.ratio(totalBases, atBats, scale: 1),
            "whiffPct": Self.ratio(rows.filter { $0.isWhiff == true }.count, swings.count),
            "chasePct": Self.ratio(outside.filter { $0.isSwing == true }.count, outside.count),
            "avgEv": Self.average(exitSpeeds),
            "hardHitPct": Self.ratio(exitSpeeds.filter { $0 >= 95 }.count, exitSpeeds.count),
            "xwobaContact": Self.average(inPlay.compactMap(\.xwoba)),
            "avgBatSpeed": Self.average(swings.compactMap(\.batSpeed)),
            "barrelPct": Self.ratio(classifications.filter { $0 == 6 }.count, classifications.count),
            "sweetSpotPct": Self.ratio(launchAngles.filter { (8...32).contains($0) }.count, launchAngles.count),
            "avgAttackAngle": Self.average(swings.compactMap(\.attackAngle)),
            "avgSwingLength": Self.average(swings.compactMap(\.swingLength)),
            "runValuePer100": Self.average(rows.compactMap(\.runValue)).map { $0 * 100 },
        ]
        values = measured.compactMapValues { $0 }
    }

    static func ratio(_ count: Int, _ total: Int, scale: Double = 100) -> Double? {
        total > 0 ? Double(count) / Double(total) * scale : nil
    }

    static func average(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    static let metrics: [DugoutProfileMetric] = [
        .init(id: "pitches", label: "Pitches"), .init(id: "usage", label: "Usage", style: .percent),
        .init(id: "pa", label: "Plate appearances"), .init(id: "hits", label: "Hits"),
        .init(id: "singles", label: "Singles"), .init(id: "doubles", label: "Doubles"),
        .init(id: "triples", label: "Triples"), .init(id: "hr", label: "Home runs"),
        .init(id: "bb", label: "Walks"), .init(id: "k", label: "Strikeouts"),
        .init(id: "avg", label: "AVG", style: .decimal(3)),
        .init(id: "obp", label: "OBP", style: .decimal(3)),
        .init(id: "slg", label: "SLG", style: .decimal(3)),
        .init(id: "whiffPct", label: "Whiff", style: .percent, lowerIsBetter: true),
        .init(id: "chasePct", label: "Chase", style: .percent, lowerIsBetter: true),
        .init(id: "avgEv", label: "Exit velocity", style: .speed),
        .init(id: "hardHitPct", label: "Hard hit", style: .percent),
        .init(id: "xwobaContact", label: "xwOBA on contact", style: .decimal(3)),
        .init(id: "avgBatSpeed", label: "Bat speed", style: .speed),
        .init(id: "barrelPct", label: "Barrels", style: .percent),
        .init(id: "sweetSpotPct", label: "Sweet spot", style: .percent),
        .init(id: "avgAttackAngle", label: "Attack angle", style: .degrees),
        .init(id: "avgSwingLength", label: "Swing length", style: .decimal(1)),
        .init(id: "runValuePer100", label: "RV/100", style: .decimal(1)),
    ]
}

struct DugoutProfileZoneGrid: View {
    typealias Row = DugoutPlayerPitchLog.Row

    enum Metric: String, CaseIterable {
        case run = "Run value", whiff = "Whiff %", hardHit = "Hard hit %"

        func value(_ rows: [Row]) -> Double? {
            switch self {
            case .run:
                return DugoutPitchLine.average(rows.compactMap(\.runValue))
            case .whiff:
                return DugoutPitchLine.ratio(rows.filter { $0.isWhiff == true }.count, rows.filter { $0.isSwing == true }.count)
            case .hardHit:
                let speeds = rows.filter { $0.isInPlay == true }.compactMap(\.launchSpeed)
                return DugoutPitchLine.ratio(speeds.filter { $0 >= 95 }.count, speeds.count)
            }
        }

        func format(_ value: Double?) -> String {
            guard let value else { return "—" }
            if self == .run {
                return (value >= 0 ? "+" : "") + value.formatted(.number.precision(.fractionLength(2)))
            }
            return ResearchFormat.decimal(value, suffix: "%")
        }
    }

    let rows: [Row]
    let opponentRows: [Row]?
    let pitcher: Bool
    @Environment(\.colorScheme) private var scheme
    @State private var metric = Metric.run
    @State private var selected: Int?

    var body: some View {
        let own = Dictionary(grouping: rows, by: { $0.zone ?? 0 })
        let other = opponentRows.map { Dictionary(grouping: $0, by: { $0.zone ?? 0 }) }
        let cells = (1...9).map { zone in cell(zone, own: own[zone] ?? [], other: other?[zone] ?? []) }
        let pool = cells.compactMap(\.value)
        let direction = opponentRows == nil ? (metric == .whiff ? !pitcher : pitcher) : pitcher
        VStack(alignment: .leading, spacing: 10) {
            if opponentRows == nil {
                Picker("Color strike zone by", selection: $metric) {
                    ForEach(Metric.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                ForEach(cells) { cell in
                    let tone = cell.value.flatMap { profileHeat($0, pool: pool, lower: direction, scheme: scheme) }
                    Button {
                        selected = cell.id
                    } label: {
                        VStack(spacing: 3) {
                            Text(metric.format(cell.value)).font(.headline.monospacedDigit())
                            Text(cell.caption).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 58)
                        .foregroundStyle(tone ?? .primary)
                        .background((tone ?? .secondary).opacity(0.16), in: .rect(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(selected == cell.id ? tone ?? .primary : .clear) }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel("Strike zone \(cell.id)")
                    .accessibilityValue("\(metric.format(cell.value)), \(cell.accessibleCount)")
                    .accessibilityAddTraits(selected == cell.id ? .isSelected : [])
                }
            }
            .sensoryFeedback(.selection, trigger: selected)
            if opponentRows == nil {
                let chase = (11...14).flatMap { own[$0] ?? [] }
                ResearchSectionTitle(title: "Chase Zone")
                ResearchToolValues(items: [
                    .init(label: "Pitches", text: chase.count.formatted()),
                    .init(label: "Chase swing", text: ResearchFormat.decimal(DugoutPitchLine.ratio(chase.filter { $0.isSwing == true }.count, chase.count), suffix: "%")),
                    .init(label: "Whiff", text: Metric.whiff.format(Metric.whiff.value(chase))),
                ])
            }
            if let selected, let rows = own[selected], !rows.isEmpty {
                DisclosureGroup("Browse zone \(selected) pitches") {
                    ForEach(Array(rows.suffix(75).reversed().enumerated()), id: \.offset) { _, row in
                        Text([row.gameDate, row.opponentName, row.description.map(dugoutProfileWord)].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).padding(.vertical, 3)
                    }
                    if rows.count > 75 {
                        Text("Showing the latest 75 pitches").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private struct Cell: Identifiable {
        let id: Int
        let own: Int
        let other: Int?
        let pitcher: Bool
        let value: Double?

        var caption: String {
            if let other { return "\(pitcher ? other : own)b · \(pitcher ? own : other)p" }
            return "\(own) pitches"
        }

        var accessibleCount: String {
            if let other { return "\(pitcher ? other : own) batter pitches, \(pitcher ? own : other) pitcher pitches" }
            return caption
        }
    }

    private func cell(_ zone: Int, own: [Row], other: [Row]) -> Cell {
        if opponentRows != nil {
            let combined = Metric.run.value(own).flatMap { a in Metric.run.value(other).map { a + $0 } }
            return Cell(id: zone, own: own.count, other: other.count, pitcher: pitcher, value: combined)
        }
        return Cell(id: zone, own: own.count, other: nil, pitcher: pitcher, value: metric.value(own))
    }
}
