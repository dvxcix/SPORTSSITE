import SwiftUI

struct DugoutProfileSplits: View {
    let profile: DugoutProfile
    let role: DugoutProfile.Role

    var body: some View {
        let splits = profile.splits[role.rawValue] ?? [:]
        let swing = profile.swingTake[role.rawValue] ?? []
        let arsenal = profile.pitchArsenal[role.rawValue] ?? []
        let hasSplits = splits.values.contains { !$0.season.isEmpty || !$0.recency.isEmpty }
        if hasSplits || !swing.isEmpty || !arsenal.isEmpty || (role == .batter && profile.battingStance != nil) {
            ForEach(DugoutSplitConfig.options) { config in
                if let window = splits[config.id], !window.season.isEmpty || !window.recency.isEmpty {
                    DugoutSplitCard(profile: profile, config: config, window: window)
                }
            }
            if !swing.isEmpty { DugoutSwingTake(rows: swing, color: profile.accent) }
            if role == .batter, let stance = profile.battingStance, !stance.season.isEmpty || !stance.recency.isEmpty {
                DugoutStanceCard(window: stance, color: profile.accent)
            }
            if !arsenal.isEmpty { DugoutArsenal(profile: profile, role: role, rows: arsenal) }
        } else {
            ContentUnavailableView("No recorded Statcast splits", systemImage: "chart.bar.xaxis")
        }
    }
}

private struct DugoutSplitConfig: Identifiable {
    enum Dimension: String, CaseIterable, Identifiable {
        case pitch = "api_pitch_type"
        case pitcherHand = "pitch_hand"
        case battingSide = "bat_side"
        case contact = "bat_contact_code"

        var id: Self { self }
        var label: String {
            switch self {
            case .pitch: "Pitch type"
            case .pitcherHand: "Pitch hand"
            case .battingSide: "Bat side"
            case .contact: "Contact type"
            }
        }

        func format(_ value: String, profile: DugoutProfile) -> String {
            switch self {
            case .pitch: return profile.pitch(value).label
            case .pitcherHand, .battingSide: return ["L": "Left", "R": "Right", "S": "Switch"][value] ?? value
            case .contact: return ["2": "In play", "4": "Foul", "9": "Whiff"][value] ?? value
            }
        }
    }

    let id: String
    let title: String
    let weightField: String
    let weightLabel: String
    let dimensions: [Dimension]
    let metrics: [DugoutProfileMetric]

    static let options: [Self] = [
        .init(id: "bat_tracking", title: "Bat Tracking", weightField: "swings_competitive",
            weightLabel: "Swings", dimensions: Dimension.allCases, metrics: [
                .init(id: "avg_bat_speed", label: "Bat speed", style: .speed),
                .init(id: "hard_swing_rate", label: "Hard swing", style: .fraction),
                .init(id: "squared_up_per_swing", label: "Squared up", style: .fraction),
                .init(id: "blast_per_swing", label: "Blast", style: .fraction),
                .init(id: "whiff_per_swing", label: "Whiff", style: .fraction, lowerIsBetter: true),
                .init(id: "swing_length", label: "Swing length", style: .decimal(2), lowerIsBetter: true),
            ]),
        .init(id: "batted_ball_splits", title: "Batted Ball", weightField: "bbe",
            weightLabel: "Batted balls", dimensions: [.pitch, .pitcherHand, .battingSide], metrics: [
                .init(id: "gb_rate", label: "Ground balls", style: .fraction, lowerIsBetter: true),
                .init(id: "fb_rate", label: "Fly balls", style: .fraction),
                .init(id: "ld_rate", label: "Line drives", style: .fraction),
                .init(id: "pu_rate", label: "Popups", style: .fraction, lowerIsBetter: true),
                .init(id: "pull_rate", label: "Pull", style: .fraction),
                .init(id: "straight_rate", label: "Straight", style: .fraction),
                .init(id: "oppo_rate", label: "Opposite", style: .fraction),
            ]),
        .init(id: "swing_timing_miss_distance", title: "Swing Timing", weightField: "n_swings",
            weightLabel: "Swings", dimensions: Dimension.allCases, metrics: [
                .init(id: "perfect_percent", label: "Perfect", style: .fraction),
                .init(id: "centered_percent", label: "Centered", style: .fraction),
                .init(id: "on_time_percent", label: "On time", style: .fraction),
                .init(id: "whiff_rate", label: "Whiff", style: .fraction, lowerIsBetter: true),
                .init(id: "miss_distance", label: "Miss distance", style: .decimal(2), lowerIsBetter: true),
            ]),
        .init(id: "swing_path_attack_angle", title: "Swing Path", weightField: "competitive_swings",
            weightLabel: "Swings", dimensions: [.pitch, .pitcherHand, .battingSide], metrics: [
                .init(id: "avg_bat_speed", label: "Bat speed", style: .speed),
                .init(id: "attack_angle", label: "Attack angle", style: .degrees),
                .init(id: "ideal_attack_angle_rate", label: "Ideal attack angle", style: .fraction),
                .init(id: "swing_tilt", label: "Swing tilt", style: .degrees),
            ]),
    ]
}

private struct DugoutSplitCard: View {
    struct Aggregate: Identifiable {
        let id: [String]
        var sample = 0.0
        var sums: [String: Double] = [:]
        var sampleByMetric: [String: Double] = [:]

        func value(_ key: String) -> Double? {
            if key == "sample" { return sample }
            guard let sum = sums[key], let measured = sampleByMetric[key], measured > 0 else { return nil }
            return sum / measured
        }
    }

    let profile: DugoutProfile
    let config: DugoutSplitConfig
    let window: DugoutProfile.SplitWindow
    @Environment(\.colorScheme) private var scheme
    @State private var recent: Bool
    @State private var grouping: Set<DugoutSplitConfig.Dimension> = [.pitch]
    @State private var sorting = "sample"
    @State private var ascending = false

    init(profile: DugoutProfile, config: DugoutSplitConfig, window: DugoutProfile.SplitWindow) {
        self.profile = profile
        self.config = config
        self.window = window
        _recent = State(initialValue: !window.recency.isEmpty)
    }

    var body: some View {
        ResearchToolCard(color: profile.accent) {
            ResearchSectionTitle(title: config.title)
        } content: {
            if !window.recency.isEmpty {
                Picker("Split period", selection: $recent) {
                    Text("Season").tag(false)
                    Text("Last 6 days").tag(true)
                }
                .pickerStyle(.segmented)
            }
            let dimensions = config.dimensions.filter(grouping.contains)
            let groups = aggregates(dimensions)
            let pools = Dictionary(uniqueKeysWithValues: config.metrics.map { metric in
                (metric.id, groups.filter { $0.sample >= 10 }.compactMap { $0.value(metric.id) })
            })
            HStack {
                Menu {
                    ForEach(config.dimensions) { dimension in
                        Button {
                            if !grouping.contains(dimension) { grouping.insert(dimension) }
                            else if grouping.count > 1 { grouping.remove(dimension) }
                        } label: {
                            Label(dimension.label, systemImage: grouping.contains(dimension) ? "checkmark.circle.fill" : "circle")
                        }
                    }
                } label: { Label("Group by", systemImage: "square.stack") }
                Spacer()
                Menu {
                    Picker("Order by", selection: $sorting) {
                        Text(config.weightLabel).tag("sample")
                        Text("Group").tag("group")
                        ForEach(config.metrics) { Text($0.label).tag($0.id) }
                    }
                    Toggle("Ascending", isOn: $ascending)
                } label: { Label("Sort", systemImage: "arrow.up.arrow.down") }
            }
            .font(.subheadline.weight(.semibold))
            .padding(.vertical, 4)
            if groups.isEmpty {
                Text("No recorded samples for this period").font(.subheadline).foregroundStyle(.secondary)
            } else {
                DisclosureGroup {
                    ForEach(ordered(groups, dimensions: dimensions)) { row in
                        DisclosureGroup {
                            ResearchToolValues(items: config.metrics.map { metric in
                                let value = row.value(metric.id)
                                let tone = value.flatMap {
                                    row.sample >= 10 ? profileHeat($0, pool: pools[metric.id] ?? [],
                                        lower: metric.lowerIsBetter, scheme: scheme) : nil
                                }
                                return .init(label: metric.label, text: metric.format(value), tone: tone)
                            })
                            .padding(.bottom, 6)
                        } label: {
                            rowLabel(row, dimensions: dimensions)
                        }
                        Divider()
                    }
                } label: {
                    Text("\(groups.count) groups · \(dimensions.map(\.label).joined(separator: ", "))")
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
    }

    private func rowLabel(_ row: Aggregate, dimensions: [DugoutSplitConfig.Dimension]) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(zip(dimensions, row.id)), id: \.0.id) { dimension, value in
                    if dimension == .pitch, value != "—" {
                        DugoutProfilePitchBadge(pitch: profile.pitch(value))
                    } else {
                        Text(dimension.format(value, profile: profile))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(DugoutProfilePitchBadge.handColor(value) ?? .secondary)
                    }
                }
            }
            Spacer()
            let sample = row.sample.formatted(.number.precision(.fractionLength(0)))
            Text("\(sample) \(config.weightLabel.lowercased())")
                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
        .padding(.vertical, 7)
    }

    private func aggregates(_ dimensions: [DugoutSplitConfig.Dimension]) -> [Aggregate] {
        var groups: [[String]: Aggregate] = [:]
        for row in recent ? window.recency : window.season {
            let key = dimensions.map { row.dims[$0.rawValue]?.text ?? "—" }
            let weight = row.metrics[config.weightField]?.number ?? 0
            var aggregate = groups[key] ?? Aggregate(id: key)
            aggregate.sample += weight
            for field in config.metrics {
                if let value = row.metrics[field.id]?.number, value.isFinite {
                    aggregate.sums[field.id, default: 0] += value * weight
                    aggregate.sampleByMetric[field.id, default: 0] += weight
                }
            }
            groups[key] = aggregate
        }
        return Array(groups.values)
    }

    private func ordered(_ values: [Aggregate], dimensions: [DugoutSplitConfig.Dimension]) -> [Aggregate] {
        values.sorted { a, b in
            if sorting == "group" {
                let lhs = zip(dimensions, a.id).map { $0.format($1, profile: profile) }.joined()
                let rhs = zip(dimensions, b.id).map { $0.format($1, profile: profile) }.joined()
                return ascending ? lhs.localizedStandardCompare(rhs) == .orderedAscending : lhs.localizedStandardCompare(rhs) == .orderedDescending
            }
            let lhs = a.value(sorting)
            let rhs = b.value(sorting)
            if lhs == rhs { return a.id.lexicographicallyPrecedes(b.id) }
            guard let lhs else { return false }
            guard let rhs else { return true }
            return ascending ? lhs < rhs : lhs > rhs
        }
    }
}

private struct DugoutArsenal: View {
    let profile: DugoutProfile
    let role: DugoutProfile.Role
    let rows: [DugoutPlayerStats]
    @State private var sorting = "pitches"
    @State private var ascending = false

    var body: some View {
        ResearchToolCard(color: profile.accent) {
            ResearchSectionTitle(title: role == .pitcher ? "Pitch Arsenal" : "Batted Ball by Pitch Type")
        } content: {
            Menu {
                Picker("Arsenal sort", selection: $sorting) { ForEach(Self.metrics) { Text($0.label).tag($0.id) } }
                Toggle("Ascending", isOn: $ascending)
            } label: { Label("Sort pitches", systemImage: "arrow.up.arrow.down") }
            ForEach(Array(ordered.enumerated()), id: \.offset) { _, row in
                DisclosureGroup {
                    ResearchToolValues(items: Self.metrics.map { $0.value(row) }).padding(.bottom, 6)
                } label: {
                    DugoutProfilePitchBadge(pitch: profile.pitch(row["pitchType"]?.text ?? "Unknown pitch"))
                }
                Divider()
            }
        }
    }

    private var ordered: [DugoutPlayerStats] {
        rows.sorted {
            let lhs = $0[sorting]?.number
            let rhs = $1[sorting]?.number
            guard let lhs else { return false }
            guard let rhs else { return true }
            return ascending ? lhs < rhs : lhs > rhs
        }
    }

    private static let metrics: [DugoutProfileMetric] = [
        .init(id: "pitches", label: "Pitches"), .init(id: "pitch_usage", label: "Usage", style: .percent),
        .init(id: "pa", label: "PA"), .init(id: "ba", label: "BA", style: .decimal(3)),
        .init(id: "est_woba", label: "xwOBA", style: .decimal(3)),
        .init(id: "whiff_percent", label: "Whiff", style: .percent),
        .init(id: "run_value_per_100", label: "RV/100", style: .decimal(1)),
    ]
}

private struct DugoutSwingTake: View {
    let rows: [DugoutProfile.Split]
    let color: Color
    @State private var group = ""
    @State private var subtype = ""

    var body: some View {
        let groups = Set(rows.compactMap { $0.dims["group_type"]?.text }).sorted()
        let selected = groups.contains(group) ? group : groups.first ?? ""
        let inGroup = rows.filter { $0.dims["group_type"]?.text == selected }
        let subtypes = Set(inGroup.compactMap { $0.dims["sub_type"]?.text }).sorted()
        let active = inGroup.first { $0.dims["sub_type"]?.text == subtype } ?? inGroup.first
        ResearchToolCard(color: color) {
            ResearchSectionTitle(title: "Swing/Take Run Value")
        } content: {
            HStack {
                ResearchToolFilter(title: "Group type", selection: selected) {
                    ForEach(groups, id: \.self) { option in Button(option) { group = option; subtype = "" } }
                }
                if !subtypes.isEmpty {
                    ResearchToolFilter(title: "Subtype", selection: active?.dims["sub_type"]?.text ?? "Subtype") {
                        ForEach(subtypes, id: \.self) { option in Button(option) { subtype = option } }
                    }
                }
            }
            if let stats = active?.metrics {
                let keys = stats.keys.filter { $0.hasPrefix("runs_") }.sorted()
                if !keys.isEmpty {
                    ResearchToolValues(items: keys.map { key in
                        let code = String(key.dropFirst(5))
                        return .init(label: code.count == 2 ? code.uppercased() : code.capitalized,
                            text: ResearchFormat.decimal(stats[key]?.number))
                    })
                }
            }
        }
    }
}

private struct DugoutStanceCard: View {
    let window: DugoutProfile.SplitWindow
    let color: Color
    @State private var recent: Bool
    @State private var hand = "All"

    init(window: DugoutProfile.SplitWindow, color: Color) {
        self.window = window
        self.color = color
        _recent = State(initialValue: !window.recency.isEmpty)
    }

    var body: some View {
        let rows = recent ? window.recency : window.season
        let available = ["All", "L", "R"].filter { candidate in rows.contains { $0.dims["pitch_hand"]?.text == candidate } }
        let selection = available.contains(hand) ? hand : available.first
        ResearchToolCard(color: color) {
            ResearchSectionTitle(title: "Batting Stance")
        } content: {
            if !window.recency.isEmpty {
                Picker("Stance period", selection: $recent) {
                    Text("Season").tag(false)
                    Text("Last 6 days").tag(true)
                }
                .pickerStyle(.segmented)
            }
            if let selection, let row = rows.first(where: { $0.dims["pitch_hand"]?.text == selection }) {
                ResearchToolFilter(title: "Pitch hand", selection: selection == "All" ? "All pitchers" : "vs. \(selection)HP") {
                    ForEach(available, id: \.self) { candidate in
                        Button(candidate == "All" ? "All pitchers" : "vs. \(candidate)HP") { hand = candidate }
                    }
                }
                ResearchToolValues(items: Self.metrics.map { $0.value(row.metrics) })
            } else {
                Text("No recorded stance for this period").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private static let metrics: [DugoutProfileMetric] = [
        .init(id: "avg_stance_angle", label: "Stance angle", style: .degrees),
        .init(id: "avg_foot_sep", label: "Foot separation", style: .decimal(1)),
        .init(id: "avg_batter_y_position", label: "Batter Y", style: .decimal(1)),
        .init(id: "avg_batter_x_position", label: "Batter X", style: .decimal(1)),
        .init(id: "avg_intercept_y_vs_plate", label: "Intercept vs. plate", style: .decimal(1)),
        .init(id: "avg_intercept_y_vs_batter", label: "Intercept vs. batter", style: .decimal(1)),
    ]
}

struct DugoutProfileHomeRuns: View {
    let rows: [DugoutPlayerStats]
    let profile: DugoutProfile
    let role: DugoutProfile.Role
    let api: DugoutPlayerProfileAPI
    @State private var sort = "game_date"
    @State private var ascending = false

    var body: some View {
        ResearchToolCard(color: profile.accent) {
            ResearchSectionTitle(title: role == .batter ? "Recent Home Runs" : "Recent Home Runs Allowed")
        } content: {
            Menu {
                Picker("Home run sort", selection: $sort) {
                    Text("Date").tag("game_date")
                    Text("Opponent").tag(opponent + "_name")
                    Text("Result").tag("result")
                    Text("Distance").tag("hr_distance")
                    Text("Exit velocity").tag("exit_velocity")
                    Text("Launch angle").tag("launch_angle")
                    Text("Category").tag("hr_cat")
                }
                Toggle("Ascending", isOn: $ascending)
            } label: { Label("Sort home runs", systemImage: "arrow.up.arrow.down") }
            DisclosureGroup("Browse \(rows.count) home runs") {
                ForEach(Array(ordered.enumerated()), id: \.offset) { _, row in
                    homeRun(row).padding(.vertical, 8)
                    Divider()
                }
            }
        }
    }

    private var opponent: String { role == .batter ? "pitcher" : "batter" }

    private var ordered: [DugoutPlayerStats] {
        rows.sorted { first, second in
            if let first = first[sort]?.number, let second = second[sort]?.number {
                return ascending ? first < second : first > second
            }
            guard let lhs = first[sort]?.text else { return false }
            guard let rhs = second[sort]?.text else { return true }
            return lhs.localizedStandardCompare(rhs) == (ascending ? .orderedAscending : .orderedDescending)
        }
    }

    private func homeRun(_ row: DugoutPlayerStats) -> some View {
        let id = row[opponent + "_id"]?.number.flatMap(Int.init(exactly:))
        let name = row[opponent + "_name"]?.text ?? "Opponent"
        let logo = row["opponent_team"]?.text.flatMap { profile.teams[$0]?.logo }
        let shot = id.flatMap { profile.opponents[String($0)] }
        return VStack(alignment: .leading, spacing: 7) {
            if let id, id > 0 {
                NavigationLink {
                    DugoutPlayerProfileView(api: api, playerID: id, preferredRole: role == .batter ? .pitcher : .batter)
                } label: {
                    DugoutOpponentArtwork(name: name, subtitle: row["game_date"]?.text, headshot: shot, logo: logo)
                }
                .buttonStyle(SlipSurgePressStyle())
            } else {
                DugoutOpponentArtwork(name: name, subtitle: row["game_date"]?.text, headshot: shot, logo: logo)
            }
            if let category = row["hr_cat"]?.text {
                Label(category, systemImage: "baseball").font(.caption.weight(.semibold))
                    .foregroundStyle(category == "No Doubter" ? .green : category == "Doubter" ? .red : .orange)
            }
            ResearchToolValues(items: [
                .init(label: "Exit velocity", text: ResearchFormat.decimal(row["exit_velocity"]?.number, suffix: " mph")),
                .init(label: "Launch angle", text: ResearchFormat.decimal(row["launch_angle"]?.number, suffix: "°")),
                .init(label: "Distance", text: ResearchFormat.decimal(row["hr_distance"]?.number, suffix: " ft")),
            ])
        }
    }
}

struct DugoutOpponentArtwork: View {
    let name: String
    var subtitle: String?
    var headshot: URL?
    var logo: URL?

    var body: some View {
        HStack(spacing: 9) {
            if let headshot {
                ResearchArtwork(urls: [headshot], fallback: "person.fill").frame(width: 36, height: 36)
            }
            if let logo {
                ResearchArtwork(urls: [logo], fallback: "baseball.diamond").frame(width: 25, height: 25)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}
