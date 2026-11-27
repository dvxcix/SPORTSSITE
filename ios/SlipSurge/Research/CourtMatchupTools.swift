import SwiftUI

enum CourtMatchupTool: String, CaseIterable {
    case matchup = "Matchup Lab"
    case availability = "Availability"
    case firstBasket = "First Basket"
    case cheatsheets = "Cheatsheets"
    case trends = "Trends"
    case slateEdge = "Slate Edge"
    case score = "SlipSurge Score"
    case defense = "Defense vs. Position"
    case lineups = "Starting Lineups"
    case publicActivity = "The Public"
    case crossMarket = "Cross-market"
    case scouting = "Role & Minutes"
    case tracking = "Game Tracking"

    var glyph: String {
        switch self {
        case .matchup: "chart.xyaxis.line"
        case .availability: "heart.text.square"
        case .firstBasket: SlipGlyph.firstBasket.rawValue
        case .cheatsheets: SlipGlyph.cheatsheets.rawValue
        case .trends: "chart.bar"
        case .slateEdge: SlipGlyph.slateEdge.rawValue
        case .score: "bolt"
        case .defense: "shield"
        case .lineups: "person.3"
        case .publicActivity: "chart.pie"
        case .crossMarket: "arrow.left.arrow.right"
        case .scouting: "gauge.open.with.lines.needle.33percent"
        case .tracking: "waveform.path"
        }
    }
}

struct CourtMatchupLab: View {
    private enum Section: String, CaseIterable {
        case overview = "Overview", rotations = "Rotations", defense = "Defense"

        var symbol: String {
            switch self {
            case .overview: "rectangle.split.2x1"
            case .rotations: "person.3"
            case .defense: "shield"
            }
        }
    }

    private enum Metric: String, CaseIterable {
        case pace, offense = "off_rating", defense = "def_rating", net = "net_rating", rebounds = "reb_pct", shooting = "ts_pct"

        var label: String {
            switch self {
            case .pace: "Pace"
            case .offense: "Offensive rating"
            case .defense: "Defensive rating"
            case .net: "Net rating"
            case .rebounds: "Rebound share"
            case .shooting: "True shooting"
            }
        }

        func format(_ value: Double?) -> String {
            guard let value else { return "—" }
            if self == .rebounds || self == .shooting {
                return value.formatted(.percent.precision(.fractionLength(1)))
            }
            return value.formatted(.number.precision(.fractionLength(1)))
        }
    }

    let board: CourtBoard
    let observedAt: Date
    let scope: CourtView.Scope
    let revision: Int
    @State private var metric = Metric.pace
    @State private var section = Section.overview
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var textSize
    private var scheme: ColorScheme { slipPalette.colorScheme }

    private var teams: [CourtBoard.Team] { [board.game.visitorTeam, board.game.homeTeam] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ResearchToolRail(title: "Matchup breakdown", choices: Section.allCases, selection: $section,
                             label: \.rawValue, glyph: \.symbol, compact: true)
            switch section {
            case .overview:
                overview
            case .rotations:
                ForEach(teams, id: \.id) { team in rotation(team) }
            case .defense:
                CourtIntelligenceView(scope: scope, board: board, defense: true, revision: revision)
            }
        }
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 12) {
            if board.teamStats?.isEmpty == false {
                ResearchSectionTitle(title: "Offense against defense")
                let comparisonLayout = horizontalSizeClass == .regular && !textSize.isAccessibilitySize
                    ? AnyLayout(HStackLayout(alignment: .top, spacing: 8))
                    : AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                comparisonLayout {
                    ratings(offense: board.game.visitorTeam, defense: board.game.homeTeam)
                    ratings(offense: board.game.homeTeam, defense: board.game.visitorTeam)
                }
                Picker("Compare team metric", selection: $metric) {
                    ForEach(Metric.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .frame(minHeight: 44)
                let metricsLayout = textSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
                metricsLayout {
                    ForEach(teams, id: \.id) { team in metricCard(team) }
                }
            } else {
                Text("Team metrics are unavailable for this snapshot.").font(.footnote).foregroundStyle(.secondary)
            }
            GameMarkets(away: marketTeam(board.game.visitorTeam), home: marketTeam(board.game.homeTeam),
                        offers: board.gameOdds?.map(\.book) ?? [])
        }
    }

    private func ratings(offense: CourtBoard.Team, defense: CourtBoard.Team) -> some View {
        let ratingsLayout = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
        return ratingsLayout {
            ratingColumn(offense, title: "\(offense.abbreviation) offense", metric: .offense)
            ratingColumn(defense, title: "\(defense.abbreviation) defense", metric: .defense)
        }
        .padding(12)
        .background(slipPalette.surface, in: .rect(cornerRadius: 13))
        .accessibilityElement(children: .contain)
    }

    private func ratingColumn(_ team: CourtBoard.Team, title: String, metric: Metric) -> some View {
        HStack(spacing: 8) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "basketball")
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                Text(metric.format(rating(metric, team: team))).font(.headline).monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func rating(_ metric: Metric, team: CourtBoard.Team) -> Double? {
        board.teamStats?.first { $0.team.id == team.id }?.stats[metric.rawValue] ?? nil
    }

    private func marketTeam(_ team: CourtBoard.Team) -> ResearchMatchup.Team {
        let colors = CourtTeamColors.colors(for: team.abbreviation)
        return .init(name: team.abbreviation, logo: team.logo, color: colors.primary, secondary: colors.secondary)
    }

    private func metricCard(_ team: CourtBoard.Team) -> some View {
        let palette = CourtTeamColors.colors(for: team.abbreviation)
        let values = board.teamStats?.first { $0.team.id == team.id }?.stats
        return VStack(alignment: .leading, spacing: 8) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 38, height: 38)
            Text(team.fullName).font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text(metric.format(values?[metric.rawValue] ?? nil)).font(.largeTitle.weight(.bold)).monospacedDigit()
                .minimumScaleFactor(0.64)
            Text(metric.label).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            Divider()
            ForEach(Metric.allCases.filter { $0 != metric }, id: \.self) { other in
                VStack(alignment: .leading, spacing: 3) {
                    Text(other.label).font(.caption2).foregroundStyle(.secondary)
                    Text(other.format(values?[other.rawValue] ?? nil)).font(.subheadline.weight(.semibold)).monospacedDigit()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(12)
        .background {
            LinearGradient(colors: [palette.primary.opacity(scheme == .dark ? 0.36 : 0.17), palette.secondary.opacity(0.10), slipPalette.surface],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(slipPalette.surface)
        }
        .clipShape(.rect(cornerRadius: 16))
    }

    private func rotation(_ team: CourtBoard.Team) -> some View {
        let list = board.players.filter { $0.team.id == team.id }
            .sorted { ($0.seasonMinutes ?? 0) > ($1.seasonMinutes ?? 0) }
        return VStack(alignment: .leading, spacing: 9) {
            ResearchSectionTitle(title: "\(team.abbreviation) rotation")
            ForEach(list.prefix(8)) { player in
                NavigationLink {
                    CourtPlayerView(player: player, game: board.game, mode: board.oddsMode,
                        frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                        researchScope: scope, matchupBoard: board)
                } label: {
                    HStack {
                        CourtPlayerIdentity(player: player)
                        Spacer()
                        Text(minutes(player.seasonMinutes))
                            .font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if player.id != list.prefix(8).last?.id { Divider() }
            }
        }
        .padding(12)
        .background(slipPalette.surface, in: .rect(cornerRadius: 16))
    }

    private func minutes(_ value: Double?) -> String {
        guard let value else { return "—" }
        return "\(value.formatted(.number.precision(.fractionLength(1)))) min"
    }
}

struct CourtAvailability: View {
    private enum Filter: String, CaseIterable {
        case all = "All players", injuries = "Injury listings", draft = "Draft class"
    }

    let board: CourtBoard
    let observedAt: Date
    let scope: CourtView.Scope
    @State private var filter = Filter.all
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }

    private func listed(_ player: CourtBoard.Player) -> Bool {
        switch filter {
        case .all: true
        case .injuries: player.injury != nil
        case .draft: player.draftYear != nil && player.draftYear == board.game.season
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Availability filter", selection: $filter) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .frame(minHeight: 44)
            ForEach([board.game.visitorTeam, board.game.homeTeam], id: \.id) { team in
                let players = board.players.filter { $0.team.id == team.id && listed($0) }
                    .sorted { ($0.injury != nil) && ($1.injury == nil) }
                let color = CourtTeamColors.colors(for: team.abbreviation).primary
                VStack(alignment: .leading, spacing: 9) {
                    ResearchSectionTitle(title: team.fullName)
                    if players.isEmpty {
                        Text("No players match this filter.").font(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(players) { player in
                        NavigationLink {
                            CourtPlayerView(player: player, game: board.game, mode: board.oddsMode,
                                frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                                researchScope: scope, matchupBoard: board)
                        } label: {
                            card(player, color: color)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func card(_ player: CourtBoard.Player, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                CourtPlayerIdentity(player: player)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
            }
            if let injury = player.injury {
                Text(injury.status).font(.subheadline.bold())
                if let description = injury.description, !description.isEmpty {
                    Text(description).font(.subheadline).foregroundStyle(.secondary)
                }
                if let date = injury.returnDate, !date.isEmpty {
                    Text("Listed return \(date)").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("No injury listed").font(.caption).foregroundStyle(.secondary)
            }
            if board.starters?.contains(player.id) == true {
                Label("Confirmed starter", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.semibold)).foregroundStyle(slipPalette.accent)
            }
            if player.draftYear != nil, player.draftYear == board.game.season {
                Text(player.draftNumber.map { "Draft class · Pick \($0)" } ?? "Draft class").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background {
            LinearGradient(colors: [color.opacity(scheme == .dark ? 0.23 : 0.14), slipPalette.surface],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(slipPalette.surface)
        }
        .clipShape(.rect(cornerRadius: 14))
        .contentShape(.rect)
    }
}
