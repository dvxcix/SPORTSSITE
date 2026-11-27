import SwiftUI

struct CourtVolumeTrends: View {
    private enum Metric: String, CaseIterable, Codable {
        case minutes = "Minutes"
        case shots = "Field goal attempts"
        case threes = "Three-point attempts"
        case freeThrows = "Free throw attempts"

        func value(_ log: CourtBoard.PlayerLog) -> Double? {
            switch self {
            case .minutes: log.minutes
            case .shots: log.fga
            case .threes: log.fg3a
            case .freeThrows: log.fta
            }
        }
    }

    private enum Order: String, CaseIterable, Codable {
        case rise = "Biggest increases", drop = "Biggest decreases", recent = "Recent average"
    }

    private struct Filters: Codable, Equatable {
        var metric = Metric.minutes
        var window = 5
        var venue = CourtPlayerMarket.Venue.all
        var order = Order.rise
        var startersOnly = false
        var search = ""
    }

    private struct Row: Identifiable {
        let player: CourtBoard.Player
        let recent: Double
        let baseline: Double?
        let recentCount: Int
        let baselineCount: Int
        var id: Int { player.id }
        var change: Double? { baseline.map { recent - $0 } }
    }

    let board: CourtBoard
    let observedAt: Date
    let scope: CourtView.Scope
    @State private var filters = Filters()
    @State private var team = ""
    @Environment(\.slipPalette) private var palette

    private var rows: [Row] {
        let starters = Set(board.starters ?? [])
        return board.players.compactMap { player -> Row? in
            guard team.isEmpty || player.team.abbreviation == team,
                  !filters.startersOnly || starters.contains(player.id),
                  filters.search.isEmpty || "\(player.firstName) \(player.lastName)".localizedCaseInsensitiveContains(filters.search) else { return nil }
            let logs = CourtPlayerMarket.points.history(player, board: board).filter(filters.venue.accepts)
            let recent = logs.prefix(filters.window).compactMap(filters.metric.value)
            let baseline = logs.dropFirst(filters.window).compactMap(filters.metric.value)
            guard let recentAverage = average(recent) else { return nil }
            return Row(player: player, recent: recentAverage, baseline: average(baseline),
                       recentCount: recent.count, baselineCount: baseline.count)
        }.sorted { first, second in
            let a = rank(first), b = rank(second)
            return a == b ? first.id < second.id : a > b
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            controls
            let available = rows
            if available.isEmpty {
                ContentUnavailableView("No usage trends match these filters", systemImage: "chart.bar")
            } else {
                Text("Recent games compared with earlier games in the selected venue.")
                    .font(.caption).foregroundStyle(.secondary)
                LazyVStack(spacing: 9) {
                    ForEach(available) { row in playerRow(row) }
                }
            }
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    if case .member(_, let account) = scope {
                        ResearchSavedFilters(account: account, board: "court.volume", current: filters) {
                            filters = $0
                            team = ""
                        }
                    }
                    ResearchToolFilter(title: "Usage metric", symbol: "chart.bar", selection: filters.metric.rawValue) {
                        Picker("Usage metric", selection: $filters.metric) {
                            ForEach(Metric.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Recent games", symbol: "clock", selection: "Last \(filters.window)") {
                        Picker("Recent games", selection: $filters.window) {
                            ForEach([3, 5, 10], id: \.self) { Text("Last \($0)").tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Venue", symbol: "sportscourt", selection: filters.venue.rawValue) {
                        Picker("Venue", selection: $filters.venue) {
                            ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Sort", symbol: "arrow.up.arrow.down", selection: filters.order.rawValue) {
                        Picker("Sort", selection: $filters.order) {
                            ForEach(Order.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "person.2")] +
                        [board.game.visitorTeam, board.game.homeTeam].map {
                            .team(id: $0.abbreviation, title: $0.abbreviation, logo: $0.logo)
                        }, selection: $team)
                }
            }
            .scrollIndicators(.hidden)
            if board.starters?.isEmpty == false || filters.startersOnly {
                Toggle("Confirmed starters for this matchup", isOn: $filters.startersOnly).font(.subheadline)
            }
            TextField("Find a player", text: $filters.search)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    private func playerRow(_ row: Row) -> some View {
        ResearchToolCard(color: CourtTeamColors.colors(for: row.player.team.abbreviation).primary) {
            NavigationLink {
                CourtPlayerView(player: row.player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                    tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason, researchScope: scope,
                    matchupBoard: board, initialVenue: filters.venue)
            } label: {
                HStack {
                    CourtPlayerIdentity(player: row.player)
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.secondary)
                }
            }.buttonStyle(.plain)
        } content: {
            ResearchToolValues(items: [
                .init(label: "Recent · \(row.recentCount) games", text: ResearchFormat.decimal(row.recent)),
                .init(label: "Earlier · \(row.baselineCount) games", text: ResearchFormat.decimal(row.baseline)),
                .init(label: "Change", text: ResearchFormat.signedDecimal(row.change),
                      tone: Brand.signal(row.change, for: palette.colorScheme))
            ])
        }
    }

    private func average(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    private func rank(_ row: Row) -> Double {
        switch filters.order {
        case .rise: row.change ?? -.infinity
        case .drop: row.change.map { -$0 } ?? -.infinity
        case .recent: row.recent
        }
    }
}
