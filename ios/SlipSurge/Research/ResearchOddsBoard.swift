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

        private static func implied(_ price: Int) -> Double {
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

    let slate: ResearchOddsSlate
    let selectedGame: String?
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
    @State private var comparison = OddsComparison.opening
    @State private var filtersOpen = false
    @State private var selectedPrice: SelectedPrice?

    private var selectedSort: OddsSort { sort ?? defaultSort }

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

    private var milestones: [Double] { Array(Set(players.flatMap(\.prices).map(\.line))).sorted() }

    private var rows: [ResearchOddsSlate.Player] {
        players.filter { player in target == nil || player.prices.contains { $0.line == target } }
            .sorted { left, right in
                if selectedSort != .alphabetical {
                    let first = movement(left), second = movement(right)
                    if let first, let second, first != second { return selectedSort == .shortened ? first > second : first < second }
                    if (first == nil) != (second == nil) { return first != nil }
                }
                let nameOrder = left.name.localizedStandardCompare(right.name)
                return nameOrder == .orderedSame ? left.id < right.id : nameOrder == .orderedAscending
            }
    }

    private func movement(_ player: ResearchOddsSlate.Player) -> Double? {
        let values = player.prices.filter { target == nil || $0.line == target }.compactMap { $0.movement(comparison) }
        return selectedSort == .shortened ? values.max() : values.min()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            navigation
            ForEach(slate.notices, id: \.self) { notice in
                Label(notice, systemImage: "info.circle")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if rows.isEmpty {
                ContentUnavailableView("No prices for these filters", systemImage: "chart.bar.xaxis")
            } else {
                table(rows, columns: target.map { [$0] } ?? milestones)
            }
        }
        .onChange(of: selectedGame, initial: true) { _, value in
            game = value.flatMap { id in slate.games.contains { $0.id == id } ? id : nil }
            team = nil
            target = nil
        }
        .onChange(of: slate.games.map(\.id)) { _, ids in
            if let game, !ids.contains(game) { self.game = nil }
        }
        .onChange(of: milestones) { _, visible in
            if let target, !visible.contains(target) { self.target = nil }
        }
        .sheet(isPresented: $filtersOpen) { filters }
        .sheet(item: $selectedPrice) { selection in quoteDetail(selection) }
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

    private var filters: some View {
        NavigationStack {
            Form {
                Section("Matchup") {
                    Button {
                        game = nil
                    } label: {
                        HStack {
                            Label("All games", systemImage: "calendar")
                            Spacer()
                            if game == nil { Image(systemName: "checkmark") }
                        }
                    }.accessibilityAddTraits(game == nil ? .isSelected : [])
                    ForEach(slate.games) { matchup in
                        Button {
                            game = matchup.id
                        } label: {
                            if let away = matchup.away, let home = matchup.home {
                                ResearchMatchup(away: away, home: home, subtitle: nil, selected: game == matchup.id, fullWidth: true)
                            } else {
                                LabeledContent(matchup.title, value: game == matchup.id ? "Selected" : "")
                            }
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityLabel(matchup.title)
                        .accessibilityAddTraits(game == matchup.id ? .isSelected : [])
                    }
                }
                .onChange(of: game) { _, _ in team = nil }
                ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "All teams", icon: "shield")]
                    + teams.map { item in
                        .team(id: item.code, title: item.name, logo: slate.players.first { $0.team.code == item.code }?.logo)
                    }, selection: Binding(get: { team ?? "" }, set: { team = $0.isEmpty ? nil : $0 }))
                Picker("Compare with", selection: $comparison) {
                    ForEach(OddsComparison.allCases, id: \.self) { Text($0.label(live: live)).tag($0) }
                }
                Picker("Sort", selection: Binding(get: { selectedSort }, set: { sort = $0 })) {
                    ForEach(OddsSort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                if scorerLabel == nil {
                    Picker("Milestone", selection: $target) {
                        Text("All milestones").tag(nil as Double?)
                        ForEach(milestones, id: \.self) { Text("\($0.formatted())+").tag(Optional($0)) }
                    }
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

    private func table(_ players: [ResearchOddsSlate.Player], columns: [Double]) -> some View {
        ScrollView(.horizontal) {
            LazyVStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 2) {
                    Text("Player").frame(width: identityWidth, alignment: .leading).padding(.leading, 10)
                    ForEach(columns, id: \.self) { line in
                        Text(scorerLabel ?? "\(line.formatted())+").frame(width: priceWidth)
                    }
                }
                .padding(.vertical, 11)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.accent(for: scheme))
                .background(Brand.surface(for: scheme))
                .accessibilityAddTraits(.isHeader)
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
        NavigationStack {
            List {
                Section {
                    identity(selection.player)
                }
                Section(selection.target) {
                    quoteObservation("Last observed", value: selection.price.current, at: selection.price.observedAt)
                    quoteObservation("Earlier", value: selection.price.earlier, at: selection.price.earlierAt)
                    quoteObservation(OddsComparison.opening.label(live: live), value: selection.price.opening, at: selection.price.openingAt)
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
        .presentationDetents([.medium, .large])
        .tint(Brand.accent(for: scheme))
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
