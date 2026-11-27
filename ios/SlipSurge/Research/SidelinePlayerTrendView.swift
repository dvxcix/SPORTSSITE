import SwiftUI

struct SidelinePlayerTrendView: View {
    let row: SidelineResearchPayload.Row
    let visual: SidelineMarketTools.Visual
    let market: String
    let book: String
    var opponent: SidelineMarketTools.Visual?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var window = 10

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                ResearchToolCard(color: visual.primary) {
                    ResearchToolPortrait(name: row.player.name,
                        subtitle: [visual.code, row.player.position, SidelineResearchMarket.title(market)].compactMap { $0 }.joined(separator: " · "),
                        portraits: row.player.portraits, teamLogo: visual.logo, primary: visual.primary,
                        secondary: visual.secondary ?? visual.primary)
                } content: { EmptyView() }
                SidelineTrendCard(row: row, visual: visual, market: market, book: book, window: $window,
                                  opponentCode: opponent?.code, opponentLogo: opponent?.logo)
            }
            .padding(16)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly)
            }
        }
        .navigationTitle("Player trends")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
    }
}

private struct SidelineTrendCard: View {
    private enum Presentation: String, CaseIterable {
        case log = "Game log", chart = "Chart"

        var icon: String { self == .log ? "list.bullet.rectangle" : "chart.bar.xaxis" }
    }

    private struct RecordedGame: Identifiable {
        let matchup: SidelineResearchPayload.Row.Game.Matchup?
        let chartValue: ResearchGameChart.Game

        var id: String { chartValue.id }
    }

    let row: SidelineResearchPayload.Row
    let visual: SidelineMarketTools.Visual
    let market: String
    let book: String
    @Binding var window: Int
    var opponentCode: String?
    var opponentLogo: URL?
    @Environment(\.slipPalette) private var slipPalette
    @State private var opponentOnly = false
    @State private var presentation = Presentation.log

    private var metric: String { SidelineResearchMarket.title(market) }

    private var history: [SidelineResearchPayload.Row.Game] {
        let log = row.gameLog ?? []
        guard opponentOnly, let opponentCode else { return log }
        let target = SidelineResearchMarket.normalizeTeam(opponentCode)
        return log.filter { game in
            // The archived row records the game teams, but not the player's team that week.
            guard let other = game.matchup?.opponent(of: row.player.team) else { return false }
            return SidelineResearchMarket.normalizeTeam(other) == target
        }
    }

    var body: some View {
        ResearchToolCard(color: visual.primary) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    contractTitle
                    Spacer(minLength: 8)
                    ResearchToolBook(book: book, price: row.odds)
                }
                VStack(alignment: .leading, spacing: 6) {
                    contractTitle
                    ResearchToolBook(book: book, price: row.odds)
                }
            }
        } content: {
            ResearchToolRail(title: "Player results", choices: Presentation.allCases, selection: $presentation,
                label: \.rawValue, glyph: \.icon, compact: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { filters }
                VStack(alignment: .leading, spacing: 4) { filters }
            }
            let sample = history
            let games = records(sample.prefix(window))
            if games.isEmpty {
                emptyLog
            } else if presentation == .log {
                gameLog(games, total: sample.count)
            } else {
                if !opponentOnly {
                    ResearchSampleBars(labels: ["Season", "L10", "L5", "L3", "L1"],
                        rates: (row.hits ?? []).map { $0.map { $0.rate / 100 } },
                        counts: (row.hits ?? []).map { $0.map { "\($0.hits)/\($0.total)" } })
                }
                ResearchGameChart(games: games.reversed().map(\.chartValue), line: row.line, metric: metric, showLog: false)
            }
        }
    }

    private var contractTitle: some View {
        Text(row.line.map { row.milestone == true ? "\($0.formatted())+" : "Over \($0.formatted())" } ?? metric)
            .font(.headline)
    }

    @ViewBuilder private var filters: some View {
        if let opponentCode {
            ResearchArtworkPicker(title: "Opponent", options: [
                .init(id: "all", title: "All opponents", icon: "list.bullet"),
                .team(id: opponentCode, title: "vs \(opponentCode)", logo: opponentLogo),
            ], selection: Binding(get: { opponentOnly ? opponentCode : "all" }, set: { opponentOnly = $0 == opponentCode }))
        }
        ResearchToolFilter(title: "Games shown", symbol: "clock.arrow.circlepath", selection: "Last \(window)") {
            Picker("Games shown", selection: $window) {
                ForEach([3, 5, 10, 20], id: \.self) { Text("Last \($0)").tag($0) }
            }
        }
    }

    private var emptyLog: some View {
        ContentUnavailableView {
            Label("No recorded games", systemImage: "list.bullet.rectangle")
        } description: {
            if opponentOnly, let opponentCode {
                Text("No games between \(visual.code) and \(opponentCode) are in this sample.")
            } else {
                Text("This sample has no \(metric.lowercased()) results.")
            }
        } actions: {
            if opponentOnly { Button("Show all opponents") { opponentOnly = false } }
        }
    }

    private func gameLog(_ games: [RecordedGame], total: Int) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(games.count == total ? "\(total) recorded games" : "Showing \(games.count) of \(total) recorded games")
                .font(.caption).foregroundStyle(.secondary)
            LazyVStack(spacing: 5) {
                ForEach(games) { game in
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) {
                            gameIdentity(game)
                            Spacer(minLength: 8)
                            gameResult(game.chartValue)
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            gameIdentity(game)
                            gameResult(game.chartValue)
                        }
                    }
                    .padding(9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(slipPalette.background.opacity(0.62), in: .rect(cornerRadius: 9))
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    @ViewBuilder private func gameIdentity(_ game: RecordedGame) -> some View {
        if let matchup = game.matchup {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    teamIdentity(matchup.away)
                    Text("at").foregroundStyle(.secondary)
                    teamIdentity(matchup.home)
                }
                .font(.subheadline.weight(.semibold))
                Text("\(String(matchup.season)) · Week \(matchup.week)").font(.caption).foregroundStyle(.secondary)
            }
        } else {
            Text(game.chartValue.label).font(.subheadline)
        }
    }

    private func teamIdentity(_ code: String) -> some View {
        let normalized = SidelineResearchMarket.normalizeTeam(code)
        let logo = if normalized == SidelineResearchMarket.normalizeTeam(visual.code) {
            visual.logo
        } else if let opponentCode, normalized == SidelineResearchMarket.normalizeTeam(opponentCode) {
            opponentLogo
        } else {
            nil as URL?
        }
        return HStack(spacing: 4) {
            if let logo {
                ResearchArtwork(urls: [logo], fallback: "football", pointSize: 20)
                    .frame(width: 20, height: 20).accessibilityHidden(true)
            }
            Text(code)
        }
    }

    private func gameResult(_ game: ResearchGameChart.Game) -> some View {
        HStack(spacing: 7) {
            Text(game.value.formatted()).font(.subheadline.bold()).monospacedDigit()
                .accessibilityLabel("\(game.value.formatted()) \(metric)")
            if game.result != .recorded {
                Label(game.result.rawValue, systemImage: game.result.icon)
                    .font(.caption.weight(.semibold)).foregroundStyle(game.result.color(in: slipPalette))
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func records(_ sample: ArraySlice<SidelineResearchPayload.Row.Game>) -> [RecordedGame] {
        sample.enumerated().map { index, game in
            let matchup = game.matchup
            let label = matchup.map { "Week \($0.week) · \($0.away) at \($0.home)" } ?? "Game \(index + 1) ago"
            // Exact Lines on the Sideline counts a non-milestone value equal to the line as a miss.
            let exceeds = row.milestone == true ? game.value >= (row.line ?? .infinity) : game.value > (row.line ?? .infinity)
            let result: ResearchGameChart.Result = row.line == nil ? .recorded : (exceeds ? .hit : .miss)
            return RecordedGame(matchup: matchup, chartValue: .init(id: game.id, label: label, value: game.value, result: result))
        }
    }
}

struct SidelineMMPlayerView: View {
    let api: SidelineAPI
    let player: SidelineResearchPayload.Player
    let mm: Int?
    let score: Double?
    let visual: SidelineMarketTools.Visual
    let date: String
    let game: String
    let market: String
    let sample: SidelineResearchSample
    let initialBook: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var selectedBook: String?
    @State private var books: [String] = []
    @State private var trend: SidelineResearchPayload.Row?
    @State private var ready = false
    @State private var error: (any Error)?
    @State private var window = 10

    private var book: String { selectedBook ?? initialBook }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ResearchToolCard(color: visual.primary) {
                    ResearchToolPortrait(name: player.name,
                        subtitle: [visual.code, player.position, SidelineResearchMarket.title(market)].compactMap { $0 }.joined(separator: " · "),
                        portraits: player.portraits, teamLogo: visual.logo, primary: visual.primary, secondary: visual.secondary ?? visual.primary)
                } content: {
                    ResearchToolValues(items: [
                        .init(label: "MM", text: ResearchFormat.signed(mm), tone: Brand.signal(mm.map(Double.init), for: scheme)),
                        .init(label: "SlipSurge Score", text: ResearchFormat.decimal(score)),
                    ])
                }
                if !books.isEmpty {
                    SportsbookPicker(books: books, selection: Binding(get: { book }, set: { selectedBook = $0 }))
                }
                if let trend {
                    let matchup = SidelineResearchPayload.Row.Game.Matchup(id: game)
                    SidelineTrendCard(row: trend, visual: visual, market: market, book: book, window: $window,
                                      opponentCode: matchup?.opponent(of: player.team))
                } else if ready {
                    ContentUnavailableView("No saved player history for this book and market", systemImage: "chart.bar.xaxis")
                } else {
                    ResearchToolMessage(title: "Player trends couldn’t load", error: error) { Task { await load(book) } }
                }
            }
            .padding(16)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Player trends")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
        }
        .task(id: book) { await load(book) }
    }

    private func load(_ requested: String) async {
        trend = nil
        ready = false
        error = nil
        do {
            let payload = try await api.research(SidelineResearchPayload.self, tool: .cheatsheets, date: date, game: game,
                sample: sample, filters: [.init(name: "market", value: market), .init(name: "book", value: requested)])
            guard !Task.isCancelled, requested == book else { return }
            guard payload.gameId == game, payload.date == date, payload.tool == "cheatsheets", payload.market == market, payload.book == requested else {
                throw URLError(.cannotParseResponse)
            }
            books = Set((payload.books ?? []) + [requested]).sorted()
            trend = payload.rows.first { candidate in candidate.id == player.id && candidate.gameLog?.isEmpty == false }
            ready = true
        } catch {
            if !Task.isCancelled, requested == book { self.error = error }
        }
    }
}
