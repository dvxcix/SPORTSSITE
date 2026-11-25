import SwiftUI

struct SidelineResearchView: View {
    private enum Page: String, CaseIterable {
        case market = "Market Edge", exact = "Exact Lines", explosive = "Explosive Plays", gaps = "Run Gaps", defense = "Defense vs. Position"

        var glyph: String {
            switch self {
            case .market: "chart.line.uptrend.xyaxis"
            case .exact: "tablecells"
            case .explosive: "bolt"
            case .gaps: "arrow.triangle.branch"
            case .defense: "shield"
            }
        }
    }

    private enum Window: String, CaseIterable { case season = "Season", l1 = "L1", l3 = "L3", l5 = "L5", l10 = "L10" }

    private enum Sort: String, CaseIterable { case mismatch = "MM", score = "SlipSurge Score", edge = "Model Edge", hits = "Season hit rate" }

    private struct Filters: Equatable {
        let sample: SidelineResearchSample
        let window: Window
        let market: String
        let book: String
        let revision: Int
        let retry: Int
    }

    let api: SidelineAPI
    let tool: SidelineResearchTool
    let date: String
    let game: String
    let teams: [SidelineMarketTools.Visual]
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sample = SidelineResearchSample.automatic
    @State private var window = Window.season
    @State private var page = Page.market
    @State private var sort: Sort?
    @State private var market = "anytime_td"
    @State private var book = "fanduel"
    @State private var team = ""
    @State private var search = ""
    @State private var matrixID: String?
    @State private var result: (Filters, SidelineResearchPayload)?
    @State private var error: (any Error)?
    @State private var retry = 0
    @State private var selectedRow: SidelineResearchPayload.Row?

    private var mismatch: Bool { tool == .mismatch }
    private var filters: Filters { .init(sample: sample, window: window, market: market, book: book, revision: revision, retry: retry) }
    private var activeSort: Sort { sort ?? (mismatch ? .mismatch : page == .exact ? .hits : .edge) }
    private var validResult: SidelineResearchPayload? { result.flatMap { $0.0 == filters ? $0.1 : nil } }

    var body: some View {
        if api.isFeatured {
            ResearchToolMessage(title: "Research unavailable", error: SlipSurgeHTTP.Status(code: 403, data: Data()))
        } else {
            VStack(alignment: .leading, spacing: 9) {
                if mismatch {
                    ResearchToolRail(title: "Sample window", choices: Window.allCases, selection: $window, label: \.rawValue) {
                        $0 == .season ? "calendar" : "clock.arrow.circlepath"
                    }
                } else {
                    ResearchToolRail(title: "Cheatsheet board", choices: Page.allCases, selection: $page, label: \.rawValue, glyph: \.glyph)
                        .onChange(of: page) { _, _ in sort = nil }
                }
                controls
                if let validResult {
                    data(validResult)
                } else {
                    ResearchToolMessage(title: mismatch ? "MM couldn’t load" : "Cheatsheets couldn’t load", error: error) { retry += 1 }
                }
            }
            .task(id: filters) { await load(filters) }
            .sheet(item: $selectedRow) { row in
                NavigationStack {
                    if mismatch {
                        SidelineMMPlayerView(api: api, player: row.player, mm: row.mm, score: row.score, visual: visual(row.player.team), date: date, game: game,
                            market: market == "completions" ? "passing_completions" : market, sample: sample, initialBook: book)
                    } else {
                        SidelinePlayerTrendView(row: row, visual: visual(row.player.team), market: market, book: book)
                    }
                }
                .presentationDragIndicator(.visible)
            }
        }
    }

    private var controls: some View {
        let servesPlayers = mismatch || page == .market || page == .exact || page == .explosive
        return VStack(alignment: .leading, spacing: 7) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    samplePicker
                    if mismatch || page == .market || page == .exact {
                        marketPicker
                        if !mismatch { sportsbookPicker }
                        ResearchToolFilter(title: "Sort", selection: activeSort.rawValue) {
                            Picker("Sort", selection: Binding(get: { activeSort }, set: { sort = $0 })) {
                                ForEach(mismatch ? [Sort.mismatch, .score] : [.edge, .hits], id: \.self) { Text($0.rawValue).tag($0) }
                            }
                        }
                    }
                    ResearchArtworkPicker(title: "Team",
                        options: [.init(id: "", title: "Both teams", icon: "person.2")] + teams.map {
                            .team(id: $0.code, title: $0.code, logo: $0.logo)
                        }, selection: $team)
                }
            }
            .scrollIndicators(.hidden)
            if servesPlayers {
                TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
            }
        }
    }

    private var samplePicker: some View {
        ResearchToolFilter(title: "Historical sample", selection: validResult?.sampleLabel ?? sample.label) {
            Picker("Historical sample", selection: $sample) {
                ForEach(SidelineResearchSample.allCases, id: \.self) { Text($0.label).tag($0) }
            }
        }
    }

    private var marketPicker: some View {
        let options = mismatch ? SidelineResearchMarket.mismatch : result?.1.markets ?? SidelineResearchMarket.mismatch
        return ResearchToolFilter(title: "Market", selection: SidelineResearchMarket.title(market)) {
            Picker("Market", selection: $market) {
                ForEach(Set(options + [market]).sorted(), id: \.self) { Text(SidelineResearchMarket.title($0)).tag($0) }
            }
        }
    }

    private var sportsbookPicker: some View {
        let books = result?.1.books ?? []
        return ResearchArtworkPicker(title: "Sportsbook",
            options: Set(books + [book]).sorted().map(ResearchArtworkPicker.Option.sportsbook), selection: $book)
    }

    @ViewBuilder
    private func data(_ data: SidelineResearchPayload) -> some View {
        if let cutoff = data.cutoffAt.flatMap(SidelineBoard.timestamp) {
            Label("Pregame cutoff \(cutoff.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        if data.availabilityStale || data.status != "calculated" {
            Text("Some research inputs are unavailable for this matchup and sample.").font(.caption).foregroundStyle(.secondary)
        }
        if mismatch {
            if data.matricesUnavailable == true {
                Text("Saved Matrices couldn’t load.").font(.caption).foregroundStyle(.secondary)
            }
            matrixFilters(data.rows)
        }
        if mismatch || page == .market || page == .exact {
            playerRows(data.rows)
        } else if page == .explosive {
            explosiveRows(data.explosives ?? [])
        } else if page == .gaps {
            gapRows(data.runGaps ?? [])
        } else if page == .defense {
            defenseRows(data.defense ?? [])
        }
    }

    @ViewBuilder
    private func playerRows(_ rows: [SidelineResearchPayload.Row]) -> some View {
        let visible = rows.filter { row in
            includes(row.player.team, name: row.player.name)
                && (page != .exact || mismatch || row.hits?.contains { $0 != nil } == true)
                && (matrixID == nil || row.matrices?.contains { $0.id == matrixID } == true)
        }
            .sorted { a, b in rank(a) == rank(b) ? a.player.name < b.player.name : rank(a) > rank(b) }
        if visible.isEmpty {
            empty
        } else {
            LazyVStack(spacing: 9) {
                ForEach(visible) { row in
                    ResearchToolCard(color: visual(row.player.team).primary) {
                        if mismatch || row.gameLog?.isEmpty == false {
                            Button { selectedRow = row } label: {
                                HStack {
                                    portrait(row.player)
                                    Spacer(minLength: 8)
                                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(SlipSurgePressStyle())
                            .accessibilityHint("Opens player trends")
                        } else {
                            portrait(row.player)
                        }
                    } content: {
                        if mismatch {
                            mismatchValues(row)
                        } else {
                            cheatsheetsValues(row)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func matrixFilters(_ rows: [SidelineResearchPayload.Row]) -> some View {
        let grouped = Dictionary(grouping: rows.flatMap { $0.matrices ?? [] }, by: \.id)
        let matches = grouped.values.compactMap { $0.first }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        if !matches.isEmpty || matrixID != nil {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    matrixFilter("All players", id: nil, tint: nil)
                    ForEach(matches) { matrix in
                        matrixFilter("\(matrix.name) · \(grouped[matrix.id]?.count ?? 0)", id: matrix.id, tint: Color(hex: matrix.color))
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            .accessibilityLabel("Filter by saved Matrix")
            .sensoryFeedback(.selection, trigger: matrixID)
        }
    }

    private func matrixFilter(_ title: String, id: String?, tint: Color?) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) { matrixID = id }
        } label: {
            HStack(spacing: 5) {
                if let tint { Circle().fill(tint).frame(width: 8, height: 8).accessibilityHidden(true) }
                Text(title).font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 11)
            .frame(minHeight: 40)
            .background(matrixID == id ? Brand.accent(for: scheme).opacity(0.18) : Color.secondary.opacity(0.10), in: Capsule())
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityAddTraits(matrixID == id ? .isSelected : [])
    }

    private func mismatchValues(_ row: SidelineResearchPayload.Row) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let status = row.status {
                Text(status).font(.caption).foregroundStyle(.secondary)
            }
            ResearchToolValues(items: [
                .init(label: "MM", text: ResearchFormat.signed(row.mm), tone: Brand.signal(row.mm.map(Double.init), for: scheme)),
                .init(label: "SlipSurge Score", text: ResearchFormat.decimal(row.score)),
                .init(label: "Market rank", text: rankText(row.sportsbookRank)),
                .init(label: "Performance rank", text: rankText(row.performanceRank))
            ])
            if let matrices = row.matrices, !matrices.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 5) {
                        ForEach(matrices) { matrix in
                            Label {
                                Text(matrix.name).foregroundStyle(.primary)
                            } icon: {
                                Image(systemName: "square.grid.3x3.fill").foregroundStyle(Color(hex: matrix.color) ?? .secondary)
                            }
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 5)
                            .background(Color.secondary.opacity(0.11), in: Capsule())
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .accessibilityLabel("Matching Matrices")
            }
        }
    }

    private func cheatsheetsValues(_ row: SidelineResearchPayload.Row) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let line = row.line {
                    Text("\(row.milestone == true ? "" : "Over ")\(line.formatted())\(row.milestone == true ? "+" : "")")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                ResearchToolBook(book: book, price: row.odds)
            }
            if page == .market {
                ResearchToolValues(items: [
                    .init(label: "Market edge", text: ResearchFormat.points(row.edge), tone: Brand.signal(row.edge, for: scheme)),
                    .init(label: "Model", text: ResearchFormat.decimal(row.modeled, suffix: "%")),
                    .init(label: "Opening", text: ResearchFormat.price(row.opening)),
                    .init(label: "Price movement", text: ResearchFormat.points(row.movement), tone: Brand.signal(row.movement, for: scheme)),
                    .init(label: "Projection", text: ResearchFormat.decimal(row.projection, suffix: market.contains("td") ? "%" : "")),
                    .init(label: "Public picks", text: row.picks.map(String.init) ?? "—")
                ])
            }
            ResearchSampleBars(labels: ["Season", "L10", "L5", "L3", "L1"], rates: (row.hits ?? []).map { $0.map { $0.rate / 100 } },
                counts: (row.hits ?? []).map { $0.map { "\($0.hits)/\($0.total)" } })
        }
    }

    @ViewBuilder
    private func explosiveRows(_ rows: [SidelineResearchPayload.Explosive]) -> some View {
        let visible = rows.filter { includes($0.player.team, name: $0.player.name) }
        if visible.isEmpty { empty }
        LazyVStack(spacing: 9) {
            ForEach(visible) { row in
                ResearchToolCard(color: visual(row.player.team).primary) {
                    portrait(row.player)
                } content: {
                    ResearchToolValues(items: [
                        value("Games", row.games), value("Deep targets", row.deepTargets), value("20+ rec.", row.receiving20),
                        value("30+ rec.", row.receiving30), value("40+ rec.", row.receiving40), value("10+ rush", row.rushing10),
                        value("20+ rush", row.rushing20), value("30+ rush", row.rushing30), value("40+ rush", row.rushing40),
                    ])
                }
            }
        }
    }

    @ViewBuilder
    private func gapRows(_ rows: [SidelineResearchPayload.RunGap]) -> some View {
        let visible = rows.filter { includesTeam($0.team) }.sorted { $0.edge > $1.edge }
        if visible.isEmpty { empty }
        LazyVStack(spacing: 9) {
            ForEach(visible) { row in
                ResearchToolCard(color: visual(row.team).primary) {
                    Label("\(row.team) · \(SidelineResearchMarket.title(row.gap))", systemImage: "arrow.triangle.branch").font(.headline)
                } content: {
                    ResearchToolValues(items: [
                        .init(label: "Edge", text: ResearchFormat.signedDecimal(row.edge), tone: Brand.signal(row.edge, for: scheme)),
                        .init(label: "\(row.team) YPC", text: ResearchFormat.decimal(row.yardsPerCarry)),
                        .init(label: "\(row.opponent) allowed YPC", text: ResearchFormat.decimal(row.defenseAttempts > 0 ? row.defenseYardsPerCarry : nil)),
                        .init(label: "Success", text: ResearchFormat.decimal(row.successRate, suffix: "%")),
                        .init(label: "Explosive", text: ResearchFormat.decimal(row.explosiveRate, suffix: "%")),
                        value("Attempts", row.attempts)
                    ])
                }
            }
        }
    }

    @ViewBuilder
    private func defenseRows(_ rows: [SidelineResearchPayload.Defense]) -> some View {
        let visible = rows.filter { includesTeam($0.defense) }.sorted { $0.pctDiff > $1.pctDiff }
        if visible.isEmpty { empty }
        LazyVStack(spacing: 9) {
            ForEach(visible) { row in
                ResearchToolCard(color: visual(row.defense).primary) {
                    Label("\(row.defense) · \(row.position) · \(SidelineResearchMarket.title(row.stat))", systemImage: "shield")
                        .font(.headline)
                } content: {
                    ResearchToolValues(items: [
                        .init(label: "Vs. league", text: ResearchFormat.signedDecimal(row.pctDiff, suffix: "%"), tone: Brand.signal(row.pctDiff, for: scheme)),
                        value("Games", row.games)
                    ])
                }
            }
        }
    }

    private var empty: some View {
        ContentUnavailableView("No rows for these filters", systemImage: mismatch ? "chart.bar.xaxis" : "tablecells")
    }

    private func portrait(_ player: SidelineResearchPayload.Player) -> some View {
        let team = visual(player.team)
        return ResearchToolPortrait(name: player.name, subtitle: [team.code, player.position].compactMap { $0 }.joined(separator: " · "),
            portraits: player.portraits, teamLogo: team.logo, primary: team.primary, secondary: team.secondary ?? team.primary)
    }

    private func visual(_ code: String) -> SidelineMarketTools.Visual {
        teams.first { SidelineResearchMarket.normalizeTeam($0.code) == SidelineResearchMarket.normalizeTeam(code) }
            ?? .init(code: code, logo: nil, primary: Brand.surface(for: scheme), secondary: nil)
    }

    private func includesTeam(_ code: String) -> Bool {
        team.isEmpty || SidelineResearchMarket.normalizeTeam(team) == SidelineResearchMarket.normalizeTeam(code)
    }

    private func includes(_ code: String, name: String) -> Bool {
        includesTeam(code) && (search.isEmpty || name.localizedCaseInsensitiveContains(search))
    }

    private func value(_ label: String, _ count: Int?) -> ResearchToolValues.Value {
        .init(label: label, text: count.map(String.init) ?? "—")
    }

    private func rankText(_ rank: Int?) -> String { rank.map { "#\($0)" } ?? "—" }

    private func rank(_ row: SidelineResearchPayload.Row) -> Double {
        switch activeSort {
        case .mismatch: row.mm.map(Double.init) ?? -.infinity
        case .score: row.score ?? -.infinity
        case .edge: row.edge ?? -.infinity
        case .hits: (row.hits?.first ?? nil)?.rate ?? -.infinity
        }
    }

    private func load(_ requested: Filters) async {
        error = nil
        do {
            let data = try await api.research(SidelineResearchPayload.self, tool: tool, date: date, game: game, sample: requested.sample, filters: [
                .init(name: "window", value: requested.window.rawValue.lowercased()), .init(name: "market", value: requested.market),
                .init(name: "book", value: requested.book)
            ])
            guard !Task.isCancelled, requested == filters else { return }
            guard data.gameId == game, data.date == date, data.tool == tool.rawValue, data.market == requested.market,
                  data.book == requested.book, data.window == requested.window.rawValue.lowercased() else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { result = (requested, data) }
        } catch {
            if !Task.isCancelled, requested == filters { self.error = error }
        }
    }
}
