import Charts
import SwiftUI

struct DugoutPlayerProfileView: View {
    let api: DugoutPlayerProfileAPI
    let playerID: Int
    var preferredRole: DugoutProfile.Role?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var data: DugoutProfile?
    @State private var role = DugoutProfile.Role.batter
    @State private var page = Page.overview
    @State private var career = false
    @State private var failure: (any Error)?
    @State private var revision = 0

    private enum Page: String, CaseIterable {
        case overview = "Overview"
        case splits = "Splits"
        case pitches = "Pitches"
        case spray = "Spray"
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if let data {
                    header(data)
                    if data.roles.count > 1 {
                        Picker("Player role", selection: $role) {
                            ForEach(data.roles) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    if !data.roles.isEmpty {
                        pageRail
                        content(data)
                    }
                } else if let status = failure as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView("Basic access required", systemImage: "lock",
                        description: Text("Player profiles are available with Basic and higher memberships."))
                } else {
                    ResearchToolMessage(title: "Player profile couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Player Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .onChange(of: role) { if role == .pitcher && page == .spray { page = .pitches } }
    }

    private var pageRail: some View {
        let choices = Page.allCases.filter { $0 != .spray || role == .batter }
        return Group {
            if typeSize.isAccessibilitySize {
                ScrollView(.horizontal) { HStack(spacing: 5) { ForEach(choices, id: \.self, content: pageButton) } }
                    .scrollIndicators(.hidden)
            } else if #available(iOS 26, *) {
                GlassEffectContainer(spacing: 5) { HStack(spacing: 5) { ForEach(choices, id: \.self, content: pageButton) } }
            } else {
                HStack(spacing: 5) { ForEach(choices, id: \.self, content: pageButton) }
            }
        }
        .sensoryFeedback(.selection, trigger: page)
    }

    private func pageButton(_ tab: Page) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { page = tab }
        } label: {
            Text(tab.rawValue).font(.subheadline.weight(.semibold))
                .foregroundStyle(page == tab ? Brand.accent(for: scheme) : Brand.text(for: scheme))
                .padding(.horizontal, typeSize.isAccessibilitySize ? 12 : 4)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(SlipSurgePressStyle())
        .modifier(PlayerPageGlass(tint: page == tab ? Brand.accent(for: scheme).opacity(0.26) : nil))
        .accessibilityAddTraits(page == tab ? .isSelected : [])
    }

    private struct PlayerPageGlass: ViewModifier {
        let tint: Color?
        func body(content: Content) -> some View {
            if #available(iOS 26, *) { content.glassEffect(.regular.tint(tint).interactive(), in: .capsule) }
            else { content.background(.thinMaterial, in: .capsule).background(tint ?? .clear, in: .capsule) }
        }
    }

    private func header(_ data: DugoutProfile) -> some View {
        let player = data.player
        let team = data.team
        let subtitle = [team?.name, player.primaryPosition].compactMap { $0 }.joined(separator: " · ")
        let metadata = [
            player.batSide.map { ("Bats", $0) },
            player.pitchHand.map { ("Throws", $0) },
            player.height.map { ("Height", $0) },
            player.weight.map { ("Weight", "\($0) lb") },
            player.mlbDebut.map { ("Debut", $0) },
        ].compactMap { $0 }
        return VStack(alignment: .leading, spacing: 10) {
            hero(data, subtitle: subtitle)
            if !metadata.isEmpty {
                ResearchToolValues(items: metadata.map { label, value in .init(label: label, text: value,
                    tone: label == "Bats" || label == "Throws" ? DugoutProfilePitchBadge.handColor(value) : nil) })
            }
        }
    }

    private func hero(_ data: DugoutProfile, subtitle: String) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            VStack(alignment: .leading, spacing: 5) {
                if let logo = data.team?.logo {
                    ResearchArtwork(urls: [logo], fallback: "shield")
                        .frame(width: 30, height: 30)
                        .padding(5).background(.white.opacity(0.92), in: .rect(cornerRadius: 9))
                }
                Text(data.name).font(.title2.weight(.heavy)).accessibilityAddTraits(.isHeader)
                if !subtitle.isEmpty { Text(subtitle).font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.88)) }
            }
            .frame(maxWidth: .infinity, minHeight: 119, alignment: .bottomLeading)
            .padding(.leading, 15)
            .padding(.bottom, 14)
            ResearchArtwork(urls: [data.headshot].compactMap { $0 }, fallback: "person.fill")
                .frame(width: typeSize.isAccessibilitySize ? 70 : 123, height: typeSize.isAccessibilitySize ? 78 : 138)
                .padding(.trailing, 7)
        }
        .foregroundStyle(.white)
        .background(alignment: .trailing) {
            if let logo = data.team?.logo {
                ResearchArtwork(urls: [logo], fallback: "shield").frame(width: 142, height: 112)
                    .opacity(0.23).offset(x: 19, y: -14)
            }
        }
        .background {
            LinearGradient(colors: [.black.opacity(0.72), .black.opacity(0.08)], startPoint: .bottomLeading, endPoint: .topTrailing)
                .background(LinearGradient(colors: [data.accent, data.team?.secondaryColor ?? data.accent], startPoint: .leading, endPoint: .topTrailing))
        }
        .clipShape(.rect(cornerRadius: 20))
    }

    @ViewBuilder
    private func content(_ data: DugoutProfile) -> some View {
        switch page {
        case .overview:
            overview(data)
        case .splits:
            DugoutProfileSplits(profile: data, role: role).id(role)
        case .pitches:
            let kind: DugoutPlayerPitchLog.Kind = role == .batter ? .batting : .pitching
            DugoutProfilePitchView(api: api, profile: data, kind: kind).id(kind)
        case .spray:
            DugoutProfilePitchView(api: api, profile: data, kind: .spray).id(DugoutPlayerPitchLog.Kind.spray)
        }
    }

    @ViewBuilder
    private func overview(_ data: DugoutProfile) -> some View {
        ResearchToolCard(color: data.accent) {
            ResearchSectionTitle(title: role.title)
        } content: {
            Picker("Statistics period", selection: $career) {
                Text("\(data.season) Season").tag(false)
                Text("Career").tag(true)
            }
            .pickerStyle(.segmented)
            if let stats = ((career ? data.careerStats : data.seasonStats)[role.statsKey] ?? nil) {
                ResearchToolValues(items: (role == .batter ? Self.hitting : Self.pitching).map { $0.value(stats) })
            } else {
                Text(career ? "Career statistics are unavailable" : "There are no synced statistics for this season")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        if let form = data.form[role.rawValue] {
            DugoutProfileForm(form: form, role: role, color: data.accent)
        }
        if let categories = data.statcastSeason[role.statcastKey], !categories.isEmpty {
            quality(categories, data: data)
            ForEach(categories.keys.sorted(), id: \.self) { key in
                if let stats = categories[key] {
                    expandableStats(dugoutProfileWord(key), stats: stats, color: data.accent)
                }
            }
        }
        if role == .batter {
            ForEach(data.baserunning.keys.sorted(), id: \.self) { key in
                if let stats = data.baserunning[key] {
                    expandableStats(dugoutProfileWord(key), stats: stats, color: data.accent)
                }
            }
            if !data.fielding.isEmpty {
                ResearchToolCard(color: data.accent) {
                    ResearchSectionTitle(title: "Fielding")
                } content: {
                    ForEach(Array(data.fielding.enumerated()), id: \.offset) { index, row in
                        let name = [row.position, row.category.map(dugoutProfileWord)].compactMap { $0 }.joined(separator: " · ")
                        DisclosureGroup(name.isEmpty ? "Fielding \(index + 1)" : name) {
                            let values = Self.leafValues(row.metrics)
                            if !values.isEmpty { ResearchToolValues(items: values) }
                        }
                    }
                }
            }
        }
        let homers = data.homeRuns[role == .batter ? "hit" : "allowed"] ?? []
        if !homers.isEmpty {
            DugoutProfileHomeRuns(rows: homers, profile: data, role: role, api: api)
        }
    }

    private func quality(_ categories: [String: DugoutPlayerStats], data: DugoutProfile) -> some View {
        let metrics = Self.qualityFields.compactMap { category, metric -> ResearchToolValues.Value? in
            guard let stats = categories[category] else { return nil }
            let tone = stats[metric.id]?.number.flatMap {
                profileHeat($0, pool: data.leaguePools[role.statcastKey]?[metric.id] ?? [], lower: role == .pitcher, scheme: scheme)
            }
            return metric.value(stats, tone: tone)
        }
        return ResearchToolCard(color: data.accent) {
            ResearchSectionTitle(title: role == .batter ? "Quality of Contact" : "Quality of Contact Allowed")
        } content: {
            if !metrics.isEmpty { ResearchToolValues(items: metrics) }
            Text("Compared with qualified players in the \(data.season) season.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func expandableStats(_ title: String, stats: DugoutPlayerStats, color: Color) -> some View {
        ResearchToolCard(color: color) {
            DisclosureGroup(title) {
                let values = Self.leafValues(stats)
                if !values.isEmpty { ResearchToolValues(items: values).padding(.top, 6) }
            }
            .font(.subheadline.weight(.semibold))
        } content: {}
    }

    private static func leafValues(_ data: DugoutPlayerStats) -> [ResearchToolValues.Value] {
        data.keys.sorted().compactMap { key in
            guard !["id", "mlb_id", "created_at", "updated_at"].contains(key), let value = data[key]?.text else { return nil }
            return .init(label: dugoutProfileWord(key), text: value)
        }
    }

    private func load() async {
        failure = nil
        do {
            let result = try await api.profile(playerID)
            try Task.checkCancellation()
            if data == nil || !result.roles.contains(role) {
                role = preferredRole.flatMap { result.roles.contains($0) ? $0 : nil } ?? result.roles.first ?? .batter
            }
            data = result
        } catch {
            if !Task.isCancelled { failure = error }
        }
    }

    private static let hitting: [DugoutProfileMetric] = [
        .init(id: "avg", label: "AVG", style: .decimal(3)), .init(id: "obp", label: "OBP", style: .decimal(3)),
        .init(id: "slg", label: "SLG", style: .decimal(3)), .init(id: "ops", label: "OPS", style: .decimal(3)),
        .init(id: "home_runs", label: "Home runs"), .init(id: "rbi", label: "RBI"), .init(id: "runs", label: "Runs"),
        .init(id: "stolen_bases", label: "Stolen bases"), .init(id: "walks", label: "Walks"),
        .init(id: "strikeouts", label: "Strikeouts"), .init(id: "games_played", label: "Games"),
    ]

    private static let pitching: [DugoutProfileMetric] = [
        .init(id: "era", label: "ERA", style: .decimal(1)), .init(id: "whip", label: "WHIP", style: .decimal(3)),
        .init(id: "wins", label: "Wins"), .init(id: "losses", label: "Losses"), .init(id: "saves", label: "Saves"),
        .init(id: "innings_pitched", label: "Innings", style: .decimal(1)), .init(id: "strikeouts", label: "Strikeouts"),
        .init(id: "walks", label: "Walks"), .init(id: "home_runs_allowed", label: "Home runs allowed"),
        .init(id: "games_played", label: "Games"), .init(id: "games_started", label: "Starts"),
    ]

    private static let qualityFields: [(String, DugoutProfileMetric)] = [
        ("exit_velocity_barrels", .init(id: "exit_velocity_avg", label: "Exit velocity", style: .speed)),
        ("exit_velocity_barrels", .init(id: "barrel_batted_rate", label: "Barrel %", style: .percent)),
        ("exit_velocity_barrels", .init(id: "hard_hit_percent", label: "Hard hit %", style: .percent)),
        ("expected_stats", .init(id: "xba", label: "xBA", style: .decimal(3))),
        ("expected_stats", .init(id: "xslg", label: "xSLG", style: .decimal(3))),
        ("expected_stats", .init(id: "xwoba", label: "xwOBA", style: .decimal(3))),
        ("home_runs", .init(id: "hr_total", label: "Home runs")),
        ("home_runs", .init(id: "xhr", label: "xHR", style: .decimal(1))),
        ("statcast_quality_of_contact", .init(id: "max_hit_speed", label: "Max exit velocity", style: .speed)),
        ("statcast_quality_of_contact", .init(id: "max_distance", label: "Max distance", style: .distance)),
    ]
}

private struct DugoutProfileForm: View {
    let form: DugoutProfile.Form
    let role: DugoutProfile.Role
    let color: Color
    @Environment(\.colorScheme) private var scheme
    @State private var metric = "avg_bat_speed"

    var body: some View {
        ResearchToolCard(color: color) {
            ResearchSectionTitle(title: "Current Form")
        } content: {
            Picker("Form statistic", selection: $metric) {
                ForEach(Self.metrics) { Text($0.label).tag($0.id) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let field = Self.metrics.first(where: { $0.id == metric }) {
                values(field)
            }
        }
    }

    @ViewBuilder
    private func values(_ field: DugoutProfileMetric) -> some View {
        let recent = form.recency[field.id]?.number
        let season = form.season[field.id]?.number
        let delta = recent.flatMap { value in season.map { value - $0 } }
        let direction = role == .batter ? 1.0 : -1.0
        let tone = delta.flatMap { dugoutTone($0 * (field.lowerIsBetter ? -direction : direction), scheme: scheme) }
        ResearchToolValues(items: [
            .init(label: "Season", text: field.format(season)),
            .init(label: "Last 6 days", text: field.format(recent), tone: tone),
        ])
        if season != nil || recent != nil {
            Chart {
                if let season {
                    BarMark(x: .value("Window", "Season"), y: .value(field.label, season))
                        .foregroundStyle(color.opacity(0.65)).cornerRadius(5)
                        .accessibilityValue(field.format(season))
                }
                if let recent {
                    BarMark(x: .value("Window", "Last 6 days"), y: .value(field.label, recent))
                        .foregroundStyle(tone ?? color).cornerRadius(5)
                        .accessibilityValue(field.format(recent))
                }
            }
            .chartXScale(domain: ["Season", "Last 6 days"])
            .chartYAxis(.hidden)
            .frame(height: 96)
            .accessibilityLabel(field.label)
        }
    }

    private static let metrics: [DugoutProfileMetric] = [
        .init(id: "avg_bat_speed", label: "Bat speed", style: .speed),
        .init(id: "hard_swing_rate", label: "Hard swing", style: .fraction),
        .init(id: "squared_up_per_swing", label: "Squared up", style: .fraction),
        .init(id: "blast_per_swing", label: "Blast", style: .fraction),
        .init(id: "whiff_per_swing", label: "Whiff", style: .fraction, lowerIsBetter: true),
    ]
}

func profileHeat(_ value: Double, pool: [Double], lower: Bool, scheme: ColorScheme) -> Color? {
    guard pool.count >= 3, let minimum = pool.min(), let maximum = pool.max(), maximum > minimum else { return nil }
    let position = min(1, max(0, (value - minimum) / (maximum - minimum)))
    let rating = lower ? 1 - position : position
    guard rating < 0.33 || rating > 0.66 else { return nil }
    return dugoutTone(rating - 0.5, scheme: scheme)
}

struct DugoutProfilePitchBadge: View {
    let pitch: DugoutProfile.PitchKind

    var body: some View {
        Label {
            Text(pitch.label).font(.subheadline.weight(.semibold))
        } icon: {
            Circle().fill(Color(hex: pitch.color) ?? .secondary).frame(width: 8, height: 8)
        }
    }

    static func handColor(_ value: String) -> Color? {
        switch value {
        case "L": Color(rgb: 0x60A5FA)
        case "S": Color(rgb: 0xC084FC)
        case "R": Color(rgb: 0xFB923C)
        default: nil
        }
    }
}
