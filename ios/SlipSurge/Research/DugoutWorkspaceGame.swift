import SwiftUI

struct DugoutWorkspaceGame: View {
    enum Panel: String, CaseIterable {
        case field, matchup, markets

        var label: String {
            switch self { case .field: "Player Field"; case .matchup: "Matchup Lab"; case .markets: "Market Receipt" }
        }
        var icon: String {
            switch self { case .field: "person.2"; case .matchup: "scope"; case .markets: "chart.line.uptrend.xyaxis" }
        }
    }

    private enum Sort: String, CaseIterable {
        case mechanics = "Mechanics index", shape = "HR contact shape", trajectory = "Trajectory", plane = "Plane match"
        case mismatch = "MM, lowest first", first = "First HR movement", homeRun = "HR movement", picks = "Public HR picks"
    }

    private struct ModelRequest: Equatable {
        let window: DugoutWindow
        let revision: Int
    }

    typealias Player = DugoutWorkspaceMechanics.Player
    let api: DugoutAPI
    let day: String
    let game: DugoutBoard.Game
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var panel: Panel
    @State private var playerID: Int?
    @State private var window = DugoutWindow.l5
    @State private var sort = Sort.mechanics
    @State private var team = "all"
    @State private var showCandidates = false
    @State private var query = ""
    @State private var revision = 0
    @State private var model: (ModelRequest, DugoutWorkspaceMechanics?)?
    @State private var modelFailure: (ModelRequest, any Error)?
    @State private var history: DugoutOddsHistory?
    @State private var historyFailed = false

    init(api: DugoutAPI, day: String, game: DugoutBoard.Game, initialPanel: Panel? = nil, initialPlayer: Int? = nil) {
        self.api = api
        self.day = day
        self.game = game
        _panel = State(initialValue: initialPanel ?? .field)
        _playerID = State(initialValue: initialPlayer)
    }

    private var request: ModelRequest { .init(window: window, revision: revision) }
    private var players: [Player] { model?.0 == request ? (model?.1?.players ?? []) : [] }
    private var batters: [Int: DugoutBoard.Batter] {
        Dictionary(game.batters.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }
    private var confirmed: Bool { game.awayLineupConfirmed && game.homeLineupConfirmed }
    private var matchupAPI: DugoutSlateBreakdownAPI { .init(account: api.account, userID: api.userID) }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            ResearchToolRail(title: "Research workspace", choices: Panel.allCases, selection: $panel, label: \.label, glyph: \.icon, compact: true)
            switch panel {
            case .field: playerField
            case .matchup:
                DugoutSlateMatchup(api: matchupAPI, date: day, mode: .pregame,
                    game: .init(id: game.id, key: game.key, startsAt: game.startsAt, status: game.status, locked: game.locked,
                        away: game.away, home: game.home), workspaceBatter: $playerID, workspaceWindow: window.gameCount)
            case .markets: marketReceipt
            }
        }
        .task(id: request) { await loadMechanics(request) }
        .task { await loadHistory() }
        .sensoryFeedback(.selection, trigger: playerID)
    }

    @ViewBuilder private var playerField: some View {
        ResearchToolRail(title: "Mechanics and MM sample", choices: DugoutWindow.form, selection: $window, label: \.title,
            glyph: { window in
                switch window {
                case .l1: "1.circle"
                case .l3: "3.circle"
                case .l5: "5.circle"
                case .l10: "10.circle"
                case .season: "calendar"
                }
            }, compact: true)
        if let loaded = model, loaded.0 == request {
            if let details = loaded.1, !details.players.isEmpty {
                leaders
                board
                if let selected = players.first(where: { $0.id == playerID }) { mechanicsDetail(selected) }
            } else {
                ContentUnavailableView("Pregame mechanics unavailable", systemImage: "clock.badge.exclamationmark",
                    description: Text("No verified mechanics sample was saved for this game and window."))
            }
        } else {
            ResearchToolMessage(title: "Mechanics couldn’t load", error: modelFailure.flatMap { $0.0 == request ? $0.1 : nil }) { revision += 1 }
        }
    }

    private var leaders: some View {
        let pool = players.filter { !confirmed || $0.lineupStatus != "candidate" }
        let ranked = pool.sorted { $0.contactShape == $1.contactShape ? $0.scores.overall > $1.scores.overall : $0.contactShape > $1.contactShape }
        let plane = pool.max { $0.scores.planeMatch < $1.scores.planeMatch }?.id
        let trajectory = pool.max { $0.scores.trajectory < $1.scores.trajectory }?.id
        let featured = Set(ranked.prefix(4).map(\.id) + [plane, trajectory].compactMap { $0 })
        return ResearchToolCard(color: game.home.color) {
            ResearchSectionTitle(title: "HR Contact Shape")
        } content: {
            ForEach(ranked.filter { featured.contains($0.id) }) { player in
                Button { select(player.id) } label: {
                    HStack(spacing: 8) {
                        identity(player)
                        Spacer(minLength: 2)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(ResearchFormat.decimal(player.contactShape)).font(.headline.monospacedDigit())
                            if player.id == plane { Text("Plane leader").font(.caption2).foregroundStyle(.secondary) }
                            if player.id == trajectory { Text("Trajectory leader").font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityAddTraits(player.id == playerID ? .isSelected : [])
            }
        }
    }

    private var board: some View {
        let entries = batters
        let visible = players.filter {
            (team == "all" || team == $0.team) && (!confirmed || showCandidates || $0.lineupStatus != "candidate") &&
            (query.isEmpty || $0.playerName.localizedStandardContains(query))
        }.sorted { lhs, rhs in
            let left = sortValue(lhs, batter: entries[lhs.id]), right = sortValue(rhs, batter: entries[rhs.id])
            return left == right ? lhs.rank < rhs.rank : left > right
        }
        return ResearchToolCard(color: game.away.color) {
            ResearchSectionTitle(title: "Player Field")
        } content: {
            TextField("Find a player", text: $query).textFieldStyle(.roundedBorder).autocorrectionDisabled()
            ResearchArtworkPicker(title: "Team", options: [.init(id: "all", title: "Both teams", icon: "person.2")] +
                [game.away, game.home].map { .init(id: $0.code, title: $0.code, url: $0.logo, icon: "baseball") }, selection: $team)
            Picker("Sort by", selection: $sort) {
                ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            if confirmed { Toggle("Show candidates", isOn: $showCandidates).font(.subheadline) }
            if visible.isEmpty { Text("No players match these filters.").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(visible) { player in
                Button { select(player.id) } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        identity(player)
                        values(player, batter: entries[player.id])
                    }
                    .padding(8)
                    .background(teamFor(player).color.opacity(player.id == playerID ? 0.20 : 0.08), in: .rect(cornerRadius: 14))
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityAddTraits(player.id == playerID ? .isSelected : [])
            }
        }
    }

    private func values(_ player: Player, batter: DugoutBoard.Batter?) -> some View {
        let mismatch = batter?.mismatch(window)
        let first = quote(batter, market: "fhr")
        let home = quote(batter, market: "sa")
        return ResearchToolValues(items: [
            .init(label: "Mechanics", text: ResearchFormat.decimal(player.scores.overall)),
            .init(label: "Plane / Trajectory", text: "\(ResearchFormat.decimal(player.scores.planeMatch)) / \(ResearchFormat.decimal(player.scores.trajectory))"),
            .init(label: "MM", text: ResearchFormat.signed(mismatch), tone: mismatch.flatMap { dugoutTone(-Double($0), scheme: scheme) }),
            .init(label: "First HR", text: ResearchFormat.price(first?.price), tone: movement(first).flatMap { dugoutTone($0, scheme: scheme) }),
            .init(label: "Anytime HR", text: ResearchFormat.price(home?.price), tone: movement(home).flatMap { dugoutTone($0, scheme: scheme) }),
            .init(label: "Public HR", text: batter?.crowd?["home_runs"]?.count.formatted() ?? "—"),
            .init(label: "First HR vs Avg", text: percent(batter?.cost?.firstHomeRunVsSeason), tone: batter?.cost?.firstHomeRunVsSeason.flatMap { dugoutTone(-$0, scheme: scheme) }),
            .init(label: "HR vs Avg", text: percent(batter?.cost?.homeRunVsSeason), tone: batter?.cost?.homeRunVsSeason.flatMap { dugoutTone(-$0, scheme: scheme) }),
            .init(label: "Book / Paper", text: "\(batter?.bookRanking(window)?.formatted() ?? "—") / \(batter?.paperRanking(window)?.formatted() ?? "—")"),
        ])
    }

    private func mechanicsDetail(_ player: Player) -> some View {
        let score = player.scores
        return ResearchToolCard(color: teamFor(player).color) {
            identity(player)
        } content: {
            ResearchToolValues(items: [
                .init(label: "Confidence", text: ResearchFormat.decimal(score.confidence)),
                .init(label: "Power formation", text: ResearchFormat.decimal(score.powerFormation)),
                .init(label: "Transfer efficiency", text: ResearchFormat.decimal(score.transferEfficiency)),
                .init(label: "Timing", text: ResearchFormat.decimal(score.timing)),
                .init(label: "Pitcher breakdown", text: ResearchFormat.decimal(score.pitcherBreakdown)),
                .init(label: "Trend", text: ResearchFormat.signedDecimal(score.trend), tone: dugoutTone(score.trend, scheme: scheme)),
            ])
            let metrics = [("batSpeed", "Bat speed", " mph"), ("attackAngle", "Attack angle", "°"), ("exitVelocity", "Exit velocity", " mph"),
                ("expectedExitVelocity", "Expected EV", " mph"), ("modeledCarry", "Modeled carry", " ft"), ("recentHomeRuns", "Recent HR", "")]
            ResearchToolValues(items: metrics.map { key, label, unit in
                .init(label: label, text: ResearchFormat.decimal(player.metrics?[key]?.number, suffix: unit))
            })
            ForEach(Array(player.reasons.enumerated()), id: \.offset) { _, reason in Label(reason, systemImage: "checkmark.circle").font(.caption) }
            ForEach(Array(player.cautions.enumerated()), id: \.offset) { _, caution in Label(caution, systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.secondary) }
            Button("Market receipt", systemImage: "chart.line.uptrend.xyaxis") { panel = .markets }.buttonStyle(.bordered)
            Button("Matchup Lab", systemImage: "scope") { panel = .matchup }.buttonStyle(.bordered)
        }
    }

    @ViewBuilder private var marketReceipt: some View {
        let options = playerOptions
        if !options.isEmpty {
            ResearchArtworkPicker(title: "Player", options: options, selection: Binding(get: { playerID.map(String.init) ?? options[0].id },
                set: { playerID = Int($0) }))
        }
        if let id = playerID ?? options.first.flatMap({ Int($0.id) }) {
            DugoutWorkspaceMarkets(game: game, playerID: id, batter: batters[id], history: history, historyFailed: historyFailed,
                retry: { Task { await loadHistory() } })
        } else {
            ContentUnavailableView("No archived players", systemImage: "person.crop.circle.badge.exclamationmark")
        }
    }

    private var playerOptions: [ResearchArtworkPicker.Option] {
        var entries = game.batters.map { batter in
            ResearchArtworkPicker.Option(id: String(batter.id), title: batter.name, url: batter.headshot, icon: "person")
        }
        let ids = Set(entries.map(\.id))
        entries += players.filter { !ids.contains(String($0.id)) }.map { player in
            .init(id: String(player.id), title: player.playerName, url: portrait(player.id), icon: "person")
        }
        return entries.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    private func teamFor(_ player: Player) -> DugoutBoard.Team { player.team == game.home.code ? game.home : game.away }

    private func portrait(_ id: Int) -> URL? {
        URL(string: "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_426,q_auto:best/v1/people/\(id)/headshot/silo/current")
    }

    private func identity(_ player: Player) -> some View {
        let team = teamFor(player)
        return DugoutOpponentArtwork(name: player.playerName, subtitle: "\(team.code) · \(player.position) · \(player.lineupStatus.capitalized)",
            headshot: portrait(player.id), logo: team.logo)
    }

    private func quote(_ batter: DugoutBoard.Batter?, market: String) -> DugoutBoard.Market.Quote? {
        if let series = history?.series.first(where: { $0.playerId == batter?.id && $0.market == market && $0.book == "fanduel" }) {
            return .init(book: series.book, price: series.latest?.odds, opening: series.opening?.odds, line: series.line)
        }
        return batter?.markets.first { $0.key == market }?.quotes.first { $0.book == "fanduel" }
    }

    private func movement(_ quote: DugoutBoard.Market.Quote?) -> Double? {
        guard let opening = quote?.opening, let latest = quote?.price else { return nil }
        func implied(_ odds: Int) -> Double {
            let price = Double(odds)
            return price > 0 ? 100 / (price + 100) : -price / (-price + 100)
        }
        return (implied(latest) - implied(opening)) * 100
    }

    private func percent(_ amount: Double?) -> String { ResearchFormat.signedDecimal(amount.map { $0 * 100 }, suffix: "%") }

    private func sortValue(_ player: Player, batter: DugoutBoard.Batter?) -> Double {
        switch sort {
        case .mechanics: player.scores.overall
        case .shape: player.contactShape
        case .trajectory: player.scores.trajectory
        case .plane: player.scores.planeMatch
        case .mismatch: batter?.mismatch(window).map { -Double($0) } ?? -.infinity
        case .first: movement(quote(batter, market: "fhr")) ?? -.infinity
        case .homeRun: movement(quote(batter, market: "sa")) ?? -.infinity
        case .picks: Double(batter?.crowd?["home_runs"]?.count ?? 0)
        }
    }

    private func select(_ id: Int) { withAnimation(reduceMotion ? nil : .snappy(duration: 0.21)) { playerID = id } }

    private func loadMechanics(_ requested: ModelRequest) async {
        modelFailure = nil
        do {
            let result = try await api.workspaceMechanics(date: day, game: game.id, window: requested.window)
            try Task.checkCancellation()
            guard request == requested else { return }
            model = (requested, result)
            if playerID == nil { playerID = result?.players.first?.id }
        } catch {
            if !Task.isCancelled, request == requested { modelFailure = (requested, error) }
        }
    }

    private func loadHistory() async {
        historyFailed = false
        do {
            let result = try await api.oddsHistory(date: day, game: game.id)
            try Task.checkCancellation()
            history = result
        } catch {
            if !Task.isCancelled { historyFailed = true }
        }
    }
}
