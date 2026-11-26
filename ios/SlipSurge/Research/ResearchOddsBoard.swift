import Charts
import SwiftUI

struct ResearchOddsSlate {
    struct Game: Identifiable {
        let id: String
        let title: String
        var away: ResearchMatchup.Team?
        var home: ResearchMatchup.Team?
    }

    struct Team: Hashable {
        let code: String
        let name: String
    }

    struct Price: Identifiable {
        let line: Double
        let current: Int
        let opening: Int?
        let earlier: Int?
        let observedAt: Date
        var openingAt: Date?
        var earlierAt: Date?
        var result: Bool?
        var picks: Int?
        var estimated = false

        var id: Double { line }

        func baseline(_ comparison: OddsComparison) -> Int? {
            comparison == .opening ? opening : earlier
        }

        func movement(_ comparison: OddsComparison) -> Double? {
            guard let baseline = baseline(comparison) else { return nil }
            return (Self.implied(current) - Self.implied(baseline)) * 100
        }

        static func implied(_ price: Int) -> Double {
            let value = Double(price)
            return value > 0 ? 100 / (value + 100) : -value / (100 - value)
        }
    }

    struct Player: Identifiable {
        let gameID: String
        let playerID: Int
        let name: String
        let team: Team
        let position: String?
        let portraits: [URL]
        let logo: URL?
        let primary: Color
        let secondary: Color
        let prices: [Price]
        var status: String?
        var totalPicks: Int?

        var id: String { "\(gameID):\(playerID):\(team.code)" }
    }

    let games: [Game]
    let players: [Player]
    let books: [String]
    let notices: [String]
    var expiry: Date?
}

enum OddsComparison: String, CaseIterable {
    case opening, earlier

    func label(live: Bool) -> String {
        switch self {
        case .opening: live ? "First seen" : "Opening"
        case .earlier: "Earlier"
        }
    }
}

enum OddsSort: String, CaseIterable {
    case alphabetical = "Player A–Z"
    case shortened = "Most shortened"
    case lengthened = "Most lengthened"
}

struct ResearchOddsBoard: View {
    private struct SelectedPrice: Identifiable {
        let player: ResearchOddsSlate.Player
        let price: ResearchOddsSlate.Price
        let target: String

        var id: String { "\(player.id):\(price.id)" }
    }

    private struct PriceObservation: Identifiable {
        let label: String
        let odds: Int?
        let date: Date?

        var id: String { label }
    }

    let slate: ResearchOddsSlate
    let selectedGame: String?
    let marketLabel: String
    let scorerLabel: String?
    var live = false
    var defaultSort = OddsSort.alphabetical

    @Environment(\.colorScheme) private var scheme
    @ScaledMetric(relativeTo: .subheadline) private var identityWidth = 153.0
    @ScaledMetric(relativeTo: .subheadline) private var priceWidth = 88.0
    @State private var game: String?
    @State private var team: String?
    @State private var target: Double?
    @State private var search = ""
    @State private var sort: OddsSort?
    @State private var sortedPriceLine: Double?
    @State private var ascendingPrice = false
    @State private var ascendingName = true
    @State private var comparison = OddsComparison.opening
    @State private var filtersOpen = false
    @State private var selectedPrice: SelectedPrice?

    private var selectedSort: OddsSort { sort ?? defaultSort }
    private var slateGame: String? { selectedGame.flatMap { id in slate.games.first { $0.id == id }?.id } }

    private var teams: [ResearchOddsSlate.Team] {
        Array(Set(slate.players.filter { game == nil || $0.gameID == game }.map(\.team)))
            .sorted { $0.name < $1.name }
    }

    private var players: [ResearchOddsSlate.Player] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return slate.players.filter {
            (game == nil || $0.gameID == game) && (team == nil || $0.team.code == team) &&
            (query.isEmpty || "\($0.name) \($0.team.code) \($0.team.name)".localizedStandardContains(query))
        }
    }

    private func rows(for players: [ResearchOddsSlate.Player], sortedLine line: Double?) -> [ResearchOddsSlate.Player] {
        let nameAscending = line != nil || selectedSort != .alphabetical || ascendingName
        let valueAscending = line != nil ? ascendingPrice : selectedSort == .lengthened
        return players.filter { player in target == nil || player.prices.contains { $0.line == target } }
            .map { player in
                let value: Double?
                if let line {
                    value = player.prices.first { $0.line == line }.map { Double($0.current) }
                } else {
                    value = selectedSort == .alphabetical ? nil : movement(player)
                }
                return (player: player, value: value)
            }
            .sorted { left, right in
                if let first = left.value, let second = right.value, first != second {
                    return valueAscending ? first < second : first > second
                }
                if (left.value == nil) != (right.value == nil) { return left.value != nil }
                let nameOrder = left.player.name.localizedStandardCompare(right.player.name)
                if nameOrder == .orderedSame { return left.player.id < right.player.id }
                return nameAscending ? nameOrder == .orderedAscending : nameOrder == .orderedDescending
            }
            .map(\.player)
    }

    private func movement(_ player: ResearchOddsSlate.Player) -> Double? {
        let values = player.prices.filter { target == nil || $0.line == target }.compactMap { $0.movement(comparison) }
        return selectedSort == .shortened ? values.max() : values.min()
    }

    var body: some View {
        let players = players
        let milestones = Array(Set(players.lazy.flatMap(\.prices).map(\.line))).sorted()
        let sortedLine = sortedPriceLine.flatMap { milestones.contains($0) && (target == nil || target == $0) ? $0 : nil }
        let rows = rows(for: players, sortedLine: sortedLine)
        VStack(alignment: .leading, spacing: 12) {
            navigation
            activeFilters(sortedLine: sortedLine)
            ForEach(slate.notices, id: \.self) { notice in
                Label(notice, systemImage: "info.circle")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if rows.isEmpty {
                ContentUnavailableView("No prices for these filters", systemImage: "chart.bar.xaxis")
            } else {
                table(rows, columns: target.map { [$0] } ?? milestones, sortedLine: sortedLine)
            }
        }
        .onChange(of: slateGame, initial: true) { _, value in
            selectGame(value)
        }
        .onChange(of: slate.games.map(\.id)) { _, ids in
            if let game, !ids.contains(game) { selectGame(slateGame) }
        }
        .sheet(isPresented: $filtersOpen) {
            filters(milestones: Array(Set(milestones + (target.map { [$0] } ?? []))).sorted())
        }
        .sheet(item: $selectedPrice) { selection in quoteDetail(selection) }
    }

    private func selectGame(_ id: String?) {
        guard game != id else { return }
        game = id
        team = nil
        target = nil
    }

    private var navigation: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").accessibilityHidden(true)
                TextField("Player or team", text: $search).autocorrectionDisabled().submitLabel(.search)
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill").frame(minWidth: 36, minHeight: 44)
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 11)
            .frame(minHeight: 44)
            .background(Brand.surface(for: scheme), in: .capsule)
            if #available(iOS 26, *) {
                filterButton.buttonStyle(.glass)
            } else {
                filterButton.buttonStyle(.bordered)
            }
        }
    }

    private var filterButton: some View {
        Button {
            filtersOpen = true
        } label: {
            Image(systemName: "slider.horizontal.3").frame(minWidth: 31, minHeight: 31)
        }
        .accessibilityLabel("Odds Board filters")
    }

    @ViewBuilder
    private func activeFilters(sortedLine: Double?) -> some View {
        let hasScopeOverride = game != slateGame
        let hasCustomSort = sortedLine == nil && selectedSort != defaultSort
        if hasScopeOverride || team != nil || target != nil || comparison != .opening || hasCustomSort {
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    if hasScopeOverride {
                        let matchup = slate.games.first { $0.id == game }
                        let logos = [matchup?.away?.logo, matchup?.home?.logo].compactMap { $0 }
                        let scope = matchup.map { "Odds for \($0.title)" } ?? "All games"
                        filterChip(scope, icon: "calendar", logos: logos) {
                            selectGame(slateGame)
                        }
                    }
                    if let team {
                        let player = slate.players.first { $0.team.code == team }
                        filterChip(player?.team.name ?? team, icon: "shield", logos: player?.logo.map { [$0] } ?? []) {
                            self.team = nil
                        }
                    }
                    if let target {
                        filterChip("\(target.formatted())+", icon: "number") { self.target = nil }
                    }
                    if comparison != .opening {
                        filterChip(comparison.label(live: live), icon: "clock.arrow.circlepath") { comparison = .opening }
                    }
                    if hasCustomSort {
                        filterChip(selectedSort.rawValue, icon: "arrow.up.arrow.down") { sort = nil }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Active Odds Board filters")
        }
    }

    private func filterChip(_ title: String, icon: String, logos: [URL] = [], clear: @escaping () -> Void) -> some View {
        Button(action: clear) {
            HStack(spacing: 6) {
                if logos.isEmpty {
                    Image(systemName: icon).accessibilityHidden(true)
                } else {
                    ForEach(logos.indices, id: \.self) { index in
                        ResearchArtwork(urls: [logos[index]], fallback: icon, pointSize: 17)
                            .frame(width: 17, height: 17)
                    }
                }
                Text(title)
                Image(systemName: "xmark").font(.caption2.weight(.bold)).accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Brand.text(for: scheme))
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(Brand.surface(for: scheme), in: .capsule)
            .overlay { Capsule().strokeBorder(Brand.accent(for: scheme).opacity(0.45)) }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel("Clear \(title)")
    }

    private func filters(milestones: [Double]) -> some View {
        NavigationStack {
            Form {
                Section {
                    ResearchArtworkPicker(title: "Odds Board matchup", options: [.init(id: "", title: "All games", icon: "calendar")]
                        + slate.games.map { matchup in
                            .init(id: matchup.id, title: matchup.title, url: matchup.away?.logo ?? matchup.home?.logo,
                                  secondaryLogo: matchup.away?.logo == nil ? nil : matchup.home?.logo, icon: "calendar")
                        }, selection: Binding(get: { game ?? "" }, set: { selectGame($0.isEmpty ? nil : $0) }))
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "All teams", icon: "shield")]
                        + teams.map { item in
                            .team(id: item.code, title: item.name, logo: slate.players.first { $0.team.code == item.code }?.logo)
                        }, selection: Binding(get: { team ?? "" }, set: { team = $0.isEmpty ? nil : $0 }))
                    Picker("Compare with", selection: $comparison) {
                        ForEach(OddsComparison.allCases, id: \.self) { Text($0.label(live: live)).tag($0) }
                    }
                    Picker("Sort", selection: Binding(get: { selectedSort }, set: { sort = $0; sortedPriceLine = nil; ascendingName = true })) {
                        ForEach(OddsSort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    if scorerLabel == nil {
                        Picker("Milestone", selection: $target) {
                            Text("All milestones").tag(nil as Double?)
                            ForEach(milestones, id: \.self) { Text("\($0.formatted())+").tag(Optional($0)) }
                        }
                    }
                } header: {
                    Text(marketLabel)
                }
            }
            .navigationTitle("Odds Board filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { filtersOpen = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .tint(Brand.accent(for: scheme))
    }

    private func table(_ players: [ResearchOddsSlate.Player], columns: [Double], sortedLine: Double?) -> some View {
        ScrollView(.horizontal) {
            LazyVStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 2) {
                    ResearchSortHeader(title: "Player", selected: sortedLine == nil && selectedSort == .alphabetical, ascending: ascendingName) {
                        if sortedLine == nil && selectedSort == .alphabetical { ascendingName.toggle() }
                        else { sort = .alphabetical; sortedPriceLine = nil; ascendingName = true }
                    }
                    .frame(width: identityWidth, alignment: .leading).padding(.leading, 10)
                    ForEach(columns, id: \.self) { line in
                        ResearchSortHeader(title: scorerLabel ?? "\(line.formatted())+", selected: sortedLine == line, ascending: ascendingPrice) {
                            if sortedLine == line { ascendingPrice.toggle() }
                            else { sortedPriceLine = line; ascendingPrice = false }
                        }
                        .frame(width: priceWidth)
                    }
                }
                .background(Brand.surface(for: scheme))
                ForEach(players) { player in
                    let byLine = Dictionary(uniqueKeysWithValues: player.prices.map { ($0.line, $0) })
                    HStack(spacing: 2) {
                        identity(player).frame(width: identityWidth, alignment: .leading).padding(.leading, 10)
                        ForEach(columns, id: \.self) { line in
                            priceCell(byLine[line], player: player, milestone: scorerLabel ?? "\(line.formatted())+")
                                .frame(width: priceWidth)
                        }
                    }
                    .frame(minHeight: 84)
                    .background(Brand.surface(for: scheme))
                    Divider()
                }
            }
        }
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 17))
        .clipShape(.rect(cornerRadius: 17))
        .overlay { RoundedRectangle(cornerRadius: 17).strokeBorder(.secondary.opacity(0.22)) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Player milestone prices")
    }

    private func identity(_ player: ResearchOddsSlate.Player) -> some View {
        HStack(spacing: 9) {
            PlayerArtwork(portraits: player.portraits, logo: player.logo, primary: player.primary, secondary: player.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text(player.name).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                Text([player.team.code, player.position].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2).foregroundStyle(.secondary)
                if let status = player.status { Text(status).font(.caption2).foregroundStyle(.secondary) }
                if let total = player.totalPicks { Text("Est. \(total.formatted()) picks").font(.caption2).foregroundStyle(.secondary) }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 5)
        .background(alignment: .leading) {
            Capsule().fill(LinearGradient(colors: [player.primary, player.secondary], startPoint: .top, endPoint: .bottom))
                .frame(width: 2).padding(.vertical, 5)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func priceCell(_ price: ResearchOddsSlate.Price?, player: ResearchOddsSlate.Player, milestone: String) -> some View {
        if let price {
            let move = price.movement(comparison)
            let color = movementColor(move)
            Button {
                selectedPrice = .init(player: player, price: price, target: milestone)
            } label: {
                VStack(spacing: 3) {
                    Text(Self.price(price.current)).font(.subheadline.bold()).foregroundStyle(Brand.text(for: scheme))
                    Text("\(comparison.label(live: live)) \(Self.price(price.baseline(comparison)))")
                        .font(.caption2).foregroundStyle(.secondary)
                    if let move {
                        Label(moveLabel(move), systemImage: move > 0 ? "arrow.up.right" : move < 0 ? "arrow.down.right" : "minus")
                            .font(.caption2.weight(.semibold)).foregroundStyle(color)
                    }
                    if let result = price.result {
                        Text(result ? "Hit" : "Miss").font(.caption2.weight(.medium))
                    }
                    if let picks = price.picks {
                        Text("\(price.estimated ? "Est. " : "")\(picks.formatted()) picks").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .monospacedDigit()
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, minHeight: 79)
                .background(color.opacity(0.12), in: .rect(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(player.name), \(milestone), \(Self.price(price.current)), \(comparison.label(live: live)) \(Self.price(price.baseline(comparison)))")
            .accessibilityHint("Observed \(price.observedAt.formatted(date: .abbreviated, time: .shortened))")
        } else {
            Text("—").foregroundStyle(.secondary)
                .accessibilityLabel("\(milestone), price unavailable")
        }
    }

    private func quoteDetail(_ selection: SelectedPrice) -> some View {
        let price = selection.price
        let observations = [
            PriceObservation(label: "Last observed", odds: price.current, date: price.observedAt),
            PriceObservation(label: "Earlier", odds: price.earlier, date: price.earlierAt),
            PriceObservation(label: OddsComparison.opening.label(live: live), odds: price.opening, date: price.openingAt)
        ]
        let samples = observations.compactMap { observation -> (Date, Int)? in
            guard let date = observation.date, let odds = observation.odds else { return nil }
            return (date, odds)
        }
        let unique = Dictionary(samples, uniquingKeysWith: { latest, _ in latest })
        let timeline = unique.keys.sorted()
        let detents: Set<PresentationDetent> = timeline.count > 1 ? [.fraction(0.62), .large] : [.medium, .large]
        return NavigationStack {
            List {
                Section {
                    identity(selection.player)
                }
                Section(selection.target) {
                    quoteObservation("Last observed", value: price.current, at: price.observedAt)
                    if timeline.count > 1 {
                        PriceHistoryChart(timeline: timeline, prices: unique)
                    }
                    ForEach(observations.dropFirst()) { quoteObservation($0.label, value: $0.odds, at: $0.date) }
                }
            }
            .navigationTitle("Price history")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { selectedPrice = nil }
                }
            }
        }
        .presentationDetents(detents)
        .tint(Brand.accent(for: scheme))
    }

    private struct PriceHistoryChart: View {
        let timeline: [Date]
        let prices: [Date: Int]
        @Environment(\.colorScheme) private var scheme
        @State private var selectedCapture: Date?

        private var chartSelection: Binding<Date?> {
            Binding(get: { selectedCapture }, set: { date in
                guard let date else { return }
                selectedCapture = timeline.min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
            })
        }

        private var spansOneDay: Bool {
            guard let first = timeline.first, let last = timeline.last else { return false }
            return Calendar.current.isDate(first, inSameDayAs: last)
        }

        var body: some View {
            let selected = selectedCapture
            VStack(alignment: .leading, spacing: 8) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        chartTitle
                        Spacer(minLength: 0)
                        captureLabel(selected)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        chartTitle
                        captureLabel(selected)
                    }
                }
                chart(selected: selected)
            }
            .sensoryFeedback(.selection, trigger: selected) { _, date in date != nil }
        }

        private var chartTitle: some View {
            Text("Implied probability").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }

        @ViewBuilder
        private func captureLabel(_ date: Date?) -> some View {
            if let date, let odds = prices[date] {
                let style: Date.FormatStyle = spansOneDay ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day().hour().minute()
                Text("\(date.formatted(style)) · \(ResearchOddsBoard.price(odds))")
                    .font(.caption.weight(.semibold)).monospacedDigit()
                    .accessibilityHidden(true)
            }
        }

        private func chart(selected: Date?) -> some View {
            let probabilities = prices.values.map(ResearchOddsSlate.Price.implied)
            let lower = max(0, (probabilities.min() ?? 0) - 0.06)
            let upper = min(1, (probabilities.max() ?? 1) + 0.06)
            let dateFormat: Date.FormatStyle = spansOneDay ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day()
            let accent = Brand.accent(for: scheme)

            return Chart {
                if let selected {
                    RuleMark(x: .value("Selected observation", selected))
                        .foregroundStyle(.secondary.opacity(0.6))
                        .lineStyle(.init(lineWidth: 1, dash: [3, 3]))
                        .accessibilityHidden(true)
                }
                ForEach(timeline, id: \.self) { date in
                    if let odds = prices[date] {
                        let probability = ResearchOddsSlate.Price.implied(odds)
                        LineMark(x: .value("Observed at", date), y: .value("Implied probability", probability))
                            .interpolationMethod(.stepEnd)
                            .foregroundStyle(accent)
                            .accessibilityHidden(true)
                        PointMark(x: .value("Observed at", date), y: .value("Implied probability", probability))
                            .foregroundStyle(accent)
                            .symbolSize(selected == date ? 64 : 28)
                            .accessibilityLabel(date.formatted(date: .abbreviated, time: .shortened))
                            .accessibilityValue("\(ResearchOddsBoard.price(odds)), \(probability.formatted(.percent.precision(.fractionLength(1)))) implied probability")
                    }
                }
            }
            .chartXSelection(value: chartSelection)
            .chartGesture { proxy in
                SpatialTapGesture()
                    .onEnded { proxy.selectXValue(at: $0.location.x) }
                    .simultaneously(with: DragGesture(minimumDistance: 10).onChanged { drag in
                        guard abs(drag.translation.width) > abs(drag.translation.height) else { return }
                        proxy.selectXValue(at: drag.location.x)
                    })
            }
            .chartYScale(domain: lower...upper)
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let fraction = value.as(Double.self) { Text(fraction, format: .percent.precision(.fractionLength(0))) }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let date = value.as(Date.self) { Text(date, format: dateFormat) }
                    }
                }
            }
            .frame(height: 108)
            .padding(.vertical, 8)
        }
    }

    private func quoteObservation(_ label: String, value: Int?, at: Date?) -> some View {
        LabeledContent {
            Text(Self.price(value)).font(.headline).monospacedDigit()
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                if let at { Text(at.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }

    private func movementColor(_ change: Double?) -> Color {
        guard let change else { return .secondary }
        if change > 0 { return Brand.accent(for: scheme) }
        if change < 0 { return scheme == .dark ? Color(rgb: 0xFCA5A5) : Color(rgb: 0xB91C1C) }
        return .secondary
    }

    private func moveLabel(_ move: Double) -> String {
        if move != 0 && abs(move) < 0.05 { return move > 0 ? "+<0.1 pp" : "−<0.1 pp" }
        return "\(move > 0 ? "+" : "")\(move.formatted(.number.precision(.fractionLength(1)))) pp"
    }

    private static func price(_ number: Int?) -> String {
        number.map { $0 > 0 ? "+\($0)" : String($0) } ?? "—"
    }
}
