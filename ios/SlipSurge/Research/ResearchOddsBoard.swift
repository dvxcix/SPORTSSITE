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

    struct Price: Identifiable, Sendable {
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

enum OddsComparison: String, CaseIterable, Codable {
    case opening, earlier

    var symbol: String { self == .opening ? "flag" : "clock.arrow.circlepath" }

    func label(live: Bool) -> String {
        switch self {
        case .opening: live ? "First seen" : "Opening"
        case .earlier: "Earlier"
        }
    }
}

enum OddsSort: String, CaseIterable, Codable {
    case alphabetical = "Player A–Z"
    case shortened = "Most shortened"
    case lengthened = "Most lengthened"

    var symbol: String {
        switch self {
        case .alphabetical: "textformat.abc"
        case .shortened: "arrow.down.right"
        case .lengthened: "arrow.up.right"
        }
    }
}

@Observable final class ResearchOddsFilters {
    private(set) var slateGame: String?
    private(set) var game: String?
    var team: String?
    var target: Double?
    var search = ""
    var sort: OddsSort?
    var sortedPriceLine: Double?
    var ascendingPrice = false
    var ascendingName = true
    var comparison = OddsComparison.opening

    init(restoring saved: ResearchResumeFilters.Odds? = nil, slateGame: String? = nil) {
        guard let saved else { return }
        self.slateGame = slateGame
        game = saved.game
        team = saved.team
        target = saved.target
        search = saved.search
        sort = saved.sort
        sortedPriceLine = saved.sortedPriceLine
        ascendingPrice = saved.ascendingPrice
        ascendingName = saved.ascendingName
        comparison = saved.comparison
    }

    func resumeFilters(following selectedGame: String?) -> ResearchResumeFilters.Odds {
        // A first render or a newly selected header game will be applied by the board.
        guard slateGame == selectedGame else {
            return .init(game: selectedGame, search: ResearchResumeFilters.searchTerm(search), sort: sort,
                ascendingPrice: ascendingPrice, ascendingName: ascendingName, comparison: comparison)
        }
        return .init(game: game, team: team, target: target, search: ResearchResumeFilters.searchTerm(search),
            sort: sort, sortedPriceLine: sortedPriceLine, ascendingPrice: ascendingPrice,
            ascendingName: ascendingName, comparison: comparison)
    }

    func followSlateGame(_ id: String?) {
        guard slateGame != id else { return }
        slateGame = id
        selectGame(id)
    }

    func selectGame(_ id: String?) {
        guard game != id else { return }
        game = id
        team = nil
        clearLineSelection()
    }

    func clearLineSelection() {
        target = nil
        sortedPriceLine = nil
    }
}

struct ResearchOddsBoard: View {
    let slate: ResearchOddsSlate
    let selectedGame: String?
    let marketLabel: String
    let scorerLabel: String?
    let sportsbook: String
    let readBook: ResearchBookRead
    let openQuote: (ResearchOddsDetail) -> Void
    @Bindable var filter: ResearchOddsFilters
    var live = false
    var defaultSort = OddsSort.alphabetical

    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @ScaledMetric(relativeTo: .subheadline) private var identityWidth = 153.0
    @Environment(\.dynamicTypeSize) private var textSize
    @Namespace private var priceViewport
    @ScaledMetric(relativeTo: .subheadline) private var priceWidth = 88.0
    @State private var filtersOpen = false

    private var selectedSort: OddsSort { filter.sort ?? defaultSort }

    private var teams: [ResearchOddsSlate.Team] {
        Array(Set(slate.players.filter { filter.game == nil || $0.gameID == filter.game }.map(\.team)))
            .sorted { $0.name < $1.name }
    }

    private var players: [ResearchOddsSlate.Player] {
        let query = filter.search.trimmingCharacters(in: .whitespacesAndNewlines)
        return slate.players.filter {
            (filter.game == nil || $0.gameID == filter.game) && (filter.team == nil || $0.team.code == filter.team) &&
            (query.isEmpty || "\($0.name) \($0.team.code) \($0.team.name)".localizedStandardContains(query))
        }
    }

    private func rows(for players: [ResearchOddsSlate.Player], sortedLine line: Double?) -> [ResearchOddsSlate.Player] {
        let nameAscending = line != nil || selectedSort != .alphabetical || filter.ascendingName
        let valueAscending = line != nil ? filter.ascendingPrice : selectedSort == .lengthened
        return players.filter { player in filter.target == nil || player.prices.contains { $0.line == filter.target } }
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
        let values = player.prices.filter { filter.target == nil || $0.line == filter.target }.compactMap { $0.movement(filter.comparison) }
        return selectedSort == .shortened ? values.max() : values.min()
    }

    var body: some View {
        let players = players
        let milestones = Array(Set(players.lazy.flatMap(\.prices).map(\.line))).sorted()
        let sortedLine = filter.sortedPriceLine.flatMap { milestones.contains($0) && (filter.target == nil || filter.target == $0) ? $0 : nil }
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
                table(rows, columns: filter.target.map { [$0] } ?? milestones, sortedLine: sortedLine)
            }
        }
        .onChange(of: selectedGame, initial: true) { _, value in
            filter.followSlateGame(value)
        }
        .sheet(isPresented: $filtersOpen) {
            filters(milestones: Array(Set(milestones + (filter.target.map { [$0] } ?? []))).sorted())
        }
    }

    private var navigation: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").accessibilityHidden(true)
                TextField("Player or team", text: $filter.search).autocorrectionDisabled().submitLabel(.search)
                if !filter.search.isEmpty {
                    Button { filter.search = "" } label: {
                        Image(systemName: "xmark.circle.fill").frame(minWidth: 36, minHeight: 44)
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 11)
            .frame(minHeight: 44)
            .background(slipPalette.surface, in: .capsule)
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
        let hasScopeOverride = filter.game != filter.slateGame
        let hasCustomSort = sortedLine == nil && selectedSort != defaultSort
        if hasScopeOverride || filter.team != nil || filter.target != nil || filter.comparison != .opening || hasCustomSort {
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    if hasScopeOverride {
                        let matchup = slate.games.first { $0.id == filter.game }
                        let logos = [matchup?.away?.logo, matchup?.home?.logo].compactMap { $0 }
                        let scope = matchup.map { "Odds for \($0.title)" } ?? "All games"
                        filterChip(scope, icon: "calendar", logos: logos) {
                            filter.selectGame(filter.slateGame)
                        }
                    }
                    if let team = filter.team {
                        let player = slate.players.first { $0.team.code == team }
                        filterChip(player?.team.name ?? team, icon: "shield", logos: player?.logo.map { [$0] } ?? []) {
                            filter.team = nil
                        }
                    }
                    if let target = filter.target {
                        filterChip("\(target.formatted())+", icon: "number") { filter.target = nil }
                    }
                    if filter.comparison != .opening {
                        filterChip(filter.comparison.label(live: live), icon: "clock.arrow.circlepath") { filter.comparison = .opening }
                    }
                    if hasCustomSort {
                        filterChip(selectedSort.rawValue, icon: "arrow.up.arrow.down") { filter.sort = nil }
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
            .foregroundStyle(slipPalette.text)
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(slipPalette.surface, in: .capsule)
            .overlay { Capsule().strokeBorder(slipPalette.accent.opacity(0.45)) }
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
                        }, selection: Binding(get: { filter.game ?? "" }, set: { filter.selectGame($0.isEmpty ? nil : $0) }))
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "All teams", icon: "shield")]
                        + teams.map { item in
                            .team(id: item.code, title: item.name, logo: slate.players.first { $0.team.code == item.code }?.logo)
                        }, selection: Binding(get: { filter.team ?? "" }, set: { filter.team = $0.isEmpty ? nil : $0 }))
                    Picker(selection: $filter.comparison) {
                        ForEach(OddsComparison.allCases, id: \.self) { Label($0.label(live: live), systemImage: $0.symbol).tag($0) }
                    } label: {
                        Label("Compare with", systemImage: "clock")
                    }
                    Picker(selection: Binding(get: { selectedSort }, set: { filter.sort = $0; filter.sortedPriceLine = nil; filter.ascendingName = true })) {
                        ForEach(OddsSort.allCases, id: \.self) { Label($0.rawValue, systemImage: $0.symbol).tag($0) }
                    } label: {
                        Label("Sort", systemImage: "arrow.up.arrow.down")
                    }
                    if scorerLabel == nil {
                        Picker(selection: $filter.target) {
                            Label("All milestones", systemImage: "line.3.horizontal.decrease").tag(nil as Double?)
                            ForEach(milestones, id: \.self) {
                                Label("\($0.formatted())+", systemImage: "plus.circle").tag(Optional($0))
                            }
                        } label: {
                            Label("Milestone", systemImage: "target")
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
        .tint(slipPalette.accent)
    }

    private func table(_ players: [ResearchOddsSlate.Player], columns: [Double], sortedLine: Double?) -> some View {
        let playerColumn = PlayerColumn(width: identityWidth, surface: slipPalette.surface,
                                        viewport: priceViewport, pinned: !textSize.isAccessibilitySize)
        return ScrollView(.horizontal) {
            LazyVStack(alignment: .leading, spacing: 0) {
                PlayerPriceRow() {
                    ResearchSortHeader(title: "Player", selected: sortedLine == nil && selectedSort == .alphabetical, ascending: filter.ascendingName) {
                        if sortedLine == nil && selectedSort == .alphabetical { filter.ascendingName.toggle() }
                        else { filter.sort = .alphabetical; filter.sortedPriceLine = nil; filter.ascendingName = true }
                    }
                    .modifier(playerColumn)
                    ForEach(columns, id: \.self) { line in
                        ResearchSortHeader(title: scorerLabel ?? "\(line.formatted())+", selected: sortedLine == line, ascending: filter.ascendingPrice) {
                            if sortedLine == line { filter.ascendingPrice.toggle() }
                            else { filter.sortedPriceLine = line; filter.ascendingPrice = false }
                        }
                        .frame(width: priceWidth)
                    }
                }
                .background(slipPalette.surface)
                ForEach(players) { player in
                    let byLine = Dictionary(uniqueKeysWithValues: player.prices.map { ($0.line, $0) })
                    PlayerPriceRow(minimumHeight: 84) {
                        identity(player)
                            .modifier(playerColumn)
                        ForEach(columns, id: \.self) { line in
                            priceCell(byLine[line], player: player, milestone: scorerLabel ?? "\(line.formatted())+")
                                .frame(width: priceWidth)
                        }
                    }
                    .background(slipPalette.surface)
                    Divider()
                }
            }
        }
        .coordinateSpace(.named(priceViewport))
        .background(slipPalette.surface, in: .rect(cornerRadius: 17))
        .clipShape(.rect(cornerRadius: 17))
        .overlay { RoundedRectangle(cornerRadius: 17).strokeBorder(.secondary.opacity(0.22)).allowsHitTesting(false) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Player milestone prices")
    }

    private struct PlayerColumn: ViewModifier {
        let width: CGFloat
        let surface: Color
        let viewport: Namespace.ID
        let pinned: Bool

        func body(content: Content) -> some View {
            content
                .frame(width: width, alignment: .leading)
                .frame(maxHeight: .infinity)
                .padding(.leading, 10)
                .background(surface)
                .overlay(alignment: .trailing) { Divider().allowsHitTesting(false) }
                .visualEffect { content, geometry in
                    content.offset(x: pinned ? max(0, -geometry.frame(in: .named(viewport)).minX) : 0)
                }
                .zIndex(1)
        }
    }

    private struct PlayerPriceRow: Layout {
        var minimumHeight: CGFloat = 44
        private let spacing: CGFloat = 2

        func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
            let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
            return CGSize(width: sizes.map(\.width).reduce(0, +) + CGFloat(max(0, sizes.count - 1)) * spacing,
                          height: max(minimumHeight, sizes.map(\.height).max() ?? 0))
        }

        func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
            var x = bounds.minX
            for subview in subviews {
                let width = subview.sizeThatFits(.unspecified).width
                subview.place(at: CGPoint(x: x, y: bounds.midY), anchor: .leading,
                              proposal: ProposedViewSize(width: width, height: bounds.height))
                x += width + spacing
            }
        }
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
            let move = price.movement(filter.comparison)
            let color = movementColor(move)
            Button {
                let subtitle = scorerLabel ?? "\(milestone) \(marketLabel.lowercased())"
                openQuote(.init(player: player, matchup: slate.games.first { $0.id == player.gameID },
                    subtitle: subtitle, live: live, sportsbook: sportsbook, books: slate.books,
                    original: .init(price: price, expiry: slate.expiry), read: readBook))
            } label: {
                VStack(spacing: 3) {
                    Text(Self.price(price.current)).font(.subheadline.bold()).foregroundStyle(slipPalette.text)
                    Text("\(filter.comparison.label(live: live)) \(Self.price(price.baseline(filter.comparison)))")
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
            .accessibilityLabel(priceAccessibilityLabel(price, player: player, milestone: milestone, movement: move))
            .accessibilityHint("Compare sportsbooks or see price history. Observed \(price.observedAt.formatted(date: .abbreviated, time: .shortened))")
        } else {
            Text("—").foregroundStyle(.secondary)
                .accessibilityLabel("\(player.name), \(milestone), price unavailable")
        }
    }

    private func priceAccessibilityLabel(_ price: ResearchOddsSlate.Price, player: ResearchOddsSlate.Player,
                                         milestone: String, movement: Double?) -> String {
        var parts = [
            player.name, milestone, Self.price(price.current),
            "\(filter.comparison.label(live: live)) \(Self.price(price.baseline(filter.comparison)))",
        ]
        if let movement {
            parts.append("Price movement \(moveLabel(movement))")
        }
        if let result = price.result {
            parts.append(result ? "Hit" : "Miss")
        }
        if let picks = price.picks {
            parts.append("\(price.estimated ? "Estimated " : "")\(picks.formatted()) \(picks == 1 ? "pick" : "picks")")
        }
        return parts.joined(separator: ", ")
    }

    private func movementColor(_ change: Double?) -> Color {
        guard let change else { return .secondary }
        if change > 0 { return slipPalette.accent }
        if change < 0 { return scheme == .dark ? Color(rgb: 0xFCA5A5) : Color(rgb: 0xB91C1C) }
        return .secondary
    }

    private func moveLabel(_ move: Double) -> String {
        if move != 0 && abs(move) < 0.05 { return move > 0 ? "+<0.1 pp" : "−<0.1 pp" }
        return "\(move > 0 ? "+" : "")\(move.formatted(.number.precision(.fractionLength(1)))) pp"
    }

    static func price(_ number: Int?) -> String {
        number.map { $0 > 0 ? "+\($0)" : String($0) } ?? "—"
    }
}
