import SwiftUI

struct SidelinePlayerTrendView: View {
    let row: SidelineResearchPayload.Row
    let visual: SidelineMarketTools.Visual
    let market: String
    let book: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var window = 10

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                ResearchToolCard(color: visual.primary) {
                    ResearchToolPortrait(name: row.player.name,
                        subtitle: [visual.code, row.player.position, SidelineResearchMarket.title(market)].compactMap { $0 }.joined(separator: " · "),
                        portraits: row.player.portraits, teamLogo: visual.logo, primary: visual.primary,
                        secondary: visual.secondary ?? visual.primary)
                } content: {
                    HStack {
                        if let line = row.line {
                            let milestone = row.milestone == true
                            Text(milestone ? "\(line.formatted())+" : "Over \(line.formatted())").font(.headline)
                        }
                        Spacer()
                        ResearchToolBook(book: book, price: row.odds)
                    }
                    ResearchSampleBars(labels: ["Season", "L10", "L5", "L3", "L1"],
                        rates: (row.hits ?? []).map { $0.map { $0.rate / 100 } },
                        counts: (row.hits ?? []).map { $0.map { "\($0.hits)/\($0.total)" } })
                }
                ResearchToolCard(color: visual.primary) {
                    Text("Recent form").font(.headline)
                } content: {
                    Picker("Games shown", selection: $window) {
                        ForEach([3, 5, 10, 20], id: \.self) { Text("L\($0)").tag($0) }
                    }
                    .pickerStyle(.segmented)
                    ResearchGameChart(games: games, line: row.line, metric: SidelineResearchMarket.title(market))
                }
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
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }

    private var games: [ResearchGameChart.Game] {
        let recorded = (row.gameLog ?? []).prefix(window)
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
