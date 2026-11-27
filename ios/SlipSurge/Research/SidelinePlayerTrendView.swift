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
                SidelineTrendCard(row: row, color: visual.primary, market: market, book: book, window: $window,
                                  opponent: opponent)
            }
            .padding(16)
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
    let row: SidelineResearchPayload.Row
    let color: Color
    let market: String
    let book: String
    @Binding var window: Int
    var opponent: SidelineMarketTools.Visual?
    @State private var opponentOnly = false

    private var history: [SidelineResearchPayload.Row.Game] {
        let log = row.gameLog ?? []
        guard opponentOnly, let opponent else { return log }
        let team = SidelineResearchMarket.normalizeTeam(row.player.team)
        return log.filter { game in
            let parts = game.id.split(separator: "_")
            guard parts.count == 4 else { return false }
            let codes = Set(parts.suffix(2).map { SidelineResearchMarket.normalizeTeam(String($0)) })
            return codes == Set([team, SidelineResearchMarket.normalizeTeam(opponent.code)])
        }
    }

    var body: some View {
        ResearchToolCard(color: color) {
            HStack {
                if let line = row.line {
                    let milestone = row.milestone == true
                    Text(milestone ? "\(line.formatted())+" : "Over \(line.formatted())").font(.headline)
                }
                Spacer()
                ResearchToolBook(book: book, price: row.odds)
            }
        } content: {
            if !opponentOnly {
                ResearchSampleBars(labels: ["Season", "L10", "L5", "L3", "L1"],
                    rates: (row.hits ?? []).map { $0.map { $0.rate / 100 } },
                    counts: (row.hits ?? []).map { $0.map { "\($0.hits)/\($0.total)" } })
            }
            if let opponent {
                ResearchToolRail(title: "Opponent game log", choices: [false, true], selection: $opponentOnly,
                    label: { $0 ? "vs \(opponent.code)" : "All opponents" }, glyph: { $0 ? "target" : "list.bullet" },
                    compact: true)
                if opponentOnly {
                    Text("\(history.count) \(history.count == 1 ? "recorded matchup" : "recorded matchups") against \(opponent.code)")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Picker("Games shown", selection: $window) {
                ForEach([3, 5, 10, 20], id: \.self) { Text("L\($0)").tag($0) }
            }
            .pickerStyle(.segmented)
            ResearchGameChart(games: games, line: row.line, metric: SidelineResearchMarket.title(market))
        }
    }

    private var games: [ResearchGameChart.Game] {
        let recorded = history.prefix(window)
        return recorded.enumerated().reversed().map { index, game in
            let title = game.id.split(separator: "_")
            let label = title.count == 4 ? "Week \(title[1]) · \(title[2]) @ \(title[3])" : "Game \(index + 1) ago"
            // Exact Lines on the Sideline counts a non-milestone value equal to the line as a miss.
            let exceeds = row.milestone == true ? game.value >= (row.line ?? .infinity) : game.value > (row.line ?? .infinity)
            let result: ResearchGameChart.Result = row.line == nil ? .recorded : (exceeds ? .hit : .miss)
            return .init(id: game.id, label: label, value: game.value, result: result)
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
                    SidelineTrendCard(row: trend, color: visual.primary, market: market, book: book, window: $window)
                } else if ready {
                    ContentUnavailableView("No saved player history for this book and market", systemImage: "chart.bar.xaxis")
                } else {
                    ResearchToolMessage(title: "Player trends couldn’t load", error: error) { Task { await load(book) } }
                }
            }
            .padding(16)
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
