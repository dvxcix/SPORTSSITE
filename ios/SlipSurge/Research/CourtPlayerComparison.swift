import SwiftUI

struct CourtPlayerComparison: View {
    private struct Metric: Identifiable {
        let id: String
        let name: String
        let value: (CourtBoard.Player) -> Double?
    }

    let board: CourtBoard
    let players: [CourtBoard.Player]
    let market: CourtPlayerMarket
    let venue: CourtPlayerMarket.Venue
    let observedAt: Date
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var size
    @Environment(\.courtResults) private var results
    @State private var expired = false

    private var expiry: Date? {
        if board.oddsMode == .live { return board.game.isFinal ? nil : observedAt.addingTimeInterval(30) }
        return board.isFrozen ? nil : board.tip ?? .distantPast
    }

    private var metrics: [Metric] {
        let records = [CourtPlayerMarket.points, .rebounds, .assists, .threes, .steals, .blocks].map { metric in
            Metric(id: metric.rawValue, name: metric.label, value: { metric.average($0.average) })
        } + [
            Metric(id: "minutes", name: "Minutes", value: { $0.average?["min"] ?? nil }),
            Metric(id: "recent", name: "L10 \(market.label)", value: { player in
                let values = market.history(player, board: board).filter(venue.accepts).prefix(10).compactMap(market.statistic)
                return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            }),
        ]
        guard let results, results.gameID == board.game.id else { return records }
        return [Metric(id: "result", name: "\(results.data.label) \(market.label)", value: { player in
            results.data.player(player.id)?.stat(market.rawValue)
        })] + records
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if expired || (expiry.map { $0 <= .now } ?? false) {
                    ContentUnavailableView("Refresh the game board", systemImage: "clock.arrow.circlepath",
                        description: Text("The previous observation has expired."))
                } else if size.isAccessibilitySize {
                    VStack(spacing: 12) {
                        ForEach(players) { player in
                            let palette = CourtTeamColors.colors(for: player.team.abbreviation)
                            ResearchToolCard(color: palette.primary) {
                                CourtPlayerIdentity(player: player)
                            } content: {
                                ResearchToolValues(items: metrics.map { .init(label: $0.name, text: ResearchFormat.decimal($0.value(player))) })
                            }
                        }
                    }.padding(16)
                } else {
                    comparisonGrid.padding(16)
                }
            }
            .background(slipPalette.background)
            .navigationTitle("Compare players")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            if let expiry {
                do {
                    try await Task.sleep(for: .seconds(max(0, expiry.timeIntervalSinceNow)))
                    expired = true
                } catch is CancellationError {
                    return
                } catch {}
            }
        }
    }

    private var comparisonGrid: some View {
        let fields = metrics
        return ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 7, verticalSpacing: 8) {
                GridRow(alignment: .top) {
                    Text(board.isFrozen ? "Pregame" : board.historical ? "Sample" : "Season")
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(players) { player in playerHeader(player) }
                }
                ForEach(fields) { metric in
                    let best = players.compactMap(metric.value).max()
                    GridRow {
                        Text(metric.name).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                            .frame(width: 84, alignment: .leading)
                        ForEach(players) { player in
                            let value = metric.value(player)
                            let ahead = best != nil && value == best
                            Text(ResearchFormat.decimal(value)).font(.subheadline.weight(.bold))
                                .foregroundStyle(ahead ? slipPalette.accent : slipPalette.text)
                                .monospacedDigit().frame(minWidth: 95, minHeight: 37)
                                .background(slipPalette.surface, in: .rect(cornerRadius: 9))
                                .accessibilityLabel("\(player.firstName) \(player.lastName), \(metric.name)")
                                .accessibilityValue(ResearchFormat.decimal(value))
                        }
                    }
                }
            }
        }.scrollIndicators(.visible)
    }

    private func playerHeader(_ player: CourtBoard.Player) -> some View {
        let palette = CourtTeamColors.colors(for: player.team.abbreviation)
        return VStack(spacing: 5) {
            PlayerArtwork(portraits: player.headshot.map { [$0] } ?? [], logo: player.team.logo,
                primary: palette.primary, secondary: palette.secondary)
            Text("\(player.firstName) \(player.lastName)").font(.caption.weight(.semibold)).multilineTextAlignment(.center)
            Text(player.team.abbreviation).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(width: 96)
        .accessibilityElement(children: .combine)
    }
}
