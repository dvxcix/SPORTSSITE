import SwiftUI

struct CourtOpponentLog: View {
    enum Scope: Hashable {
        case matchup, all
    }

    struct Filters {
        var season: Int?
        var scope = Scope.matchup
        var minimumMinutes = 0
        var venue: CourtPlayerMarket.Venue?
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
    @Binding var filters: Filters
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize

    private var seasons: [Int] {
        let samples = metric.isFirstQuarter ? player.periodLogs : player.logs
        let recorded = Set(samples?.compactMap(\.game.season) ?? [])
        return recorded.filter { candidate in
            !metric.history(player, game: game, sampleSeason: candidate).isEmpty
        }.sorted(by: >)
    }

    private func chosenSeason(from available: [Int]) -> Int? {
        if let season = filters.season, available.contains(season) { return season }
        if let sampleSeason, available.contains(sampleSeason) { return sampleSeason }
        // Missing snapshots stay missing until the user chooses a different season.
        return nil
    }

    private var appliedVenue: CourtPlayerMarket.Venue { filters.venue ?? initialVenue }

    private func qualifyingLogs(season: Int?) -> [CourtBoard.PlayerLog] {
        metric.history(player, game: game, sampleSeason: season).filter { row in
            guard appliedVenue.accepts(row), metric.statistic(row) != nil else { return false }
            return metric.isFirstQuarter || filters.minimumMinutes == 0 ||
                row.minutes.map { $0 >= Double(filters.minimumMinutes) } == true
        }
    }

    var body: some View {
        let availableSeasons = seasons
        let season = chosenSeason(from: availableSeasons)
        let all = qualifyingLogs(season: season)
        let visible = visibleLogs(all)
        Section("Opponent game log") {
            if let line {
                LabeledContent("Reference line") {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(metric.target(line, side: side)).monospacedDigit()
                        ResearchToolBook(book: line.vendor, price: line.odds)
                    }
                }
            }
            if let opponent {
                Picker("Opponent", selection: $filters.scope) {
                    Label("vs \(opponent.abbreviation)", systemImage: "target").tag(Scope.matchup)
                    Text("All opponents").tag(Scope.all)
                }
            }
            if !availableSeasons.isEmpty {
                Picker("Season", selection: Binding(get: { season }, set: { filters.season = $0 })) {
                    if season == nil { Text("Choose a saved season").tag(nil as Int?) }
                    ForEach(availableSeasons, id: \.self) { year in
                        Text("\(String(year))–\(String(year + 1).suffix(2))").tag(Optional(year))
                    }
                }
            }
            Picker("Venue", selection: Binding(get: { appliedVenue }, set: { filters.venue = $0 })) {
                ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            if !metric.isFirstQuarter {
                Picker("Minimum minutes", selection: $filters.minimumMinutes) {
                    Text("Any minutes").tag(0)
                    ForEach([15, 20, 25, 30], id: \.self) { Text("\($0) min or more").tag($0) }
                }
            }
            if visible.isEmpty {
                if let opponent, filters.scope == .matchup, !all.isEmpty {
                    ContentUnavailableView {
                        Label("No games against \(opponent.abbreviation) match these filters", systemImage: "list.bullet.rectangle")
                    } actions: {
                        Button("Show all opponents") { filters.scope = .all }
                    }
                } else {
                    ContentUnavailableView("No recorded games match these filters", systemImage: "list.bullet.rectangle")
                }
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

    private func visibleLogs(_ all: [CourtBoard.PlayerLog]) -> [CourtBoard.PlayerLog] {
        guard filters.scope == .matchup, let opponent else { return all }
        return all.filter { $0.opponentID == opponent.id }
    }

    @ViewBuilder private func logRow(_ log: CourtBoard.PlayerLog) -> some View {
        if let value = metric.statistic(log) {
            let date = SlateDate.fromKey(String(log.game.date.prefix(10))).map { SlateDate.label($0) } ?? log.game.date
            let result = ResearchGameChart.Result(value: value, line: line?.line, under: side == .under,
                                                  milestone: line?.milestone == true)
            let context = matchup(log)
            let rowLayout = textSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 5))
                : AnyLayout(HStackLayout(spacing: 8))
            rowLayout {
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
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 8) {
                    Text(metric.isBinary ? (value > 0 ? "Yes" : "No") : value.formatted())
                        .monospacedDigit().fontWeight(.semibold)
                    if line != nil {
                        Label(result.rawValue, systemImage: result.icon)
                            .font(.caption.weight(.semibold)).foregroundStyle(result.color(in: palette))
                    }
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func matchup(_ log: CourtBoard.PlayerLog) -> (label: String, logo: URL?)? {
        guard let id = log.opponentID else { return nil }
        guard let opponent = teams.first(where: { $0.id == id }) ??
                [game.homeTeam, game.visitorTeam].first(where: { $0.id == id }) else { return nil }
        return ("\(log.team?.id == log.game.homeTeamId ? "vs" : "at") \(opponent.abbreviation)", opponent.logo)
    }
}
