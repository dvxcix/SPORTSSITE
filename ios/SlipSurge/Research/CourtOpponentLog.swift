import SwiftUI

struct CourtOpponentLog: View {
    private enum Matchups: String, CaseIterable {
        case opponent = "This opponent"
        case all = "All opponents"
    }

    let player: CourtBoard.Player
    let game: CourtBoard.Game
    let opponent: CourtBoard.Team?
    let sampleSeason: Int?
    let metric: CourtPlayerMarket
    let side: CourtPlayerMarket.Side
    let line: CourtPlayerMarket.Reference?
    let initialVenue: CourtPlayerMarket.Venue
    let teams: [CourtBoard.Team]

    @State private var season: Int?
    @State private var matchups = Matchups.opponent
    @State private var minimumMinutes = 0
    @State private var venue: CourtPlayerMarket.Venue?
    @Environment(\.slipPalette) private var palette

    private var seasons: [Int] {
        let samples = metric.isFirstQuarter ? player.periodLogs : player.logs
        let recorded = Set(samples?.compactMap(\.game.season) ?? [])
        return recorded.filter { candidate in
            !metric.history(player, game: game, sampleSeason: candidate).isEmpty
        }.sorted(by: >)
    }

    private var chosenSeason: Int? {
        if let season, seasons.contains(season) { return season }
        if let sampleSeason, seasons.contains(sampleSeason) { return sampleSeason }
        // Missing snapshots stay missing until the user chooses a different season.
        return nil
    }

    private var appliedVenue: CourtPlayerMarket.Venue { venue ?? initialVenue }

    private var logs: [CourtBoard.PlayerLog] {
        metric.history(player, game: game, sampleSeason: chosenSeason).filter { row in
            guard appliedVenue.accepts(row), metric.statistic(row) != nil else { return false }
            guard minimumMinutes == 0 || row.minutes.map({ $0 >= Double(minimumMinutes) }) == true else { return false }
            guard matchups == .opponent, let opponent else { return true }
            guard let team = row.team?.id, let home = row.game.homeTeamId, let away = row.game.visitorTeamId else { return false }
            return (team == home && away == opponent.id) || (team == away && home == opponent.id)
        }
    }

    var body: some View {
        let visible = logs
        Section("Opponent game log") {
            if let opponent {
                Picker("Opponent", selection: $matchups) {
                    Label("vs \(opponent.abbreviation)", systemImage: "target").tag(Matchups.opponent)
                    Text(Matchups.all.rawValue).tag(Matchups.all)
                }
            }
            Picker("Season", selection: Binding(get: { chosenSeason }, set: { season = $0 })) {
                if chosenSeason == nil { Text("Choose a saved season").tag(nil as Int?) }
                ForEach(seasons, id: \.self) { year in
                    Text("\(String(year))–\(String(year + 1).suffix(2))").tag(Optional(year))
                }
            }
            Picker("Venue", selection: Binding(get: { appliedVenue }, set: { venue = $0 })) {
                ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            if !metric.isFirstQuarter {
                Picker("Minimum minutes", selection: $minimumMinutes) {
                    Text("Any minutes").tag(0)
                    ForEach([15, 20, 25, 30], id: \.self) { Text("\($0) min or more").tag($0) }
                }
            }
            if visible.isEmpty {
                ContentUnavailableView("No recorded games match these filters", systemImage: "list.bullet.rectangle")
            } else {
                let result = line.map { metric.rate(visible[...], against: $0, side: side) }
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(visible.count) \(visible.count == 1 ? "game" : "games") · \(metric.label)")
                        .font(.subheadline.weight(.semibold))
                    if let result {
                        Text("\(result.wins) of \(result.decisions) hit\(result.pushes > 0 ? " · \(result.pushes) pushes" : "")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                ForEach(visible, id: \.id) { log in logRow(log) }
            }
        }
        .listRowBackground(palette.surface)
    }

    @ViewBuilder private func logRow(_ log: CourtBoard.PlayerLog) -> some View {
        if let value = metric.statistic(log) {
            let date = SlateDate.fromKey(String(log.game.date.prefix(10))).map { SlateDate.label($0) } ?? log.game.date
            let result = ResearchGameChart.Result(value: value, line: line?.line, under: side == .under,
                                                  milestone: line?.milestone == true)
            let context = matchup(log)
            HStack(spacing: 8) {
                if let logo = context?.logo {
                    ResearchArtwork(urls: [logo], fallback: "basketball")
                        .frame(width: 24, height: 24)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 3) {
                    if let context {
                        Text("\(date) · \(context.label)").font(.subheadline.weight(.medium))
                    } else {
                        Text(date).font(.subheadline.weight(.medium))
                    }
                    if let minutes = log.minutes {
                        Text("\(ResearchFormat.decimal(minutes)) min").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Text(metric.isBinary ? (value > 0 ? "Yes" : "No") : value.formatted())
                    .monospacedDigit().fontWeight(.semibold)
                if line != nil {
                    Label(result.rawValue, systemImage: result.icon)
                        .font(.caption.weight(.semibold)).foregroundStyle(result.color(in: palette))
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func matchup(_ log: CourtBoard.PlayerLog) -> (label: String, logo: URL?)? {
        guard let team = log.team?.id, let home = log.game.homeTeamId, let away = log.game.visitorTeamId,
              team == home || team == away else { return nil }
        let id = team == home ? away : home
        guard let opponent = teams.first(where: { $0.id == id }) ??
                [game.homeTeam, game.visitorTeam].first(where: { $0.id == id }) else { return nil }
        return ("\(team == home ? "vs" : "at") \(opponent.abbreviation)", opponent.logo)
    }
}
