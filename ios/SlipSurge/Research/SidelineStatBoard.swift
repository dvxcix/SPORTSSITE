import SwiftUI

struct SidelineStatBoard: View {
    private enum Category: String, CaseIterable {
        case role = "Role Command", scoring = "Score Zone", receiving = "Receiving Value", routes = "Route Leverage"
        case rushing = "Ground Game", passing = "QB Command", explosive = "Explosive Lanes", market = "Market Signal"

        var fields: [String] {
            switch self {
            case .role: ["volume", "targetShare", "carryShare", "evidence"]
            case .scoring: ["redZone", "redZoneLooks", "goalLineLooks", "touchdowns"]
            case .receiving: ["receivingYards", "receptions", "catchRate", "yacAboveExpected", "separation", "targets"]
            case .routes: ["geometry", "airYards", "airYardsShare", "separation", "catchRate"]
            case .rushing: ["rushingYards", "carries", "carryShare", "rushOverExpected", "breakaway"]
            case .passing: ["passingYards", "passAttempts", "completionRate", "cpoe", "timeToThrow"]
            case .explosive: ["breakaway", "explosivePlays", "yacAboveExpected", "airYardsShare"]
            case .market: []
            }
        }
    }

    private enum Role: String, CaseIterable {
        case all = "All roles", quarterback = "QB", receiving = "Receivers", rushing = "Backfield"
        case kicking = "Kickers", defense = "Defense"

        func accepts(_ position: String?) -> Bool {
            let codes: [String] = switch self {
            case .all: []
            case .quarterback: ["QB"]
            case .receiving: ["WR", "TE"]
            case .rushing: ["RB", "FB"]
            case .kicking: ["K", "PK"]
            case .defense: ["DEF", "DST", "CB", "DB", "FS", "SS", "LB", "OLB", "ILB", "MLB", "DE", "DT", "NT"]
            }
            return self == .all || position.map(codes.contains) == true
        }
    }

    private struct Projection: Decodable {
        struct Player: Decodable {
            let id: Int
            let gsisId: String?
            let name: String
            let team: String
            let position: String?
            let headshot: URL?
            let headshotFallbacks: [URL]?
            var portraits: [URL] { (headshot.map { [$0] } ?? []) + (headshotFallbacks ?? []) }
        }

        struct Signal: Decodable {
            struct Quote: Decodable {
                let line: Double?
                let price: Int?
                let opening: Int?
                let observedAt: String?
            }
            let first: Quote?
            let anytime: Quote?
            let role: Quote?
            let roleMarket: String
            let firstPicks: Int?
            let anytimePicks: Int?
            let ratio: Double?
            let moneylineRatio: Double?
            let roleRatio: Double?
            let baselineMove: Double?
            let baselineGames: Int?
        }

        struct Row: Decodable, Identifiable {
            let player: Player
            let games: Int?
            let lane: String?
            let status: String?
            let score: Double?
            let mm: Int?
            let metrics: [String: Double]
            let signal: Signal?

            var id: String { "\(player.team):\(player.id)" }

            func value(_ field: String) -> Double? {
                switch field {
                case "score": score
                case "mm": mm.map(Double.init)
                default: metrics[field]
                }
            }
        }

        struct Team: Decodable, Identifiable {
            let code: String
            let name: String
            let plays: Int
            let metrics: [String: Double]
            var id: String { code }
        }

        let gameId: String
        let date: String
        let tool: String
        let book: String
        let window: String
        let sampleLabel: String
        let status: String
        let availabilityStale: Bool
        let cutoffAt: String?
        let rows: [Row]
        let profiles: [Team]
        let books: [String]
        let sampleWeeks: [Int]
        let headline: String
        let headlineDetail: String
    }

    private struct Request: Equatable {
        let sample: SidelineResearchSample
        let window: SidelineStatWindow
        let book: String
        let revision: Int
    }

    private struct CustomLayout: Codable {
        var order: [String]
        var visible: Set<String>

        static let standard = CustomLayout(order: SidelineStatColumn.columns.map(\.id),
            visible: ["score", "mm", "volume", "roleOpps", "roleShare", "roleYards"])
    }

    let api: SidelineAPI
    let game: String
    let date: String
    let teams: [SidelineMarketTools.Visual]
    let mode: SidelineStatMode
    let revision: Int
    let initialPlayer: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sample: SidelineResearchSample
    @State private var book: String
    @State private var window = SidelineStatWindow.season
    @State private var category = Category.role
    @State private var team = ""
    @State private var role = Role.all
    @State private var search = ""
    @State private var sort: String?
    @State private var ascending = false
    @State private var retry = 0
    @State private var response: (Request, Projection)?
    @State private var error: (Request, any Error)?
    @State private var layout = CustomLayout.standard
    @State private var configuring = false
    @State private var player: Projection.Row?
    @State private var openedLinkedPlayer = false
    @State private var comparing: [String] = []
    @State private var comparisonOpen = false

    init(api: SidelineAPI, game: String, date: String, teams: [SidelineMarketTools.Visual], mode: SidelineStatMode,
        revision: Int, initialSample: SidelineResearchSample, initialBook: String?, initialPlayer: Int? = nil) {
        self.api = api
        self.game = game
        self.date = date
        self.teams = teams
        self.mode = mode
        self.revision = revision
        self.initialPlayer = initialPlayer
        _sample = State(initialValue: initialSample)
        _book = State(initialValue: initialBook.flatMap { $0 == "all" ? nil : $0 } ?? "fanduel")
    }

    private var tool: SidelineResearchTool { mode == .matchup ? .matchup : .board }
    private var request: Request { .init(sample: sample, window: window, book: book, revision: revision + retry) }
    private var projection: Projection? { response.flatMap { $0.0 == request ? $0.1 : nil } }
    private var storageKey: String? {
        guard case .member(_, let id) = api.scope else { return nil }
        return "slipsurge.nfl.columns." + id.uuidString
    }
    private var columns: [SidelineStatColumn] {
        let all = SidelineStatColumn.columns
        return switch mode {
        case .gameDay: all.filter { ["score", "mm", "volume", "roleOpps", "roleShare", "roleYards"].contains($0.id) }
        case .usage: all.filter { $0.category == .usage }
        case .tracking: all.filter { $0.category == .tracking }
        case .team: all.filter { $0.category == .team }
        case .all: all
        case .custom: layout.order.compactMap { name in layout.visible.contains(name) ? all.first { $0.id == name } : nil }
        case .matchup: category.fields.compactMap { key in all.first { $0.id == key } }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            if mode != .gameDay { ResearchSectionTitle(title: mode.rawValue) }
            controls
            if let projection { board(projection) }
            else {
                ResearchToolMessage(title: "Matchup research couldn’t load",
                    error: error.flatMap { $0.0 == request ? $0.1 : nil }) { retry += 1 }
            }
        }
        .task(id: request) { await load(request) }
        .onAppear(perform: restoreLayout)
        .sheet(isPresented: $configuring) { editor }
        .sheet(item: $player) { row in playerDetail(row) }
        .sheet(isPresented: $comparisonOpen) {
            SidelinePlayerComparison(api: api, date: date, game: game, players: comparisonPlayers,
                statsLoading: projection == nil, remove: toggleComparison, clear: { comparing.removeAll() }, sample: $window)
        }
        .sensoryFeedback(.selection, trigger: comparing)
    }

    private var controls: some View {
        let options = Set((response?.1.books ?? []) + [book]).sorted()
        return VStack(alignment: .leading, spacing: 7) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ResearchToolFilter(title: "Historical sample", selection: projection?.sampleLabel ?? sample.label) {
                        Picker("Historical sample", selection: $sample) {
                            ForEach(SidelineResearchSample.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    if mode != .team {
                        ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "shield")]
                            + teams.map { .team(id: $0.code, title: $0.code, logo: $0.logo) }, selection: $team)
                        ResearchToolFilter(title: "Role", selection: role.rawValue) {
                            Picker("Role", selection: $role) {
                                ForEach(Role.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                            }
                        }
                        SportsbookPicker(books: options, selection: $book)
                        sortPicker
                    }
                }.padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            Picker("Games", selection: $window) {
                ForEach(SidelineStatWindow.allCases, id: \.self) { Text($0.label).tag($0) }
            }.pickerStyle(.segmented)
            if mode == .matchup {
                ResearchToolRail(title: "Matchup research", choices: Category.allCases, selection: $category, label: \.rawValue)
            }
            if mode == .custom {
                Button("Customize columns", systemImage: "slider.horizontal.3") { configuring = true }.buttonStyle(.bordered)
            }
            if mode != .team {
                TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
                if !comparing.isEmpty {
                    Button("Compare (\(comparing.count))", systemImage: "rectangle.split.2x1") { comparisonOpen = true }
                        .buttonStyle(.borderedProminent)
                        .tint(Brand.accent(for: scheme))
                        .foregroundStyle(scheme == .dark ? Color(rgb: 0x0C1118) : .white)
                        .controlSize(.large)
                }
            }
        }
    }

    private var sortPicker: some View {
        Menu("Sort", systemImage: ascending ? "arrow.up" : "arrow.down") {
            Picker("Sort", selection: $sort) {
                Text("Default").tag(nil as String?)
                Text("Name").tag(Optional("name"))
                ForEach(columns.filter { $0.category != .team }) { Text($0.label).tag(Optional($0.id)) }
            }
            Toggle("Ascending", isOn: $ascending)
        }.frame(minHeight: 44)
    }

    @ViewBuilder private func board(_ data: Projection) -> some View {
        if let cutoff = data.cutoffAt.flatMap(SidelineBoard.timestamp) {
            Label("Pregame cutoff \(cutoff.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        if data.status == "awaiting-data" {
            Label(data.headline, systemImage: "clock.badge.questionmark").font(.subheadline.weight(.semibold))
            Text(data.headlineDetail).font(.caption).foregroundStyle(.secondary)
        }
        if data.availabilityStale {
            Label("Player prices and ranks are unavailable until lineup verification.", systemImage: "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        let teamFields = mode == .matchup ? SidelineStatColumn.columns.filter { $0.category == .team }
            : columns.filter { $0.category == .team }
        if !teamFields.isEmpty {
            ForEach(data.profiles) { profile in teamCard(profile, fields: teamFields) }
        }
        if mode != .team {
            let rows = filtered(data.rows)
            if rows.isEmpty {
                ContentUnavailableView("No player data in this sample", systemImage: "person.crop.circle.badge.questionmark")
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 2) {
                        sortColumn("Name", field: "name")
                        ForEach(playerFields) { column in sortColumn(column.label, field: column.id) }
                    }
                }
                .scrollIndicators(.hidden)
                .accessibilityLabel("Sort players by column")
                LazyVStack(spacing: 8) {
                    ForEach(rows) { row in playerCard(row, fields: playerFields) }
                }
            }
        } else if data.profiles.isEmpty {
            ContentUnavailableView("No team data in this sample", systemImage: "football")
        }
    }

    private var playerFields: [SidelineStatColumn] { columns.filter { $0.category != .team } }

    private var sortingField: String? { sort ?? (mode == .matchup ? category.fields.first : playerFields.first?.id) }

    private func sortColumn(_ label: String, field: String) -> some View {
        ResearchSortHeader(title: label, selected: sortingField == field, ascending: ascending) {
            if sortingField == field {
                ascending.toggle()
            } else {
                sort = field
                ascending = field == "name"
            }
        }
    }

    private func filtered(_ rows: [Projection.Row]) -> [Projection.Row] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let field = sortingField
        return rows.filter { row in
            (team.isEmpty || normalized(row.player.team) == normalized(team)) && role.accepts(row.player.position)
                && (term.isEmpty || "\(row.player.name) \(row.player.team) \(row.player.position ?? "")".localizedStandardContains(term))
        }.sorted { a, b in
            if let field, field != "name" {
                let left = a.value(field), right = b.value(field)
                if let left, let right, left != right { return ascending ? left < right : left > right }
                if (left == nil) != (right == nil) { return left != nil }
            } else if field == nil, mode == .matchup, category == .market, a.signal?.anytime?.price != b.signal?.anytime?.price {
                return (a.signal?.anytime?.price ?? .max) < (b.signal?.anytime?.price ?? .max)
            }
            let order = a.player.name.localizedStandardCompare(b.player.name)
            if order != .orderedSame { return sort == "name" && !ascending ? order == .orderedDescending : order == .orderedAscending }
            return a.id < b.id
        }
    }

    private func playerCard(_ row: Projection.Row, fields: [SidelineStatColumn]) -> some View {
        let colors = visual(row.player.team)
        return ResearchToolCard(color: colors.primary) {
            HStack(spacing: 2) {
                Button { player = row } label: {
                    HStack(spacing: 6) {
                        portrait(row, colors: colors)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }.contentShape(.rect)
                }.buttonStyle(SlipSurgePressStyle())
                let selected = comparing.contains(row.id)
                Button(selected ? "Remove \(row.player.name) from comparison" : "Compare \(row.player.name)",
                    systemImage: selected ? "checkmark.circle.fill" : "plus.circle") { toggleComparison(row.id) }
                    .labelStyle(.iconOnly).font(.title3)
                    .foregroundStyle(selected ? Brand.accent(for: scheme) : .secondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .buttonStyle(.plain)
                    .disabled(!selected && comparing.count >= 4)
            }
        } content: {
            if !fields.isEmpty {
                values(row, fields: Array(fields.prefix(6)))
                if fields.count > 6 {
                    DisclosureGroup("More stats") { values(row, fields: Array(fields.dropFirst(6))) }
                        .font(.subheadline.weight(.medium))
                }
            }
            if mode == .gameDay || mode == .matchup && category == .market {
                marketSignal(row.signal)
            }
        }
    }

    private var comparisonPlayers: [SidelinePlayerComparison.Player] {
        comparing.compactMap { id in
            guard let row = response?.1.rows.first(where: { $0.id == id }) else { return nil }
            var values = row.metrics
            values["score"] = row.score
            values["mm"] = row.mm.map(Double.init)
            return .init(id: row.id, rosterID: row.player.id, name: row.player.name, team: visual(row.player.team),
                position: row.player.position, status: row.status, portraits: row.player.portraits, values: values)
        }
    }

    private func toggleComparison(_ id: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            if let index = comparing.firstIndex(of: id) { comparing.remove(at: index) }
            else if comparing.count < 4 { comparing.append(id) }
        }
    }

    private func portrait(_ row: Projection.Row, colors: SidelineMarketTools.Visual) -> some View {
        ResearchToolPortrait(name: row.player.name,
            subtitle: [colors.code, row.player.position, row.lane, row.status].compactMap { $0 }.joined(separator: " · "),
            portraits: row.player.portraits, teamLogo: colors.logo, primary: colors.primary, secondary: colors.secondary ?? colors.primary)
    }

    private func teamCard(_ profile: Projection.Team, fields: [SidelineStatColumn]) -> some View {
        let colors = visual(profile.code)
        return ResearchToolCard(color: colors.primary) {
            HStack(spacing: 8) {
                ResearchArtwork(urls: colors.logo.map { [$0] } ?? [], fallback: "shield")
                    .frame(width: 28, height: 28).accessibilityHidden(true)
                Text(profile.name).font(.headline)
                Spacer()
                Text("\(profile.plays) plays").font(.caption).foregroundStyle(.secondary)
            }
        } content: {
            ResearchToolValues(items: fields.map { field in
                .init(label: field.label, text: profile.metrics[field.id].map(field.unit.format) ?? "—")
            })
        }
    }

    private func values(_ row: Projection.Row, fields: [SidelineStatColumn]) -> some View {
        ResearchToolValues(items: fields.map { column in
            let value = row.value(column.id)
            let text = column.id == "mm" ? ResearchFormat.signed(row.mm) : value.map(column.unit.format) ?? "—"
            let signal = column.id == "mm" ? value : column.id == "cpoe" || column.id == "yacAboveExpected" ||
                column.id == "rushOverExpected" ? value : nil
            return .init(label: column.label, text: text, tone: Brand.signal(signal, for: scheme))
        })
    }

    @ViewBuilder private func marketSignal(_ signal: Projection.Signal?) -> some View {
        if let signal {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Anytime TD").font(.caption.weight(.medium))
                    ResearchToolBook(book: book, price: signal.anytime?.price)
                }
                Spacer()
                VStack(alignment: .leading, spacing: 4) {
                    Text("First TD").font(.caption.weight(.medium))
                    ResearchToolBook(book: book, price: signal.first?.price)
                }
            }
            ResearchToolValues(items: [
                .init(label: "FTD : ATD", text: ResearchFormat.decimal(signal.ratio)),
                .init(label: "ATD : team ML", text: ResearchFormat.decimal(signal.moneylineRatio)),
                .init(label: "Anytime picks", text: signal.anytimePicks.map(String.init) ?? "—"),
                .init(label: "First TD picks", text: signal.firstPicks.map(String.init) ?? "—"),
                .init(label: "Own baseline", text: ResearchFormat.points(signal.baselineMove),
                    tone: Brand.signal(signal.baselineMove, for: scheme)),
            ])
            if let example = signal.role {
                HStack {
                    Text(SidelineResearchMarket.title(signal.roleMarket)).font(.caption)
                    if let line = example.line { Text(line.formatted()).font(.caption.weight(.semibold)) }
                    Spacer()
                    ResearchToolBook(book: book, price: example.price)
                }
            }
        } else {
            Text("No eligible recorded prices for this player.").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func playerDetail(_ row: Projection.Row) -> some View {
        let colors = visual(row.player.team)
        return NavigationStack {
            List {
                Section {
                    portrait(row, colors: colors)
                    if let games = row.games { Text("\(games) recorded games").font(.caption).foregroundStyle(.secondary) }
                }
                ForEach([SidelineStatColumn.Category.core, .usage, .tracking], id: \.self) { group in
                    Section(group.rawValue) { values(row, fields: SidelineStatColumn.columns.filter { $0.category == group }) }
                }
                Section("Market Signal") { marketSignal(row.signal) }
                if let id = row.player.gsisId, case .member(let account, let userID) = api.scope {
                    NavigationLink("Player profile and game logs") {
                        NflDirectoryEntityView(api: .init(account: account, userID: userID), kind: .player, id: id)
                    }
                }
            }
            .navigationTitle(row.player.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { player = nil } }
            }
        }.presentationDragIndicator(.visible)
    }

    private var editor: some View {
        NavigationStack {
            List {
                ForEach(layout.order, id: \.self) { id in
                    if let column = SidelineStatColumn.columns.first(where: { $0.id == id }) {
                        Toggle(column.label, isOn: Binding(get: { layout.visible.contains(id) }, set: { enabled in
                            if enabled { layout.visible.insert(id) } else { layout.visible.remove(id) }
                            saveLayout()
                        }))
                    }
                }.onMove { indices, offset in layout.order.move(fromOffsets: indices, toOffset: offset); saveLayout() }
                Button("Reset columns") { layout = .standard; saveLayout() }
            }
            .navigationTitle("Customize columns")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { configuring = false } }
            }
        }
    }

    private func restoreLayout() {
        guard let storageKey, let data = UserDefaults.standard.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode(CustomLayout.self, from: data) else { return }
        let current = CustomLayout.standard.order
        var seen = Set<String>()
        let order = (saved.order + current).filter { current.contains($0) && seen.insert($0).inserted }
        layout = .init(order: order, visible: saved.visible.intersection(current))
    }

    private func saveLayout() {
        if let storageKey, let data = try? JSONEncoder().encode(layout) { UserDefaults.standard.set(data, forKey: storageKey) }
    }

    private func normalized(_ value: String) -> String { SidelineResearchMarket.normalizeTeam(value) }

    private func visual(_ code: String) -> SidelineMarketTools.Visual {
        teams.first { normalized($0.code) == normalized(code) } ??
            .init(code: code, logo: nil, primary: Brand.accent(for: scheme), secondary: nil)
    }

    private func load(_ wanted: Request) async {
        do {
            let payload = try await api.research(Projection.self, tool: tool,
                date: date, game: game, sample: wanted.sample, filters: [
                    .init(name: "window", value: wanted.window.rawValue), .init(name: "book", value: wanted.book),
                ])
            try Task.checkCancellation()
            guard wanted == request, payload.date == date, payload.gameId == game, payload.tool == tool.rawValue,
                payload.window == wanted.window.rawValue, payload.book == wanted.book else { return }
            response = (wanted, payload)
            if !openedLinkedPlayer, let initialPlayer {
                player = payload.rows.first { $0.player.id == initialPlayer }
                openedLinkedPlayer = true
            }
            error = nil
        } catch {
            if !Task.isCancelled, wanted == request { self.error = (wanted, error) }
        }
    }
}
