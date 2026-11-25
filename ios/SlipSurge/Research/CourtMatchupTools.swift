import SwiftUI

enum CourtMatchupTool: String, CaseIterable {
    case matchup = "Matchup Lab"
    case availability = "Availability"
    case firstBasket = "First Basket"
    case cheatsheets = "Cheatsheets"
    case slateEdge = "Slate Edge"

    var glyph: String {
        switch self {
        case .matchup: "chart.xyaxis.line"
        case .availability: "heart.text.square"
        case .firstBasket: "basketball"
        case .cheatsheets: "tablecells"
        case .slateEdge: "chart.bar.xaxis"
        }
    }
}

struct CourtMatchupLab: View {
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
    @State private var metric = Metric.pace
    @Environment(\.colorScheme) private var scheme

    private var teams: [CourtBoard.Team] { [board.game.visitorTeam, board.game.homeTeam] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Compare team metric", selection: $metric) {
                ForEach(Metric.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .frame(minHeight: 44)
            HStack(alignment: .top, spacing: 8) {
                ForEach(teams, id: \.id) { team in metricCard(team) }
            }
            if board.teamStats?.isEmpty != false {
                Text("Team metrics are unavailable for this snapshot.").font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(teams, id: \.id) { team in rotation(team) }
        }
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
            LinearGradient(colors: [palette.primary.opacity(scheme == .dark ? 0.36 : 0.17), palette.secondary.opacity(0.10), Brand.surface(for: scheme)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(Brand.surface(for: scheme))
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
                        frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason)
                } label: {
                    HStack {
                        CourtPlayerIdentity(player: player)
                        Spacer()
                        Text(minutes(player.seasonMinutes))
                            .font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
                if player.id != list.prefix(8).last?.id { Divider() }
            }
        }
        .padding(12)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
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
    @State private var filter = Filter.all
    @Environment(\.colorScheme) private var scheme

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
                                frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason)
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
                    .font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
            }
            if player.draftYear != nil, player.draftYear == board.game.season {
                Text(player.draftNumber.map { "Draft class · Pick \($0)" } ?? "Draft class").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background {
            LinearGradient(colors: [color.opacity(scheme == .dark ? 0.23 : 0.14), Brand.surface(for: scheme)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(Brand.surface(for: scheme))
        }
        .clipShape(.rect(cornerRadius: 14))
        .contentShape(.rect)
    }
}
