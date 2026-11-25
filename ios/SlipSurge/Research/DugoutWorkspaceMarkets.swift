import SwiftUI

struct DugoutWorkspaceMarkets: View {
    let game: DugoutBoard.Game
    let playerID: Int
    let batter: DugoutBoard.Batter?
    let history: DugoutOddsHistory?
    let historyFailed: Bool
    let retry: () -> Void
    @Environment(\.colorScheme) private var scheme

    private struct Group: Identifiable {
        let id: String
        let keys: [String]
    }

    private static let groups: [Group] = [
        .init(id: "Home run", keys: ["fhr", "sa", "hr2", "hr3", "laser105", "laser110", "moonshot", "pa1", "hrMl"]),
        .init(id: "Run production", keys: ["hrr", "hrr3", "rbi", "rbi2", "rbi3"]),
        .init(id: "Bases and contact", keys: ["tb", "tb3", "tb4", "tb5", "singles", "singles2", "singles3", "doubles", "doubles2", "doubles3", "triples", "triples2", "triples3", "hits", "hits2", "hits3"]),
        .init(id: "Traffic", keys: ["runs", "runs2", "runs3", "stolen_bases", "stolen_bases2", "stolen_bases3"]),
        .init(id: "Strikeouts", keys: ["strikeouts", "strikeouts2", "strikeouts3"]),
    ]

    var body: some View {
        let series = history?.series.filter { $0.playerId == playerID } ?? []
        let boardMarkets = game.snapshot.unavailable == true ? [] : batter?.markets ?? []
        let quotes = Dictionary(grouping: series, by: \.market)
        let team = batter.map { game.team(for: $0) } ?? game.home
        ResearchToolCard(color: team.color) {
            ResearchSectionTitle(title: "Pregame Market Receipt")
        } content: {
            if let history {
                Label("\(history.sourceCount.formatted()) pregame captures", systemImage: "clock")
                    .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            } else if historyFailed {
                Button("Retry price history", systemImage: "arrow.clockwise", action: retry).buttonStyle(.bordered)
            } else {
                ProgressView("Loading captured prices")
            }
            ForEach(Self.groups) { group in
                DisclosureGroup(group.id) {
                    ForEach(group.keys, id: \.self) { key in
                        let board = boardMarkets.first { $0.key == key }
                        market(key, board: board, captures: quotes[key] ?? [])
                    }
                }
                .font(.subheadline.weight(.semibold))
                .padding(.vertical, 5)
            }
        }
    }

    private func market(_ key: String, board: DugoutBoard.Market?, captures: [DugoutOddsHistory.Series]) -> some View {
        let capturedBooks = Set(captures.map(\.book))
        let other = board?.quotes.filter { !capturedBooks.contains($0.book) } ?? []
        let label = board?.label ?? DugoutOddsHistory.Market.all.first { $0.id == key }?.label ?? Self.specialLabel(key)
        return VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.semibold))
            if captures.isEmpty, other.isEmpty {
                Text("No price captured").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(captures) { series in
                VStack(alignment: .leading, spacing: 3) {
                    DugoutQuoteRow(quote: .init(book: series.book, price: series.latest?.odds, opening: series.opening?.odds, line: series.line))
                    if let latest = series.latest, let opening = series.opening, series.points.count > 1 {
                        let shift = latest.implied * 100 - opening.implied * 100
                        Text(ResearchFormat.points(shift) + " implied")
                            .font(.caption2.monospacedDigit()).foregroundStyle(dugoutTone(shift, scheme: scheme) ?? .secondary)
                    }
                }
            }
            ForEach(other) { DugoutQuoteRow(quote: $0) }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static func specialLabel(_ key: String) -> String {
        switch key {
        case "laser105": "105+ mph Home Run"
        case "laser110": "110+ mph Home Run"
        case "moonshot": "Moonshot"
        case "pa1": "First Plate Appearance Home Run"
        case "hrMl": "Home Run + Moneyline"
        case "singles3": "3+ Singles"
        case "doubles2": "2+ Doubles"
        case "doubles3": "3+ Doubles"
        case "triples2": "2+ Triples"
        case "triples3": "3+ Triples"
        case "runs3": "3+ Runs"
        case "stolen_bases3": "3+ Stolen Bases"
        default: key
        }
    }
}
