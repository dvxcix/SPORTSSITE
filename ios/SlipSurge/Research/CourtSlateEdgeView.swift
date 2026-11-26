import SwiftUI

struct CourtSlateEdgeView: View {
    private enum Sort: String, CaseIterable {
        case score = "SlipSurge Score", mismatch = "MM", hit = "L10 hit rate", gap = "Form gap"
    }

    private struct Filters: Equatable {
        let date: String
        let mode: CourtResearchMode
        let market: CourtPlayerMarket
        let book: String
        let side: CourtPlayerMarket.Side
        let reload: Int
        let retry: Int
    }

    let scope: CourtView.Scope
    let date: String
    let mode: CourtResearchMode
    let games: [CourtBoard.Game]
    let reload: Int
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var market = CourtPlayerMarket.points
    @State private var book = "all"
    @State private var side = CourtPlayerMarket.Side.over
    @State private var selectedGame: Int?
    @State private var sort = Sort.score
    @State private var search = ""
    @State private var result: (Filters, CourtSlateEdgePayload)?
    @State private var error: (any Error)?
    @State private var retry = 0

    init(scope: CourtView.Scope, date: String, mode: CourtResearchMode, games: [CourtBoard.Game], reload: Int,
        initialGame: Int? = nil, initialBook: String? = nil) {
        self.scope = scope
        self.date = date
        self.mode = mode
        self.games = games
        self.reload = reload
        _selectedGame = State(initialValue: initialGame)
        _book = State(initialValue: initialBook ?? "all")
    }

    private var filters: Filters {
        .init(date: date, mode: mode, market: market, book: book, side: side, reload: reload, retry: retry)
    }

    var body: some View {
        if case .preview = scope {
            ResearchToolMessage(title: "Slate Edge unavailable", error: SlipSurgeHTTP.Status(code: 403, data: Data()))
        } else {
            VStack(alignment: .leading, spacing: 10) {
                controls
                if let (applied, data) = result, applied == filters {
                    rows(data)
                } else {
                    ResearchToolMessage(title: "Slate Edge couldn’t load", error: error) { retry += 1 }
                }
            }
            .onChange(of: date) { _, newDate in
                if !games.contains(where: { $0.id == selectedGame && $0.date == newDate }) { selectedGame = nil }
            }
            .task(id: filters) { await load(filters) }
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 6) {
            ResearchToolRail(title: "Side", choices: CourtPlayerMarket.Side.allCases, selection: $side, label: \.rawValue) {
                $0 == .over ? "arrow.up" : "arrow.down"
            }
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ResearchToolFilter(title: "Market", symbol: "ticket", selection: market.label) {
                        Picker("Market", selection: $market) {
                            ForEach(CourtPlayerMarket.allCases, id: \.self) { Label($0.label, systemImage: $0.symbol).tag($0) }
                        }
                    }
                    ResearchArtworkPicker(title: "Sportsbook",
                        options: [.init(id: "all", title: "All books", icon: "books.vertical")] + [
                            "fanduel", "draftkings", "betmgm", "caesars", "betrivers", "fanatics", "pinnacle", "betparx", "ballybet",
                        ].map(ResearchArtworkPicker.Option.sportsbook), selection: $book)
                    ResearchArtworkPicker(title: "Game", options: [.init(id: "", title: "All games", icon: "basketball")] + games.map {
                        .init(id: String($0.id), title: matchup($0), url: $0.visitorTeam.logo, secondaryLogo: $0.homeTeam.logo, icon: "shield")
                    }, selection: Binding(get: { selectedGame.map(String.init) ?? "" }, set: { selectedGame = Int($0) }))
                    ResearchToolFilter(title: "Sort", symbol: "arrow.up.arrow.down", selection: sort.rawValue) {
                        Picker("Sort", selection: $sort) {
                            ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            TextField("Find a player or team", text: $search)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    @ViewBuilder
    private func rows(_ data: CourtSlateEdgePayload) -> some View {
        let rows = data.rows.filter { row in
            (selectedGame == nil || selectedGame == row.game.id)
                && (search.isEmpty || row.player.name.localizedCaseInsensitiveContains(search)
                    || row.player.team.abbreviation.localizedCaseInsensitiveContains(search))
                && row.game.date == date && row.game.id == row.offer.gameId && row.player.id == row.offer.playerId
        }.sorted { rank($0) > rank($1) }
        if !data.complete || data.stale {
            Label("\(data.loaded) of \(data.games) games loaded. Some research may be unavailable.", systemImage: "info.circle")
                .font(.caption).foregroundStyle(.secondary)
        }
        if let missing = data.frozenMmUnavailable, !missing.isEmpty {
            Text("Slate-wide MM was unavailable in \(missing.count) saved matchups.").font(.caption).foregroundStyle(.secondary)
        }
        if rows.isEmpty {
            ContentUnavailableView("No Slate Edge rows for these filters", systemImage: "chart.bar.xaxis")
        } else {
            LazyVStack(spacing: 9) {
                ForEach(rows) { row in playerCard(row) }
            }
        }
    }

    private func matchup(_ game: CourtBoard.Game) -> String {
        "\(game.visitorTeam.abbreviation) @ \(game.homeTeam.abbreviation)"
    }

    private func rank(_ row: CourtSlateEdgePayload.Row) -> Double {
        switch sort {
        case .score: row.score ?? -.infinity
        case .mismatch: row.mm.map(Double.init) ?? -.infinity
        case .hit: row.hit.rate ?? -.infinity
        case .gap: row.gap ?? -.infinity
        }
    }

    private func playerCard(_ row: CourtSlateEdgePayload.Row) -> some View {
        let player = row.player
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        let target = market.isBinary ? (side == .over ? "Yes" : "No")
            : row.offer.market.type == "milestone" ? "\(row.offer.lineValue)+" : "\(side.rawValue) \(row.offer.lineValue)"
        let rateSuffix = market.isBinary ? "%" : ""
        return ResearchToolCard(color: colors.primary) {
            ResearchToolPortrait(name: player.name, subtitle: "\(player.team.abbreviation) · \(matchup(row.game))",
                portraits: player.headshot.map { [$0] } ?? [], teamLogo: player.team.logo,
                primary: colors.primary, secondary: colors.secondary)
        } content: {
            HStack {
                Text("\(market.label) · \(target)").font(.caption.weight(.semibold))
                Spacer(minLength: 2)
                ResearchToolBook(book: row.offer.vendor, price: row.offer.price(side))
            }
            ResearchToolValues(items: [
                .init(label: "SlipSurge Score", text: ResearchFormat.decimal(row.score), tone: slipPalette.accent),
                .init(label: "MM", text: ResearchFormat.signed(row.mm), tone: Brand.signal(row.mm.map(Double.init), for: scheme)),
                .init(label: "L10 hit rate", text: "\(row.hit.label) · \(row.hit.sample)",
                    tone: Brand.signal(row.hit.rate.map { $0 - 50 }, for: scheme)),
                .init(label: "L10 average", text: ResearchFormat.decimal(market.isBinary ? row.average.map { $0 * 100 } : row.average, suffix: rateSuffix)),
                .init(label: "Form gap", text: market.isBinary ? ResearchFormat.points(row.gap) : ResearchFormat.signedDecimal(row.gap)),
                .init(label: "Estimate", text: ResearchFormat.decimal(market.isBinary ? row.estimate.map { $0 * 100 } : row.estimate, suffix: rateSuffix))
            ])
            if mode == .pregame, let at = row.researchObservedAt.flatMap(SidelineBoard.timestamp) {
                Label("Pregame snapshot \(at.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func load(_ requested: Filters) async {
        error = nil
        do {
            let data = try await CourtToolAPI(scope: scope).read(CourtSlateEdgePayload.self, tool: "slate-edge", query: [
                .init(name: "date", value: requested.date), .init(name: "mode", value: requested.mode.rawValue),
                .init(name: "market", value: requested.market.rawValue), .init(name: "book", value: requested.book),
                .init(name: "side", value: requested.side.rawValue.lowercased())
            ])
            guard !Task.isCancelled, requested == filters else { return }
            guard data.date == requested.date, data.mode == requested.mode else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { result = (requested, data) }
        } catch {
            if !Task.isCancelled, requested == filters { self.error = error }
        }
    }
}
