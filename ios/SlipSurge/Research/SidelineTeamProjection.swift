import SwiftUI

struct SidelineTeamProjection: View {
    let api: SidelineAPI
    let archiveAPI: MatchupArchiveAPI
    let game: String
    let date: String
    let away: ResearchMatchup.Team
    let home: ResearchMatchup.Team
    let revision: Int
    @Binding var benchmark: String
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var archive: MatchupArchive?
    @State private var markets: [GameMarketBook] = []
    @State private var archiveUnavailable = false
    @State private var marketsUnavailable = false
    @State private var showInputs = false
    @State private var showHistory = false
    @State private var showQuotes = false
    @State private var retry = 0

    private struct Request: Equatable {
        let game: String
        let revision: Int
        let retry: Int
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let archive {
                let baseline = archive.footballProjection
                scoreCard(baseline, archive: archive)
                marketComparison(baseline)
                if let baseline { inputs(baseline) }
                DisclosureGroup("Last 10 games", isExpanded: $showHistory) {
                    MatchupHistory(archive: archive, away: away, home: home, benchmark: benchmark)
                        .padding(.top, 10)
                }
                .padding(14).background(palette.surface, in: .rect(cornerRadius: 14))
                if !markets.isEmpty {
                    DisclosureGroup("Captured sportsbook quotes", isExpanded: $showQuotes) {
                        GameMarkets(away: away, home: home, offers: markets, initialBook: benchmark == "consensus" ? nil : benchmark)
                    }
                    .padding(14).background(palette.surface, in: .rect(cornerRadius: 14))
                }
            } else if archiveUnavailable {
                ContentUnavailableView {
                    Label("Projection unavailable", systemImage: "chart.line.uptrend.xyaxis")
                } description: {
                    Text("The archived team results couldn’t load.")
                } actions: {
                    Button("Retry") { retry += 1 }.buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView("Loading team projection").frame(maxWidth: .infinity).padding()
            }
        }
        .task(id: Request(game: game, revision: revision, retry: retry)) { await load() }
    }

    private func scoreCard(_ projection: MatchupArchive.FootballProjection?, archive: MatchupArchive) -> some View {
        ResearchToolCard(color: palette.accent) {
            ResearchSectionTitle(title: "Projected score")
        } content: {
            if let projection {
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    teamScore(away, score: projection.awayScore)
                    teamScore(home, score: projection.homeScore)
                }
                Label("Same-season scoring baseline", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("At least four completed games this season are needed for each team.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if let cutoff = SidelineBoard.timestamp(archive.cutoffAt) {
                Text("Pregame cutoff \(cutoff.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func teamScore(_ team: ResearchMatchup.Team, score: Double) -> some View {
        HStack(spacing: 6) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "football")
                .frame(width: 26, height: 26).accessibilityHidden(true)
            Text(team.name).font(.subheadline.weight(.semibold)).lineLimit(1)
            Spacer(minLength: 0)
            Text(ResearchFormat.decimal(score)).font(.title2.weight(.semibold))
                .monospacedDigit().fixedSize(horizontal: true, vertical: false)
        }
        .padding(10)
        .background(team.color.opacity(0.24), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func marketComparison(_ projection: MatchupArchive.FootballProjection?) -> some View {
        let availableBooks = Set(markets.map { Sportsbook.normalized($0.vendor) }
            + (archive?.away.games.flatMap(\.lines).map { Sportsbook.normalized($0.vendor) } ?? [])
            + (archive?.home.games.flatMap(\.lines).map { Sportsbook.normalized($0.vendor) } ?? []))
        let books = ([benchmark] + availableBooks.sorted()).filter { !$0.isEmpty && $0 != "consensus" }
        let options = [.init(id: "consensus", title: "Consensus", icon: "chart.bar.xaxis")] as [ResearchArtworkPicker.Option]
        let market = GameMarketComparison(offers: benchmark == "consensus" ? markets : markets.filter {
            Sportsbook.normalized($0.vendor) == benchmark
        }, totalRange: 1...150, impliedProbability: ResearchOddsSlate.Price.implied)
        return ResearchToolCard(color: palette.accent) {
            ResearchSectionTitle(title: "Model vs. market")
        } content: {
            ResearchArtworkPicker(title: "Market benchmark",
                options: options + Array(Set(books)).sorted().map(ResearchArtworkPicker.Option.sportsbook), selection: $benchmark)
            comparison("Spread", projection: projection.map { -$0.margin }, market: market.homeSpread, format: spread)
            comparison("Game total", projection: projection?.total, market: market.total, format: { ResearchFormat.decimal($0) })
            if let chance = market.homeMoneylineProbability {
                Text("Market win chance · \(home.name) \(chance.value.formatted(.percent.precision(.fractionLength(1))))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if marketsUnavailable {
                Text("This matchup’s game lines couldn’t load.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func comparison(_ title: String, projection: Double?, market: GameMarketComparison.Sample?,
                            format: (Double) -> String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            ResearchToolValues(items: [
                .init(label: "Projection", text: projection.map(format) ?? "Unavailable", tone: palette.accent),
                .init(label: benchmark == "consensus" ? "Consensus" : "Book line",
                    text: market.map { format($0.value) } ?? "Unavailable")
            ], preferredColumns: 2)
            if let projection, let market {
                Text("\(ResearchFormat.decimal(abs(projection - market.value))) pts apart")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func spread(_ line: Double) -> String {
        if abs(line) < 0.05 { return "Pick’em" }
        return "\(line < 0 ? home.name : away.name) −\(ResearchFormat.decimal(abs(line)))"
    }

    private func inputs(_ projection: MatchupArchive.FootballProjection) -> some View {
        DisclosureGroup("Projection inputs", isExpanded: $showInputs) {
            VStack(alignment: .leading, spacing: 8) {
                rateInputs(away, rates: projection.away)
                Divider()
                rateInputs(home, rates: projection.home)
                Text("Each score averages the team’s points scored with its opponent’s points allowed across up to ten same-season finals before kickoff. The baseline excludes quarterback, lineup, venue, and weather adjustments.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(.top, 8)
        }
        .padding(14).background(palette.surface, in: .rect(cornerRadius: 14))
    }

    private func rateInputs(_ team: ResearchMatchup.Team, rates: MatchupArchive.FootballProjection.TeamRates) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(team.name) · \(rates.games) games").font(.subheadline.bold())
            LabeledContent("Points scored per game", value: ResearchFormat.decimal(rates.scored))
            LabeledContent("Points allowed per game", value: ResearchFormat.decimal(rates.allowed))
        }
        .font(.subheadline)
    }

    private func load() async {
        archiveUnavailable = false
        marketsUnavailable = false
        async let archiveLoad: Void = loadArchive()
        async let marketsLoad: Void = loadMarkets()
        _ = await (archiveLoad, marketsLoad)
    }

    private func loadArchive() async {
        do {
            let result = try await archiveAPI.read(.nfl, game: game, date: date, away: away.name, home: home.name)
            try Task.checkCancellation()
            archive = result
        } catch {
            if !Task.isCancelled { archiveUnavailable = true }
        }
    }

    private func loadMarkets() async {
        do {
            let result = try await api.gameMarkets(gameID: game, date: date)
            try Task.checkCancellation()
            var books = Set<String>()
            markets = result.offers.filter { $0.isOpeningOnly != true && books.insert(Sportsbook.normalized($0.vendor)).inserted }
        } catch {
            if !Task.isCancelled { marketsUnavailable = true }
        }
    }
}
