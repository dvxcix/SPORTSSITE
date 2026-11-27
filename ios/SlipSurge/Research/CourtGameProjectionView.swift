import SwiftUI

struct CourtGameProjectionView: View {
    @Binding var sportsbook: String
    let board: CourtBoard
    let observedGame: CourtBoard.Game?
    let openPregame: () -> Void
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.horizontalSizeClass) private var widthClass
    @State private var showingInputs = false
    @State private var showingQuotes = false
    @State private var showingResult = false

    private static let consensus = "consensus"

    private var away: CourtBoard.Team { board.game.visitorTeam }
    private var home: CourtBoard.Team { board.game.homeTeam }

    private var projection: CourtGameProjection? {
        guard let season = board.game.season, board.teamStatsSeason == season, board.sampleSeason == season,
              let away = rates(for: away), let home = rates(for: home) else { return nil }
        return .init(away: away, home: home)
    }

    private var quotes: [GameMarketBook] {
        var brands = Set<String>()
        let ordered = (board.gameOdds ?? []).map(\.book).sorted {
            let first = $0.updatedAt.flatMap(SidelineBoard.timestamp) ?? .distantPast
            let second = $1.updatedAt.flatMap(SidelineBoard.timestamp) ?? .distantPast
            return first == second ? $0.vendor < $1.vendor : first > second
        }
        return ordered.filter { quote in
            let brand = Sportsbook.normalized(quote.vendor)
            return !brand.isEmpty && brands.insert(brand).inserted
        }
    }

    private var selectedQuote: GameMarketBook? {
        guard sportsbook != Self.consensus else { return nil }
        return quotes.first { Sportsbook.normalized($0.vendor) == Sportsbook.normalized(sportsbook) }
    }

    private var finishedGame: CourtBoard.Game? {
        if let observedGame, observedGame.id == board.game.id, observedGame.date == board.game.date,
           observedGame.isFinal { return observedGame }
        return board.game.isFinal ? board.game : nil
    }

    private var benchmark: CourtGameMarketComparison {
        CourtGameMarketComparison(offers: selectedQuote.map { [$0] } ?? quotes, impliedProbability: ResearchOddsSlate.Price.implied)
    }

    var body: some View {
        if board.oddsMode == .live {
            ContentUnavailableView {
                Label("Pregame projection", systemImage: "chart.line.uptrend.xyaxis")
            } description: {
                Text("Open the pregame snapshot to compare the projection with the recorded lines.")
            } actions: {
                Button("Open Pregame", action: openPregame).buttonStyle(.borderedProminent)
            }
        } else {
            let market = benchmark
            let model = projection
            VStack(alignment: .leading, spacing: 12) {
                scoreCard(model)
                benchmarkPicker
                spreadAndTotal(model, market: market)
                moneyline(market.homeMoneylineProbability)
                if let model { inputs(model) }
                if !quotes.isEmpty { sportsbookQuotes }
                if let finishedGame, let awayScore = finishedGame.visitorTeamScore, let homeScore = finishedGame.homeTeamScore,
                   (1...400).contains(awayScore), (1...400).contains(homeScore) {
                    gameResult(awayScore: awayScore, homeScore: homeScore, model: model, market: market)
                }
            }
        }
    }

    private func rates(for team: CourtBoard.Team) -> CourtGameProjection.TeamRates? {
        guard let stats = board.teamStats?.first(where: { $0.team.id == team.id })?.stats else { return nil }
        return .init(pace: stats["pace"] ?? nil, offense: stats["off_rating"] ?? nil, defense: stats["def_rating"] ?? nil)
    }

    private func scoreCard(_ model: CourtGameProjection?) -> some View {
        ResearchToolCard(color: palette.accent) {
            ResearchSectionTitle(title: "Projected score")
        } content: {
            if let model {
                let layout = textSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    score(for: away, value: number(model.awayScore))
                    score(for: home, value: number(model.homeScore))
                }
                HStack(spacing: 8) {
                    Label("Pace and efficiency", systemImage: "gauge.with.dots.needle.50percent")
                    Spacer(minLength: 0)
                    Text("\(number(model.total)) total").monospacedDigit()
                }.font(.caption).foregroundStyle(.secondary)
            } else {
                Text("The pregame snapshot is missing team ratings or pace.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if let recorded = board.researchSnapshot?.observedAt.flatMap(SidelineBoard.timestamp) {
                Text("Pregame snapshot \(recorded.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func score(for team: CourtBoard.Team, value: String) -> some View {
        HStack(spacing: 6) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "basketball")
                .frame(width: 24, height: 24).accessibilityHidden(true)
            Text(verbatim: team.abbreviation).font(.subheadline.bold()).lineLimit(1)
            Spacer(minLength: 0)
            Text(value).font(.title2.weight(.semibold)).monospacedDigit()
                .lineLimit(1).fixedSize(horizontal: true, vertical: false)
        }
        .padding(10)
        .background(CourtTeamColors.colors(for: team.abbreviation).primary.opacity(0.24), in: .rect(cornerRadius: 11))
        .accessibilityElement(children: .combine)
    }

    private var benchmarkPicker: some View {
        let options: [ResearchArtworkPicker.Option] = [
            .init(id: Self.consensus, title: "Consensus", icon: "chart.bar.xaxis")
        ] + quotes.map { ResearchArtworkPicker.Option.sportsbook($0.vendor) }
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        let layout = widthClass == .regular && !textSize.isAccessibilitySize
            ? AnyLayout(HStackLayout(spacing: 8))
            : AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
        return layout {
            ResearchSectionTitle(title: "Model vs. market")
                .frame(maxWidth: .infinity, alignment: .leading)
            if !quotes.isEmpty { sourcePicker(options) }
        }
    }

    private func sourcePicker(_ options: [ResearchArtworkPicker.Option]) -> some View {
        ResearchArtworkPicker(title: "Market benchmark", options: options,
            selection: Binding(get: { selectedQuote?.vendor ?? Self.consensus }, set: { sportsbook = $0 }))
    }

    private func spreadAndTotal(_ model: CourtGameProjection?, market: CourtGameMarketComparison) -> some View {
        VStack(spacing: 8) {
            comparisonRow("Spread", projection: model.map { -$0.homeMargin },
                difference: difference(model?.homeMargin, market.homeSpread.map { -$0.value },
                    higher: "toward \(home.abbreviation)", lower: "toward \(away.abbreviation)"),
                sample: market.homeSpread, format: spread)
            comparisonRow("Game total", projection: model?.total,
                difference: difference(model?.total, market.total?.value, higher: "higher", lower: "lower"),
                sample: market.total, format: number)
        }
    }

    private func comparisonRow(_ title: String, projection: Double?, difference: String?,
                               sample: CourtGameMarketComparison.Sample?, format: (Double) -> String) -> some View {
        ResearchToolCard(color: palette.accent) {
            Text(title).font(.headline)
        } content: {
            ResearchToolValues(items: [
                .init(label: "Projection", text: projection.map(format) ?? "Unavailable", tone: projection == nil ? nil : palette.accent),
                .init(label: selectedQuote == nil ? "Consensus" : "Book line", text: sample.map { format($0.value) } ?? "Unavailable")
            ], preferredColumns: 2)
            if let projection, let sample {
                comparisonScale(projection: projection, market: sample)
            }
            if let difference { Text(difference).font(.caption.weight(.semibold)).foregroundStyle(palette.accent) }
            if selectedQuote == nil, let sample {
                let count = sample.count == 1 ? "1 book" : "\(sample.count) books"
                Text(sample.range.lowerBound == sample.range.upperBound
                     ? count : "\(count) · \(format(sample.range.lowerBound)) to \(format(sample.range.upperBound))")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func comparisonScale(projection: Double, market: CourtGameMarketComparison.Sample) -> some View {
        let lower = min(projection, market.range.lowerBound)
        let upper = max(projection, market.range.upperBound)
        let padding = max(1, (upper - lower) * 0.12)
        let domain = (lower - padding)...(upper + padding)
        return GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            let marketPosition = width * (market.value - domain.lowerBound) / (domain.upperBound - domain.lowerBound)
            let projectionPosition = width * (projection - domain.lowerBound) / (domain.upperBound - domain.lowerBound)
            Capsule().fill(palette.text.opacity(0.16)).frame(height: 2)
                .position(x: width / 2, y: height / 2)
            Capsule().fill(palette.accent.opacity(0.65))
                .frame(width: abs(projectionPosition - marketPosition), height: 2)
                .position(x: (projectionPosition + marketPosition) / 2, y: height / 2)
            Circle().fill(palette.accent).frame(width: 8, height: 8)
                .position(x: projectionPosition, y: height / 2)
            Circle().strokeBorder(palette.text, lineWidth: 1.4).frame(width: 12, height: 12)
                .position(x: marketPosition, y: height / 2)
        }
        .frame(height: 12)
        .padding(.horizontal, 6)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func moneyline(_ sample: CourtGameMarketComparison.Sample?) -> some View {
        if let sample {
            ResearchToolCard(color: palette.accent) {
                Text("Moneyline implied chances").font(.headline)
            } content: {
                ResearchToolValues(items: [
                    .init(label: away.abbreviation, text: (1 - sample.value).formatted(.percent.precision(.fractionLength(1)))),
                    .init(label: home.abbreviation, text: sample.value.formatted(.percent.precision(.fractionLength(1))))
                ], preferredColumns: 2)
                Text(selectedQuote == nil
                     ? "Median of \(sample.count) two-sided moneylines with the book margin removed."
                     : "Both sides of the recorded moneyline with the book margin removed.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func inputs(_ model: CourtGameProjection) -> some View {
        DisclosureGroup("Projection inputs", isExpanded: $showingInputs) {
            VStack(alignment: .leading, spacing: 9) {
                LabeledContent("Projected possessions", value: number(model.possessions))
                LabeledContent("\(away.abbreviation) season pace", value: number(model.away.pace))
                LabeledContent("\(home.abbreviation) season pace", value: number(model.home.pace))
                Divider()
                rateInputs(away, offense: model.away.offense, defense: model.home.defense, average: model.awayRate)
                rateInputs(home, offense: model.home.offense, defense: model.away.defense, average: model.homeRate)
                Text("The teams’ average pace sets possessions. Each projected score uses the average of that team’s offensive rating and the opponent’s defensive rating. Ratings are points per 100 possessions.")
                    .font(.caption).foregroundStyle(.secondary)
                Text("This baseline uses season pace and ratings. Lineup, rest and venue adjustments are outside this estimate.")
                    .font(.caption).foregroundStyle(.secondary)
            }.font(.subheadline).padding(.top, 9)
        }
        .padding(14)
        .background(palette.surface, in: .rect(cornerRadius: 14))
    }

    private func rateInputs(_ team: CourtBoard.Team, offense: Double, defense: Double, average: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: team.abbreviation).font(.subheadline.bold())
            LabeledContent("Offensive rating", value: number(offense))
            LabeledContent("Opponent defensive rating", value: number(defense))
            LabeledContent("Blended rating", value: number(average))
        }
    }

    private var sportsbookQuotes: some View {
        DisclosureGroup("Captured sportsbook quotes", isExpanded: $showingQuotes) {
            GameMarkets(away: marketTeam(away), home: marketTeam(home),
                offers: selectedQuote.map { [$0] } ?? quotes, initialBook: selectedQuote?.vendor,
                showsBookPicker: selectedQuote == nil)
                .id(selectedQuote?.vendor)
        }
        .padding(14)
        .background(palette.surface, in: .rect(cornerRadius: 14))
    }

    private func gameResult(awayScore: Int, homeScore: Int, model: CourtGameProjection?,
                            market: CourtGameMarketComparison) -> some View {
        DisclosureGroup("Final result", isExpanded: $showingResult) {
            let total = awayScore + homeScore
            let margin = homeScore - awayScore
            VStack(alignment: .leading, spacing: 9) {
                LabeledContent("Final score", value: "\(away.abbreviation) \(awayScore) · \(home.abbreviation) \(homeScore)")
                if let spread = market.homeSpread?.value {
                    let result = Double(margin) + spread
                    LabeledContent("Against displayed spread", value: abs(result) < 0.001 ? "Push" : "\(result > 0 ? home.abbreviation : away.abbreviation) covered")
                }
                if let line = market.total?.value {
                    let result = Double(total) - line
                    LabeledContent("Against displayed total", value: abs(result) < 0.001 ? "Push" : (result > 0 ? "Over" : "Under"))
                }
                if let model {
                    LabeledContent("Total projection error", value: "\(number(abs(Double(total) - model.total))) pts")
                    LabeledContent("Margin projection error", value: "\(number(abs(Double(margin) - model.homeMargin))) pts")
                }
            }.font(.subheadline).padding(.top, 9)
        }
        .padding(14)
        .background(palette.surface, in: .rect(cornerRadius: 14))
    }

    private func marketTeam(_ team: CourtBoard.Team) -> ResearchMatchup.Team {
        let colors = CourtTeamColors.colors(for: team.abbreviation)
        return .init(name: team.abbreviation, logo: team.logo, color: colors.primary, secondary: colors.secondary)
    }

    private func spread(_ homeLine: Double) -> String {
        if abs(homeLine) < 0.05 { return "Pick’em" }
        return "\(homeLine < 0 ? home.abbreviation : away.abbreviation) −\(number(abs(homeLine)))"
    }

    private func difference(_ projection: Double?, _ market: Double?, higher: String, lower: String) -> String? {
        guard let projection, let market else { return nil }
        let gap = projection - market
        if abs(gap) < 0.05 { return "In line with the market" }
        return "\(number(abs(gap))) pts \(gap > 0 ? higher : lower)"
    }

    private func number(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }
}
