import SwiftUI

struct SidelinePlayerComparison: View {
    struct Player: Identifiable {
        let id: String
        let rosterID: Int
        let name: String
        let team: SidelineMarketTools.Visual
        let position: String?
        let status: String?
        let portraits: [URL]
        let values: [String: Double]
    }

    private enum Page: String, CaseIterable {
        case matchup = "Matchup", tracking = "NFL Tracking", books = "Sportsbooks"
        var icon: String {
            switch self {
            case .matchup: "person.2"
            case .tracking: "waveform.path"
            case .books: "rectangle.split.2x1"
            }
        }
    }

    private struct Odds: Decodable {
        struct Option: Decodable, Identifiable { let id: String; let name: String }
        struct Row: Decodable, Identifiable {
            struct Touchdown: Decodable {
                struct Average: Decodable { let odds: Double; let games: Int; let payoutChange: Double? }
                let odds: Int?
                let probability: Double?
                let picks: Int?
                let average: Average?
            }
            struct Book: Decodable, Identifiable {
                struct Quote: Decodable, Identifiable {
                    struct Result: Decodable { let state: String; let actual: Double?; let label: String }
                    let line: Double?
                    let openingLine: Double?
                    let kind: String
                    let side: String
                    let price: Int?
                    let opening: Int?
                    let observedAt: String?
                    let result: Result?
                    var id: String { "\(kind):\(side):\(line ?? 0):\(price ?? 0):\(opening ?? 0)" }
                }
                let book: String
                let values: [Quote]
                var id: String { book }
            }
            struct Final: Decodable, Identifiable {
                let value: Double
                let label: String
                var id: String { label }
            }

            let id: Int
            let first: Touchdown?
            let anytime: Touchdown?
            let ratio: Double?
            let observedPicks: Int?
            let books: [Book]
            let markets: [Option]
            let finals: [Final]
        }

        let gameId: String
        let date: String
        let market: String
        let all: Bool
        let availabilityStale: Bool
        let rows: [Row]
    }

    private struct Request: Equatable {
        let ids: [Int]
        let market: String
        let all: Bool
        let revision: Int
    }

    let api: SidelineAPI
    let date: String
    let game: String
    let players: [Player]
    let statsLoading: Bool
    let remove: (String) -> Void
    let clear: () -> Void
    @Binding var sample: SidelineStatWindow
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .body) private var columnWidth = 120.0
    @State private var page = Page.matchup
    @State private var market = "first_td"
    @State private var all = false
    @State private var response: (Request, Odds)?
    @State private var error: (Request, any Error)?
    @State private var revision = 0

    private var request: Request { .init(ids: players.map(\.rosterID), market: market, all: all, revision: revision) }
    private var quotes: Odds? { response.flatMap { $0.0 == request ? $0.1 : nil } }
    private var options: [Odds.Option] {
        Dictionary((response?.1.rows ?? []).flatMap(\.markets).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            .values.sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ResearchToolRail(title: "Comparison section", choices: Page.allCases, selection: $page, label: \.rawValue, glyph: \.icon)
                    HStack {
                        Text("\(players.count) of 4 players").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                        Spacer()
                        Button("Clear selection", action: clear).font(.caption.weight(.semibold))
                    }
                    if page == .books {
                        HStack {
                            ResearchToolFilter(title: "Comparison market", symbol: "ticket", selection: SidelineResearchMarket.title(market)) {
                                Picker("Market", selection: $market) {
                                    if !options.contains(where: { $0.id == market }) { Label(SidelineResearchMarket.title(market), systemImage: SidelineResearchMarket.glyph(market)).tag(market) }
                                    ForEach(options) { Label(SidelineResearchMarket.title($0.id), systemImage: SidelineResearchMarket.glyph($0.id)).tag($0.id) }
                                }
                            }
                            Spacer()
                            Toggle("All lines", isOn: $all).toggleStyle(.button)
                        }
                    } else {
                        Picker("Comparison sample", selection: $sample) {
                            ForEach(SidelineStatWindow.allCases, id: \.self) { Text($0.label).tag($0) }
                        }.pickerStyle(.segmented)
                    }
                    if quotes?.availabilityStale == true {
                        Label("Prices are unavailable until lineups are verified.", systemImage: "clock")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if page == .books, quotes == nil {
                        ResearchToolMessage(title: "Comparison prices couldn’t load",
                            error: error.flatMap { $0.0 == request ? $0.1 : nil }) { revision += 1 }
                    } else if statsLoading && page != .books {
                        ProgressView("Loading sample").frame(maxWidth: .infinity).padding()
                    } else {
                        comparisonTable
                    }
                }.padding(16)
            }
            .background(slipPalette.background)
            .navigationTitle("Player comparison")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDragIndicator(.visible)
        .task(id: request) { await load(request) }
        .onChange(of: players.count) { _, count in if count == 0 { dismiss() } }
    }

    private var comparisonTable: some View {
        let data = Dictionary((quotes?.rows ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let books = Set(data.values.flatMap { $0.books.map(\.book) }).sorted()
        return ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 7) {
                GridRow(alignment: .top) {
                    heading(page == .books ? "Sportsbook" : "Metric")
                    ForEach(players) { player in playerHeader(player, finals: data[player.rosterID]?.finals ?? []) }
                }
                if page == .books {
                    if books.isEmpty {
                        Text("No captured quotes for this selection.").font(.caption).foregroundStyle(.secondary)
                    } else {
                        metricRow("Observed picks") { player in
                            data[player.rosterID]?.observedPicks.map(String.init) ?? "—"
                        }
                        ForEach(books, id: \.self) { book in sportsbookRow(book, data: data) }
                    }
                } else {
                    let sample = SidelineStatColumn.columns.filter {
                        page == .tracking ? $0.category == .tracking : $0.category == .core || $0.category == .usage
                    }
                    ForEach(sample) { metric in
                        metricRow(metric.label, signal: { player in
                            ["mm", "cpoe", "yacAboveExpected", "rushOverExpected"].contains(metric.id) ? player.values[metric.id] : nil
                        }) { player in player.values[metric.id].map(metric.unit.format) ?? "—" }
                    }
                    if page == .matchup {
                        touchdownRows(title: "First TD", data: data, key: \.first)
                        touchdownRows(title: "Anytime TD", data: data, key: \.anytime)
                        metricRow("FTD : ATD") { player in ResearchFormat.decimal(data[player.rosterID]?.ratio) }
                    }
                }
            }
        }.scrollIndicators(.visible).id(page)
    }

    private func playerHeader(_ player: Player, finals: [Odds.Row.Final]) -> some View {
        VStack(spacing: 4) {
            PlayerArtwork(portraits: player.portraits, logo: player.team.logo, primary: player.team.primary,
                secondary: player.team.secondary ?? player.team.primary)
            Text(player.name).font(.caption.weight(.semibold))
            Text([player.team.code, player.position, player.status].compactMap { $0 }.joined(separator: " · "))
                .font(.caption2).foregroundStyle(.secondary)
            if !finals.isEmpty {
                Text(finals.map { "\($0.value.formatted()) \($0.label)" }.joined(separator: " · "))
                    .font(.caption2.weight(.semibold)).accessibilityLabel("Verified final statistics")
            }
            Button("Remove \(player.name)", systemImage: "minus.circle") { remove(player.id) }
                .labelStyle(.iconOnly).buttonStyle(.borderless).frame(minWidth: 44, minHeight: 44)
        }.multilineTextAlignment(.center).frame(width: columnWidth)
    }

    private func heading(_ title: String) -> some View {
        Text(title).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true).frame(width: 98, alignment: .leading)
    }

    private func metricRow(_ title: String, signal: @escaping (Player) -> Double? = { _ in nil },
                           value: @escaping (Player) -> String) -> some View {
        GridRow(alignment: .center) {
            heading(title)
            ForEach(players) { player in
                let amount = value(player)
                Text(amount).font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(Brand.signal(signal(player), for: scheme))
                    .frame(width: columnWidth)
                    .frame(minHeight: 36)
                    .background(slipPalette.surface, in: .rect(cornerRadius: 8))
                    .accessibilityLabel("\(player.name), \(title)")
                    .accessibilityValue(amount)
            }
        }
    }

    @ViewBuilder private func touchdownRows(title: String, data: [Int: Odds.Row], key: KeyPath<Odds.Row, Odds.Row.Touchdown?>) -> some View {
        metricRow(title + " · FanDuel") { player in ResearchFormat.price(data[player.rosterID]?[keyPath: key]?.odds) }
        metricRow(title + " implied probability") { player in
            data[player.rosterID]?[keyPath: key]?.probability?.formatted(.percent.precision(.fractionLength(1))) ?? "—"
        }
        metricRow(title + " payout vs avg", signal: { data[$0.rosterID]?[keyPath: key]?.average?.payoutChange }) { player in
            guard let average = data[player.rosterID]?[keyPath: key]?.average, let change = average.payoutChange else { return "—" }
            return ResearchFormat.signedDecimal(change, suffix: "%") + "\n" + "\(average.games)G avg " + ResearchFormat.decimal(average.odds)
        }
        metricRow(title + " observed picks") { player in data[player.rosterID]?[keyPath: key]?.picks.map(String.init) ?? "—" }
    }

    private func sportsbookRow(_ book: String, data: [Int: Odds.Row]) -> some View {
        GridRow(alignment: .top) {
            ResearchToolBook(book: book, price: nil, showPrice: false).frame(width: 98, alignment: .leading)
            ForEach(players) { player in
                let values = data[player.rosterID]?.books.first { $0.book == book }?.values ?? []
                VStack(alignment: .leading, spacing: 5) {
                    if values.isEmpty {
                        Text("—").foregroundStyle(.secondary)
                    } else {
                        ForEach(values) { quote in
                            Text("\(lineLabel(quote)) \(ResearchFormat.price(quote.price))").font(.caption.weight(.bold)).monospacedDigit()
                            if let opening = quote.opening {
                                Text("Open \(ResearchFormat.price(opening))" + (quote.openingLine.map { " · \($0.formatted())" } ?? ""))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            if let result = quote.result, result.state != "unavailable" {
                                Text(result.label).font(.caption2.weight(.semibold))
                                    .foregroundStyle(Brand.signal(result.state == "hit" ? 1 : result.state == "miss" ? -1 : nil, for: scheme))
                            }
                        }
                    }
                }
                .padding(6).frame(width: columnWidth, alignment: .leading)
                .background(slipPalette.surface, in: .rect(cornerRadius: 8))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func lineLabel(_ quote: Odds.Row.Book.Quote) -> String {
        if market == "first_td" || market == "anytime_td" && (quote.line ?? 0) <= 1 { return quote.side == "under" ? "No" : "Yes" }
        guard let line = quote.line else { return "" }
        return quote.kind == "milestone" ? "\(line.formatted())+" : "\(quote.side == "under" ? "U" : "O") \(line.formatted())"
    }

    private func load(_ wanted: Request) async {
        guard !wanted.ids.isEmpty else { return }
        do {
            var filters = [URLQueryItem(name: "players", value: wanted.ids.map(String.init).joined(separator: ",")),
                           URLQueryItem(name: "market", value: wanted.market)]
            if wanted.all { filters.append(.init(name: "all", value: "1")) }
            let data = try await api.research(Odds.self, tool: .compare, date: date, game: game, sample: .automatic, filters: filters)
            try Task.checkCancellation()
            guard wanted == request, data.gameId == game, data.date == date, data.market == wanted.market,
                  data.all == wanted.all, data.rows.allSatisfy({ wanted.ids.contains($0.id) }) else { return }
            response = (wanted, data)
            if !options.isEmpty, !options.contains(where: { $0.id == market }) { market = options[0].id }
            error = nil
        } catch { if !Task.isCancelled, request == wanted { self.error = (wanted, error) } }
    }
}
