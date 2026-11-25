import Charts
import SwiftUI

struct CourtRoleView: View {
    private struct Season: Decodable {
        struct Player: Decodable {
            let id: Int
            let advanced: [String: Double?]
            let passing: [String: Double?]
            let rebounding: [String: Double?]
            let drives: [String: Double?]
        }
        let season: Int
        let players: [Player]
        let issues: [String]
    }

    private enum Group: String, CaseIterable {
        case opportunity = "Opportunity", scoring = "Scoring", tracking = "Season tracking"
        var icon: String { self == .scoring ? "basketball" : self == .tracking ? "waveform.path" : "clock" }
    }

    private enum Order: String, CaseIterable {
        case minutes = "Minutes", change = "Minutes change", attempts = "Shot attempts", usage = "Usage"
    }

    private struct Row: Identifiable {
        let player: CourtBoard.Player
        let games: Int
        let minutes: Double?
        let change: Double?
        let fga: Double?
        let fg3a: Double?
        let fta: Double?
        let points36: Double?
        let usage: Double?
        let potential: Double?
        let chances: Double?
        let drives: Double?
        var id: Int { player.id }

        func sorting(_ order: Order) -> Double? {
            switch order {
            case .minutes: minutes
            case .change: change
            case .attempts: fga
            case .usage: usage
            }
        }
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let observedAt: Date
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @State private var season: Season?
    @State private var retry = 0
    @State private var failed = false
    @State private var window = 10
    @State private var group = Group.opportunity
    @State private var order = Order.minutes
    @State private var team = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    teamPicker
                    ResearchToolFilter(title: "Sort players", selection: order.rawValue) {
                        Picker("Sort players", selection: $order) {
                            ForEach(Order.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                }.padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            Picker("Recent appearances", selection: $window) {
                ForEach([5, 10, 20], id: \.self) { Text("L\($0)").tag($0) }
            }.pickerStyle(.segmented)
            ResearchToolRail(title: "Role metrics", choices: Group.allCases, selection: $group, label: \.rawValue, glyph: \.icon)
            if failed || season?.issues.isEmpty == false {
                HStack {
                    Label("Some season tracking is unavailable", systemImage: "clock.badge.exclamationmark")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if failed { Button("Retry") { retry += 1 }.font(.caption.weight(.semibold)) }
                }
            }
            let rows = makeRows()
            if rows.isEmpty {
                ContentUnavailableView("No player roles available", systemImage: "person.2")
            } else {
                LazyVStack(spacing: 8) { ForEach(rows) { row($0) } }
            }
        }
        .task(id: "\(board.game.id):\(board.oddsMode.rawValue):\(board.observationID ?? ""):\(revision):\(retry)") {
            await load()
        }
    }

    private var teamPicker: some View {
        ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "person.2")] +
            [board.game.visitorTeam, board.game.homeTeam].map { .team(id: $0.abbreviation, title: $0.fullName, logo: $0.logo) },
            selection: $team)
    }

    private func row(_ row: Row) -> some View {
        let palette = CourtTeamColors.colors(for: row.player.team.abbreviation)
        return ResearchToolCard(color: palette.primary) {
            NavigationLink {
                CourtPlayerView(player: row.player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                    tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason, researchScope: scope)
            } label: {
                HStack {
                    CourtPlayerIdentity(player: row.player)
                    Spacer()
                    Text("\(row.games) GP").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
                }
            }.buttonStyle(SlipSurgePressStyle())
        } content: {
            ResearchToolValues(items: values(row))
        }
    }

    private func values(_ row: Row) -> [ResearchToolValues.Value] {
        switch group {
        case .opportunity:
            [.init(label: "Minutes · L\(window)", text: ResearchFormat.decimal(row.minutes)),
             .init(label: "Minutes change", text: ResearchFormat.signedDecimal(row.change), tone: Brand.signal(row.change, for: scheme)),
             .init(label: "Points / 36", text: ResearchFormat.decimal(row.points36))]
        case .scoring:
            [.init(label: "FGA", text: ResearchFormat.decimal(row.fga)),
             .init(label: "3PA", text: ResearchFormat.decimal(row.fg3a)),
             .init(label: "FTA", text: ResearchFormat.decimal(row.fta))]
        case .tracking:
            [.init(label: "Usage", text: ResearchFormat.decimal(row.usage, suffix: "%")),
             .init(label: "Potential assists", text: ResearchFormat.decimal(row.potential)),
             .init(label: "Rebound chances", text: ResearchFormat.decimal(row.chances)),
             .init(label: "Drives", text: ResearchFormat.decimal(row.drives))]
        }
    }

    private func makeRows() -> [Row] {
        let scouts = Dictionary((season?.players ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return board.players.filter { team.isEmpty || $0.team.abbreviation == team }.map { player in
            let logs = CourtPlayerMarket.points.history(player, board: board)
            let sample = logs.prefix(window)
            let prior = logs.dropFirst(window).prefix(window)
            let minutes = mean(sample.compactMap(\.minutes))
            let previous = mean(prior.compactMap(\.minutes))
            let change = if sample.count >= 5, prior.count >= 5, let minutes, let previous { minutes - previous } else { Double?.none }
            let points = mean(sample.compactMap(\.pts))
            let per36 = if let minutes, minutes > 0, let points { points / minutes * 36 } else { Double?.none }
            let scout = scouts[player.id]
            let usage = (scout?.advanced["usg_pct"] ?? nil).map { $0 * 100 }
            return Row(player: player, games: sample.count, minutes: minutes, change: change, fga: mean(sample.compactMap(\.fga)),
                fg3a: mean(sample.compactMap(\.fg3a)), fta: mean(sample.compactMap(\.fta)), points36: per36, usage: usage,
                potential: scout?.passing["potential_ast"] ?? nil, chances: scout?.rebounding["reb_chances"] ?? nil,
                drives: scout?.drives["drives"] ?? nil)
        }.sorted {
            let lhs = $0.sorting(order), rhs = $1.sorting(order)
            if let lhs, let rhs, lhs != rhs { return lhs > rhs }
            if (lhs == nil) != (rhs == nil) { return lhs != nil }
            return $0.player.id < $1.player.id
        }
    }

    private func load() async {
        do {
            let value = try await CourtToolAPI(scope: scope).read(Season.self, tool: "scouting", publicPath: "/the-paint/scouting", query: [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue),
            ])
            guard value.season == board.sampleSeason else { throw URLError(.cannotParseResponse) }
            guard !Task.isCancelled else { return }
            season = value
            failed = false
        } catch { if !Task.isCancelled { season = nil; failed = true } }
    }
}

struct CourtTrackingView: View {
    private struct DataSet: Decodable {
        struct Field: Decodable, Identifiable {
            let key: String
            let label: String
            let percentage: Bool
            let group: String
            var id: String { key }
            var lowerIsBetter: Bool { key == "defensive_rating" || key == "estimated_defensive_rating" }
        }
        struct Row: Decodable {
            let playerId: Int
            let teamId: Int
            let gameId: Int
            let values: [String: Double?]
        }
        let gameId: Int
        let rows: [Row]
        let seasons: [Int]
        let fields: [String]
        let fieldDefinitions: [Field]?
        let complete: Bool
        let stale: Bool
    }

    private enum Venue: String, CaseIterable {
        case all = "All venues", home = "Home", away = "Away"

        func accepts(_ log: CourtBoard.PlayerLog) -> Bool {
            if self == .all { return true }
            guard let team = log.team?.id else { return false }
            return team == (self == .home ? log.game.homeTeamId : log.game.visitorTeamId)
        }
    }

    private struct Observation: Identifiable {
        let log: CourtBoard.PlayerLog
        let value: Double?
        var id: Int { log.game.id }
    }

    private struct Sample {
        let observations: [Observation]
        var known: Int { observations.compactMap(\.value).count }
        var average: Double? { mean(observations.compactMap(\.value)) }
    }

    private struct PlayerRow: Identifiable {
        let player: CourtBoard.Player
        let samples: [Int: Sample]
        let change: Double?
        var id: Int { player.id }
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let revision: Int
    var linkedPlayerID: Int?
    var linkedMetric: String?
    var onMetricChange: ((String) -> Void)?
    @Environment(\.colorScheme) private var scheme
    @State private var data: DataSet?
    @State private var error: (any Error)?
    @State private var retry = 0
    @State private var group = ""
    @State private var chosenMetric: String?
    @State private var venue = Venue.all
    @State private var window = 10
    @State private var ascending = false
    @State private var player: PlayerRow?

    private var metric: String { chosenMetric ?? linkedMetric ?? "usage_percentage" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let data {
                let fields = data.fieldDefinitions ?? data.fields.map { .init(key: $0,
                    label: $0.replacingOccurrences(of: "_", with: " ").capitalized,
                    percentage: $0.contains("percentage") || $0.split(separator: "_").contains("pct"), group: "Tracking") }
                if let field = fields.first(where: { $0.key == metric }) ?? fields.first {
                    controls(fields, field: field)
                    if !data.complete || data.stale {
                        Label(data.stale ? "Last available tracking" : "Partial tracking history", systemImage: "clock")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    let rows = makeRows(data, field: field)
                    if let linkedPlayerID, let selected = rows.first(where: { $0.id == linkedPlayerID }) {
                        trackingSummary(selected, field: field)
                        trackingGames(selected, field: field)
                    } else {
                        LazyVStack(spacing: 8) { ForEach(rows) { row($0, field: field) } }
                            .sheet(item: $player) { row in detail(row, field: field) }
                    }
                } else {
                    ContentUnavailableView("No tracking observations for this matchup", systemImage: "waveform.path")
                }
            } else {
                ResearchToolMessage(title: "Game tracking unavailable", error: error) { retry += 1 }
            }
        }
        .task(id: "\(board.game.id):\(board.oddsMode.rawValue):\(board.observationID ?? ""):\(revision):\(retry)") {
            await load()
        }
        .onChange(of: chosenMetric) { _, value in
            if let value { onMetricChange?(value) }
        }
    }

    private func controls(_ fields: [DataSet.Field], field: DataSet.Field) -> some View {
        let groups = Array(Set(fields.map(\.group))).sorted()
        let visible = fields.filter { group.isEmpty || $0.group == group }
        return VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchArtworkPicker(title: "Metric", options: visible.sorted { $0.label < $1.label }.map {
                        .init(id: $0.key, title: $0.label, icon: "chart.bar")
                    }, selection: Binding(get: { field.key }, set: { chosenMetric = $0 }))
                    ResearchToolFilter(title: "Category", selection: group.isEmpty ? "All metrics" : group) {
                        Picker("Metric category", selection: $group) {
                            Text("All metrics").tag("")
                            ForEach(groups, id: \.self) { Text($0).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Venue", selection: venue.rawValue) {
                        Picker("Venue", selection: $venue) { ForEach(Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                    }
                    Button(ascending ? "Ascending" : "Descending", systemImage: ascending ? "arrow.up" : "arrow.down") {
                        ascending.toggle()
                    }.buttonStyle(.bordered)
                }.padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            Picker("Tracking sample", selection: $window) {
                ForEach([5, 10, 20], id: \.self) { Text("L\($0)").tag($0) }
            }.pickerStyle(.segmented)
        }
        .onChange(of: group) {
            if !fields.contains(where: { $0.key == metric && (group.isEmpty || $0.group == group) }) {
                chosenMetric = fields.first { $0.group == group }?.key ?? field.key
            }
        }
    }

    private func makeRows(_ data: DataSet, field: DataSet.Field) -> [PlayerRow] {
        let rows = Dictionary(grouping: data.rows, by: \.playerId)
        return board.players.filter { linkedPlayerID == nil || $0.id == linkedPlayerID }.map { player in
            let records = Dictionary((rows[player.id] ?? []).map { ($0.gameId, $0) }, uniquingKeysWith: { first, _ in first })
            let logs = CourtPlayerMarket.points.history(player, board: board).filter(venue.accepts)
            let observations = logs.prefix(20).map { log in
                let row = records[log.game.id]
                return Observation(log: log, value: row?.teamId == log.team?.id ? row?.values[field.key] ?? nil : nil)
            }
            let samples = Dictionary(uniqueKeysWithValues: [5, 10, 20].map { ($0, Sample(observations: Array(observations.prefix($0)))) })
            let first = observations.prefix(5).compactMap(\.value), prior = observations.dropFirst(5).prefix(5).compactMap(\.value)
            let change = first.count == 5 && prior.count == 5 ? (mean(first) ?? 0) - (mean(prior) ?? 0) : nil
            return PlayerRow(player: player, samples: samples, change: change)
        }.sorted {
            let left = $0.samples[window]?.average, right = $1.samples[window]?.average
            if let left, let right, left != right { return ascending ? left < right : left > right }
            if (left == nil) != (right == nil) { return left != nil }
            return $0.player.id < $1.player.id
        }
    }

    private func row(_ row: PlayerRow, field: DataSet.Field) -> some View {
        let team = row.player.team
        return ResearchToolCard(color: CourtTeamColors.colors(for: team.abbreviation).primary) {
            Button {
                player = row
            } label: {
                HStack {
                    CourtPlayerIdentity(player: row.player)
                    Spacer()
                    if let change = row.change {
                        Text(format(change, field: field, change: true))
                            .font(.caption.weight(.bold)).foregroundStyle(Brand.signal(field.lowerIsBetter ? -change : change, for: scheme))
                    }
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
                }.contentShape(.rect)
            }.buttonStyle(SlipSurgePressStyle())
        } content: {
            ResearchToolValues(items: [5, 10, 20].map { count in
                let sample = row.samples[count]
                return .init(label: "L\(count) · \(sample?.known ?? 0)/\(sample?.observations.count ?? 0)",
                    text: format(sample?.average, field: field))
            })
        }
    }

    private func detail(_ row: PlayerRow, field: DataSet.Field) -> some View {
        NavigationStack {
            List {
                Section {
                    CourtPlayerIdentity(player: row.player)
                    trackingSummary(row, field: field)
                }
                Section("Recorded games") {
                    trackingGames(row, field: field)
                }
            }
            .navigationTitle(field.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { player = nil } } }
        }
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private func trackingSummary(_ row: PlayerRow, field: DataSet.Field) -> some View {
        let sample = row.samples[window]
        let observations = sample?.observations ?? []
        ResearchToolValues(items: [
            .init(label: "L\(window) average", text: format(sample?.average, field: field)),
            .init(label: "Known games", text: "\(sample?.known ?? 0)/\(observations.count)"),
            .init(label: "L5 change", text: format(row.change, field: field, change: true),
                tone: Brand.signal(row.change.map { field.lowerIsBetter ? -$0 : $0 }, for: scheme)),
        ])
        if sample?.known ?? 0 > 0 {
            Chart(Array(observations.reversed().enumerated()), id: \.element.id) { index, item in
                if let value = item.value {
                    BarMark(x: .value("Game", index + 1), y: .value(field.label, field.percentage ? value * 100 : value))
                        .foregroundStyle(Brand.accent(for: scheme))
                        .accessibilityLabel(String(item.log.game.date.prefix(10)))
                        .accessibilityValue(format(value, field: field))
                }
            }
            .chartXScale(domain: 0...max(2, observations.count + 1))
            .frame(height: 120)
        }
    }

    private func trackingGames(_ row: PlayerRow, field: DataSet.Field) -> some View {
        ForEach(row.samples[window]?.observations ?? []) { observation in
            HStack {
                Text(String(observation.log.game.date.prefix(10)))
                Spacer()
                Text(format(observation.value, field: field)).fontWeight(.semibold).monospacedDigit()
            }
        }
    }

    private func format(_ value: Double?, field: DataSet.Field, change: Bool = false) -> String {
        let amount = value.map { $0 * (field.percentage ? 100 : 1) }
        let suffix = field.percentage ? (change ? " pp" : "%") : ""
        return change ? ResearchFormat.signedDecimal(amount, suffix: suffix) : ResearchFormat.decimal(amount, suffix: suffix)
    }

    private func load() async {
        do {
            let value = try await CourtToolAPI(scope: scope).read(DataSet.self, tool: "tracking", publicPath: "/the-paint/tracking", query: [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue),
            ])
            guard value.gameId == board.game.id, value.seasons.allSatisfy({ $0 == board.sampleSeason }) else {
                throw URLError(.cannotParseResponse)
            }
            guard !Task.isCancelled else { return }
            data = value
            error = nil
        } catch { if !Task.isCancelled { data = nil; self.error = error } }
    }
}

private func mean(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    return values.reduce(0, +) / Double(values.count)
}
