import Charts
import SwiftUI

struct DugoutOddsTerminal: View {
    private enum Axis: String, CaseIterable, Codable {
        case price = "Odds", probability = "Implied %", change = "From open"

        func value(_ point: DugoutOddsHistory.Capture, series: DugoutOddsHistory.Series) -> Double {
            switch self {
            case .price: Double(point.odds)
            case .probability: point.implied * 100
            case .change: Double(point.odds - (series.opening?.odds ?? point.odds))
            }
        }
    }

    private enum Ranking: String, CaseIterable {
        case movement = "Movement", price = "Latest odds", player = "Player", book = "Sportsbook"
    }

    private struct Filters: Codable, Equatable {
        var market = "fhr"
        var book = ""
        var axis = Axis.price
        var hours = 0
        var movers = true
    }

    private struct Preset: Codable, Identifiable {
        var id = UUID()
        let title: String
        let filters: Filters
    }

    let api: DugoutAPI
    @State var date: Date
    @State var selectedGame: Int?
    @AppStorage("dugoutOddsTerminalPresets") private var storedPresets = Data()
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var slate: DugoutBoard?
    @State private var history: DugoutOddsHistory?
    @State private var filters = Filters()
    @State private var ranking = Ranking.movement
    @State private var players: Set<Int> = []
    @State private var pinned: Set<String> = []
    @State private var cursor: Date?
    @State private var revision = 0
    @State private var slateError: (any Error)?
    @State private var historyError: (any Error)?
    @State private var choosesPlayers = false
    @State private var managesPresets = false
    @State private var presetTitle = ""

    private var key: String { SlateDate.key(date) }
    private var game: DugoutBoard.Game? {
        guard let slate, slate.date == key else { return nil }
        return selectedGame.flatMap { id in slate.games.first { $0.id == id } } ?? (selectedGame == nil ? slate.games.first : nil)
    }
    private var presets: [Preset] { (try? JSONDecoder().decode([Preset].self, from: storedPresets)) ?? [] }
    private var timestampStyle: Date.FormatStyle {
        var style = Date.FormatStyle().month(.abbreviated).day().hour().minute()
        style.timeZone = SlateDate.zone
        return style
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ResearchSlateControls(date: $date)
                if let slate, slate.date == key {
                    matchupControl(slate)
                    if let game {
                        if game.locked {
                            ContentUnavailableView("Ultimate access required", systemImage: "lock")
                        } else if let history, history.date == key, history.gameId == game.id {
                            contents(history, game: game)
                        } else {
                            ResearchToolMessage(title: "Odds movement couldn’t load", error: historyError) { revision += 1 }
                        }
                    } else {
                        ContentUnavailableView(slate.games.isEmpty ? "No games on this date" : "Choose a matchup on this slate", systemImage: "calendar")
                    }
                } else {
                    ResearchToolMessage(title: "The slate couldn’t load", error: slateError) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Odds Movement Terminal")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(key):\(revision)") { await loadSlate() }
        .task(id: "\(key):\(game?.id ?? 0):\(revision)") { await loadHistory() }
        .onChange(of: key) { selectedGame = nil }
        .onChange(of: game?.id) { players = []; pinned = []; cursor = nil }
        .onChange(of: filters) { cursor = nil }
        .refreshable { revision += 1 }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Presets", systemImage: "bookmark") { managesPresets = true }.labelStyle(.iconOnly)
            }
        }
        .sheet(isPresented: $choosesPlayers) { if let game { playerSheet(game) } }
        .sheet(isPresented: $managesPresets) { presetSheet }
    }

    private func matchupControl(_ slate: DugoutBoard) -> some View {
        let counts = Dictionary(grouping: slate.games, by: { "\($0.away.code)\($0.home.code)" }).mapValues(\.count)
        return ResearchArtworkPicker(title: "Matchup", options: slate.games.map { item in
            let repeated = counts["\(item.away.code)\(item.home.code)", default: 0] > 1
            return .init(id: String(item.id), title: "\(item.away.code) at \(item.home.code) · \(item.statusLabel(doubleheader: repeated))",
                url: item.away.logo, secondaryLogo: item.home.logo, icon: "baseball")
        }, selection: Binding(get: { game.map { String($0.id) } ?? "" }, set: { selectedGame = Int($0) }))
        .disabled(slate.games.isEmpty)
    }

    private func contents(_ history: DugoutOddsHistory, game: DugoutBoard.Game) -> some View {
        let availableMarkets = Set(history.series.map(\.market))
        let menu = DugoutOddsHistory.Market.all.filter { availableMarkets.contains($0.id) }
        let rows = ranked(history.series.filter { series in
            series.market == filters.market && (filters.book.isEmpty || series.book == filters.book) &&
                (players.isEmpty || players.contains(series.playerId)) && (!filters.movers || series.movement != 0 || pinned.contains(series.id))
        }, game: game)
        let names = Dictionary(game.batters.map { ($0.id, $0) }, uniquingKeysWith: { initial, _ in initial })
        return VStack(alignment: .leading, spacing: 12) {
            ResearchToolCard(color: game.home.color) {
                ResearchSectionTitle(title: "Pregame history")
            } content: {
                HStack {
                    Label("\(history.sourceCount.formatted()) captures", systemImage: "waveform.path")
                    Spacer()
                    if history.firstPitchAt != nil { Label("Frozen at first pitch", systemImage: "lock") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            if menu.isEmpty {
                ContentUnavailableView("No saved sportsbook history", systemImage: "chart.line.uptrend.xyaxis")
            } else {
                filtersPanel(menu, history: history)
                if rows.isEmpty {
                    ContentUnavailableView("No matching lines", systemImage: "line.3.horizontal.decrease")
                } else {
                    let displayed = Array(rows.prefix(14))
                    chart(displayed, names: names, color: game.home.color)
                    HStack {
                        ResearchSectionTitle(title: "Price changes")
                        Spacer()
                        Menu("Sort", systemImage: "arrow.up.arrow.down") {
                            Picker("Sort", selection: $ranking) {
                                ForEach(Ranking.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                            }
                        }.labelStyle(.iconOnly)
                    }
                    ForEach(rows) { line in
                        if let player = names[line.playerId] { priceRow(line, player: player, game: game) }
                    }
                }
            }
        }
    }

    private func filtersPanel(_ menu: [DugoutOddsHistory.Market], history: DugoutOddsHistory) -> some View {
        let options = Set(history.series.lazy.filter { $0.market == filters.market }.map(\.book)).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            ResearchArtworkPicker(title: "Market", options: menu.map { .init(id: $0.id, title: $0.label, icon: "chart.bar") },
                selection: $filters.market)
            ResearchArtworkPicker(title: "Sportsbook", options: [.init(id: "", title: "All sportsbooks", icon: "chart.bar.xaxis")]
                + options.map { book in .init(id: book, title: Sportsbook.name(Sportsbook.normalized(book)),
                    asset: Sportsbook.artwork(Sportsbook.normalized(book)), icon: "chart.bar") }, selection: $filters.book)
            Picker("Chart scale", selection: $filters.axis) {
                ForEach(Axis.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented)
            HStack {
                Button(players.isEmpty ? "All batters" : "\(players.count) batters", systemImage: "person.2") { choosesPlayers = true }
                    .buttonStyle(.bordered)
                Menu {
                    Picker("Time window", selection: $filters.hours) {
                        ForEach([0, 12, 6, 2, 1], id: \.self) { hours in Text(hours == 0 ? "All captures" : "Last \(hours)h").tag(hours) }
                    }
                } label: { Label(filters.hours == 0 ? "All captures" : "Last \(filters.hours)h", systemImage: "clock") }
                .buttonStyle(.bordered)
                Button(filters.movers ? "Movers" : "All lines", systemImage: filters.movers ? "arrow.up.arrow.down" : "line.horizontal.3") {
                    filters.movers.toggle()
                }.buttonStyle(.bordered)
            }
            .font(.subheadline)
        }
        .onChange(of: options) { _, choices in if !choices.contains(filters.book) { filters.book = "" } }
    }

    private func chart(_ rows: [DugoutOddsHistory.Series], names: [Int: DugoutBoard.Batter], color: Color) -> some View {
        let latest = rows.compactMap { $0.latest?.time }.max() ?? date
        let oldest = rows.compactMap { $0.opening?.time }.min() ?? latest
        let start = filters.hours == 0 ? oldest : max(oldest, latest.addingTimeInterval(-Double(filters.hours) * 3600))
        let end = max(latest, start.addingTimeInterval(60))
        return ResearchToolCard(color: color) {
            ResearchSectionTitle(title: "Line movement")
        } content: {
            Chart {
                ForEach(rows) { line in
                    ForEach(line.points.filter { $0.time >= start }) { point in
                        LineMark(x: .value("Capture", point.time), y: .value(filters.axis.rawValue, filters.axis.value(point, series: line)),
                            series: .value("Series", line.id))
                            .interpolationMethod(.stepEnd)
                            .foregroundStyle(by: .value("Line", line.id))
                        PointMark(x: .value("Capture", point.time), y: .value(filters.axis.rawValue, filters.axis.value(point, series: line)))
                            .symbolSize(12)
                            .foregroundStyle(by: .value("Line", line.id))
                    }
                }
                if let cursor { RuleMark(x: .value("Selected capture", cursor)).lineStyle(.init(dash: [4, 3])) }
            }
            .chartLegend(.hidden)
            .chartXScale(domain: start...end)
            .chartXSelection(value: $cursor)
            .frame(height: 205)
            .accessibilityLabel("Sportsbook movement over time")
            if let cursor {
                let recent = rows.prefix(4).compactMap { line -> (DugoutOddsHistory.Series, DugoutOddsHistory.Capture)? in
                    line.nearest(to: cursor).map { (line, $0) }
                }
                ForEach(recent, id: \.0.id) { line, point in
                    HStack {
                        Text(names[line.playerId]?.name ?? "").fontWeight(.semibold).lineLimit(1)
                        Spacer()
                        Text(point.time.formatted(timestampStyle)).foregroundStyle(.secondary)
                        Text(ResearchFormat.price(point.odds)).monospacedDigit()
                    }
                    .font(.caption)
                }
            }
        }
    }

    private func priceRow(_ series: DugoutOddsHistory.Series, player: DugoutBoard.Batter, game: DugoutBoard.Game) -> some View {
        let team = game.team(for: player)
        let normalized = Sportsbook.normalized(series.book)
        return ResearchToolCard(color: team.color) {
            HStack {
                ResearchToolPortrait(name: player.name, subtitle: team.name, portraits: [player.headshot], teamLogo: team.logo,
                    primary: team.color, secondary: team.secondaryColor)
                Spacer()
                Button(pinned.contains(series.id) ? "Unpin line" : "Pin line", systemImage: pinned.contains(series.id) ? "pin.fill" : "pin") {
                    withAnimation(reduceMotion ? nil : .snappy) {
                        if pinned.contains(series.id) { pinned.remove(series.id) } else { pinned.insert(series.id) }
                    }
                }
                .labelStyle(.iconOnly).buttonStyle(.bordered)
            }
        } content: {
            HStack {
                if let asset = Sportsbook.artwork(normalized) { Image(asset).resizable().scaledToFit().frame(width: 20, height: 20) }
                Text(Sportsbook.name(normalized)).font(.caption.weight(.medium))
                if let line = series.line { Text("Over \(line.formatted())").font(.caption).foregroundStyle(.secondary) }
            }
            ResearchToolValues(items: [
                .init(label: "Open", text: ResearchFormat.price(series.opening?.odds)),
                .init(label: "Latest", text: ResearchFormat.price(series.latest?.odds)),
                .init(label: "Movement", text: ResearchFormat.signed(series.movement), tone: movementTone(series.movement)),
            ])
        }
    }

    private func ranked(_ rows: [DugoutOddsHistory.Series], game: DugoutBoard.Game) -> [DugoutOddsHistory.Series] {
        let names = Dictionary(game.batters.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        return rows.sorted { left, right in
            let leftPinned = pinned.contains(left.id), rightPinned = pinned.contains(right.id)
            if leftPinned != rightPinned { return leftPinned }
            switch ranking {
            case .movement: if abs(left.movement) != abs(right.movement) { return abs(left.movement) > abs(right.movement) }
            case .price: if left.latest?.odds != right.latest?.odds { return (left.latest?.odds ?? 0) > (right.latest?.odds ?? 0) }
            case .player: if names[left.playerId] != names[right.playerId] { return (names[left.playerId] ?? "") < (names[right.playerId] ?? "") }
            case .book: if left.book != right.book { return left.book < right.book }
            }
            return left.id < right.id
        }
    }

    private func movementTone(_ move: Int) -> Color? {
        guard move != 0 else { return nil }
        return Color(rgb: move < 0 ? (scheme == .dark ? 0x80EFAB : 0x176442) : (scheme == .dark ? 0xFFA1A0 : 0xA32335))
    }

    private func playerSheet(_ game: DugoutBoard.Game) -> some View {
        NavigationStack {
            List(game.batters) { player in
                let team = game.team(for: player)
                Button {
                    if players.contains(player.id) { players.remove(player.id) } else { players.insert(player.id) }
                } label: {
                    HStack {
                        ResearchToolPortrait(name: player.name, subtitle: team.name, portraits: [player.headshot], teamLogo: team.logo,
                            primary: team.color, secondary: team.secondaryColor)
                        Spacer()
                        if players.contains(player.id) { Image(systemName: "checkmark.circle.fill") }
                    }
                }.buttonStyle(.plain)
                .accessibilityAddTraits(players.contains(player.id) ? .isSelected : [])
            }
            .navigationTitle("Batters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("All batters") { players = [] } }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { choosesPlayers = false } }
            }
        }
    }

    private var presetSheet: some View {
        NavigationStack {
            List {
                Section("Save these filters") {
                    TextField("Preset name", text: $presetTitle)
                    Button("Save preset", systemImage: "bookmark") {
                        savePresets(Array((presets + [Preset(title: String(presetTitle.trimmingCharacters(in: .whitespacesAndNewlines).prefix(36)), filters: filters)]).suffix(6)))
                        presetTitle = ""
                    }.disabled(presetTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ForEach(presets) { preset in
                    Button(preset.title) { filters = preset.filters; managesPresets = false }
                        .swipeActions { Button("Delete", role: .destructive) { savePresets(presets.filter { $0.id != preset.id }) } }
                }
                Button("Reset filters") { filters = Filters(); players = []; pinned = []; managesPresets = false }
            }
            .navigationTitle("Terminal presets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { managesPresets = false } } }
        }
    }

    private func savePresets(_ next: [Preset]) {
        if let data = try? JSONEncoder().encode(next) { storedPresets = data }
    }

    private func loadSlate() async {
        let requested = key
        do {
            let value = try await api.board(date: requested, mode: .pregame)
            if !Task.isCancelled, key == requested { slate = value; slateError = nil }
        } catch {
            if !Task.isCancelled, key == requested { slate = nil; slateError = error }
        }
    }

    private func loadHistory() async {
        guard let game, !game.locked else { return }
        let requested = key
        historyError = nil
        do {
            let value = try await api.oddsHistory(date: requested, game: game.id)
            guard !Task.isCancelled, key == requested, self.game?.id == game.id else { return }
            history = value
            let markets = Set(value.series.map(\.market))
            if !markets.contains(filters.market), let first = DugoutOddsHistory.Market.all.first(where: { markets.contains($0.id) }) {
                filters.market = first.id
            }
        } catch {
            if !Task.isCancelled, key == requested, self.game?.id == game.id { history = nil; historyError = error }
        }
    }
}
