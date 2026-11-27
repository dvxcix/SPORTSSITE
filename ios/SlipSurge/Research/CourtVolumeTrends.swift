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
        var team: String?
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
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.horizontalSizeClass) private var widthClass

    private var teams: [CourtBoard.Team] { [board.game.visitorTeam, board.game.homeTeam] }

    private var rows: [Row] {
        let starters = Set(board.starters ?? [])
        return board.players.compactMap { player -> Row? in
            guard filters.team == nil || player.team.abbreviation == filters.team,
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
        let actions = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 8))
        let filterBar = widthClass == .regular && textSize <= .large
            ? AnyLayout(HStackLayout(spacing: 8))
            : AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
        let summary = "Last \(filters.window) · \(filters.venue.rawValue) · \(filters.order.rawValue)"
        return VStack(alignment: .leading, spacing: 8) {
            filterBar {
                actions {
                    if case .member(_, let account) = scope {
                        ResearchSavedFilters(account: account, board: "court.volume", current: filters) {
                            filters = $0
                            if !teams.contains(where: { $0.abbreviation == filters.team }) { filters.team = nil }
                        }
                    }
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "person.2")] +
                        teams.map { .team(id: $0.abbreviation, title: $0.abbreviation, logo: $0.logo) },
                        selection: Binding(get: { filters.team ?? "" }, set: { filters.team = $0.isEmpty ? nil : $0 }))
                }
                actions {
                    ResearchToolFilter(title: "Usage metric", symbol: "chart.bar", selection: filters.metric.rawValue) {
                        Picker("Usage metric", selection: $filters.metric) {
                            ForEach(Metric.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "More volume filters", symbol: "line.3.horizontal.decrease", selection: "Filters") {
                        Picker("Recent games", selection: $filters.window) {
                            ForEach([3, 5, 10], id: \.self) { Text("Last \($0)").tag($0) }
                        }
                        Picker("Venue", selection: $filters.venue) {
                            ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        Picker("Sort", selection: $filters.order) {
                            ForEach(Order.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                    .accessibilityValue(summary)
                }
            }
            Text(summary).font(.caption).foregroundStyle(.secondary)
                .accessibilityHidden(true)
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
                .contentShape(Rectangle())
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
