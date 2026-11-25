import SwiftUI

struct CourtPlayerBoard: View {
    let team: CourtBoard.Team
    let board: CourtBoard
    let observedAt: Date
    let market: CourtPlayerMarket
    let sportsbook: String?
    let side: CourtPlayerMarket.Side
    let search: String
    let ranks: [Int: CourtAPI.Rank]
    let matrixMatches: [Int: [CourtMatrixResults.Match]]
    let matrixFilter: String?

    @Environment(\.colorScheme) private var scheme

    private var players: [CourtBoard.Player] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return board.players.filter {
            $0.team.id == team.id && (query.isEmpty || "\($0.firstName) \($0.lastName)".localizedStandardContains(query))
                && (matrixFilter == nil || matrixMatches[$0.id]?.contains { $0.id == matrixFilter } == true)
        }
    }

    private var baselineLabel: String {
        if market.isFirstQuarter { return "Q1 Sample" }
        if board.isFrozen { return "Pregame" }
        return board.historical ? "Sample" : "Season"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                    .frame(width: 25, height: 25)
                    .accessibilityHidden(true)
                ResearchSectionTitle(title: team.fullName)
            }

            if players.isEmpty {
                Text(search.isEmpty && matrixFilter == nil ? "No recorded player research." : "No matching players.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(players) { player in
                        let quote = market.reference(player, gameID: board.game.id, vendor: sportsbook, side: side)
                        NavigationLink {
                            CourtPlayerView(
                                player: player, game: board.game, mode: board.oddsMode,
                                frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                                initialBook: quote?.vendor ?? sportsbook, initialMarket: market.rawValue, initialSide: side
                            )
                        } label: {
                            playerRow(player, quote: quote)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        if player.id != players.last?.id { Divider() }
                    }
                }
            }
        }
        .padding(12)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
    }

    private func playerRow(_ player: CourtBoard.Player, quote: CourtPlayerMarket.Reference?) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                CourtPlayerIdentity(player: player)
                    .layoutPriority(1)
                Spacer(minLength: 3)
                if let rank = ranks[player.id] { mismatch(rank) }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            ViewThatFits(in: .horizontal) {
                Grid(alignment: .topLeading, horizontalSpacing: 10, verticalSpacing: 5) {
                    GridRow(alignment: .top) {
                        lineValue(quote)
                        baseline(player)
                        hitRates(player, quote: quote)
                    }
                }
                VStack(alignment: .leading, spacing: 9) {
                    HStack(alignment: .top) {
                        lineValue(quote)
                        baseline(player)
                    }
                    HStack(alignment: .top) { hitRates(player, quote: quote) }
                }
            }
            if let matches = matrixMatches[player.id], !matches.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 5) {
                        ForEach(matches) { match in
                            Label(match.name, systemImage: "square.grid.3x3")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 7).padding(.vertical, 4)
                                .background((Color(hex: match.color) ?? .secondary).opacity(0.18), in: Capsule())
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
        .padding(.vertical, 9)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func mismatch(_ rank: CourtAPI.Rank) -> some View {
        let color = rank.mm > 0 ? Brand.accent(for: scheme) : rank.mm < 0 ?
            (scheme == .dark ? Color(rgb: 0xFCA5A5) : Color(rgb: 0xB91C1C)) : .secondary
        return VStack(alignment: .trailing, spacing: 3) {
            Text("MM \(rank.mm > 0 ? "+" : "")\(rank.mm)")
                .font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(color)
            Text("Book #\(rank.marketRank) · Stats #\(rank.statRank)")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Market Mismatch \(rank.mm). Sportsbook rank \(rank.marketRank), production rank \(rank.statRank)")
    }

    private func lineValue(_ quote: CourtPlayerMarket.Reference?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            columnTitle("Line / Odds")
            Text(quote.map { market.target($0, side: side) } ?? "—")
                .font(.subheadline.weight(.semibold)).monospacedDigit()
            if let quote {
                HStack(spacing: 4) {
                    if let logo = Sportsbook.artwork(quote.vendor) {
                        Image(logo).resizable().scaledToFit().frame(width: 13, height: 13)
                            .accessibilityHidden(true)
                    }
                    Text(quote.odds > 0 ? "+\(quote.odds)" : String(quote.odds))
                        .font(.caption2.weight(.medium)).monospacedDigit()
                        .accessibilityLabel("\(Sportsbook.name(quote.vendor)) odds, \(quote.odds)")
                }
                .foregroundStyle(.secondary)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func baseline(_ player: CourtBoard.Player) -> some View {
        let average = market.average(player.average)
        return VStack(alignment: .leading, spacing: 4) {
            columnTitle(baselineLabel)
            Text(average.map {
                market.isBinary ? $0.formatted(.percent.precision(.fractionLength(0))) :
                    $0.formatted(.number.precision(.fractionLength(1)))
            } ?? "—")
            .font(.subheadline.weight(.semibold)).monospacedDigit()
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func hitRates(_ player: CourtBoard.Player, quote: CourtPlayerMarket.Reference?) -> some View {
        let history = market.history(player, board: board)
        ForEach([5, 10, 20], id: \.self) { count in
            let result = quote.map { market.rate(history.prefix(count), against: $0, side: side) }
            let percent = result?.percent
            VStack(alignment: .leading, spacing: 4) {
                columnTitle("L\(count)")
                Text(percent?.formatted(.percent.precision(.fractionLength(0))) ?? "—")
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(Brand.signal(percent.map { $0 - 0.5 }, for: scheme))
                if let result, result.decisions > 0 || result.pushes > 0 {
                    Text(result.pushes > 0 ? "\(result.wins)/\(result.decisions) · \(result.pushes)P" : "\(result.wins)/\(result.decisions)")
                        .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                        .accessibilityLabel("\(result.wins) hits from \(result.decisions) decisions, \(result.pushes) pushes")
                }
            }
            .fixedSize(horizontal: true, vertical: false)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    private func columnTitle(_ title: String) -> some View {
        Text(title).font(.caption2.weight(.medium)).foregroundStyle(.secondary)
    }
}
