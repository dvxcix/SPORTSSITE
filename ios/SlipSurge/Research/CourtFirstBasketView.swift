import SwiftUI

struct CourtFirstBasketView: View {
    private enum Page: String, CaseIterable { case odds = "Odds", history = "History" }
    private struct OddsObservation {
        let payload: CourtFirstBasketOdds
        let requestUptime: TimeInterval
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let reload: Int
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page = Page.odds
    @State private var book = "all"
    @State private var market: String?
    @State private var odds: OddsObservation?
    @State private var history: CourtFirstBasketHistory?
    @State private var oddsError: (any Error)?
    @State private var historyError: (any Error)?
    @State private var retry = 0

    private var identity: String { "\(board.game.id):\(board.oddsMode.rawValue):\(reload):\(retry)" }
    private var teams: [CourtBoard.Team] { [board.game.visitorTeam, board.game.homeTeam] }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ResearchToolRail(title: "First Basket", choices: Page.allCases, selection: $page, label: \.rawValue) {
                $0 == .odds ? "chart.line.uptrend.xyaxis" : "clock.arrow.circlepath"
            }
            if page == .odds {
                oddsBody
            } else {
                historyBody
            }
        }
        .task(id: identity) {
            odds = nil
            oddsError = nil
            await loadOdds()
        }
        .task(id: identity) {
            history = nil
            historyError = nil
            await loadHistory()
        }
    }

    @ViewBuilder
    private var oddsBody: some View {
        if let odds, odds.payload.mode == board.oddsMode, odds.payload.requestedDate == board.game.date {
            TimelineView(.periodic(from: .now, by: 5)) { _ in
                let rows = currentRows(odds)
                let markets = Set(rows.map(\.offer.propType)).sorted()
                let books = Set(rows.map(\.offer.vendor)).sorted()
                let visible = rows.filter { (book == "all" || $0.offer.vendor == book) && (market == nil || $0.offer.propType == market) }
                HStack {
                    ResearchToolFilter(title: "Market", selection: market.map(marketLabel) ?? "All markets") {
                        Picker("Market", selection: $market) {
                            Text("All markets").tag(nil as String?)
                            ForEach(markets, id: \.self) { Text(marketLabel($0)).tag(Optional($0)) }
                        }
                    }
                    Spacer(minLength: 0)
                    ResearchArtworkPicker(title: "Sportsbook",
                        options: [.init(id: "all", title: "All books", icon: "books.vertical")] + books.map(ResearchArtworkPicker.Option.sportsbook),
                        selection: $book)
                }
                if odds.payload.status == "partial" || odds.payload.status == "connection_unavailable" {
                    Label("Some sportsbook prices are unavailable.", systemImage: "info.circle")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if visible.isEmpty {
                    ContentUnavailableView("No prices for this selection", systemImage: "basketball")
                } else {
                    LazyVStack(spacing: 9) {
                        ForEach(visible) { row in
                            let colors = CourtTeamColors.colors(for: row.player.team.abbreviation)
                            ResearchToolCard(color: colors.primary) {
                                playerHeader(row.player, detail: marketLabel(row.offer.propType))
                            } content: {
                                HStack {
                                    ResearchToolBook(book: row.offer.vendor, price: row.offer.price(.over))
                                    Spacer()
                                    if let movement = row.movement?.change, movement != 0 {
                                        Label(ResearchFormat.points(movement), systemImage: movement > 0 ? "arrow.up.right" : "arrow.down.right")
                                            .font(.caption.weight(.semibold))
                                            .accessibilityLabel("Change in implied probability, \(ResearchFormat.points(movement))")
                                    }
                                }
                                if let prior = row.movement?.previousOdds {
                                    Text("Previous \(ResearchFormat.price(prior))").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        } else {
            ResearchToolMessage(title: "First Basket odds couldn’t load", error: oddsError) { retry += 1 }
        }
    }

    @ViewBuilder
    private var historyBody: some View {
        if let history, history.mode == board.oddsMode {
            Text("\(history.coveredGames) of \(history.requestedGames) games covered")
                .font(.caption).foregroundStyle(.secondary)
            if history.stale == true {
                Label("Showing the last saved history.", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
            }
            if history.rows.isEmpty {
                ContentUnavailableView("First Basket history unavailable", systemImage: "clock")
            }
            ForEach(teams, id: \.id) { team in
                let colors = CourtTeamColors.colors(for: team.abbreviation)
                let tip = history.teams.first { $0.teamId == team.id }
                let players = board.players.filter { $0.team.id == team.id }
                let samples = Dictionary(history.rows.map { ($0.playerId, $0) }, uniquingKeysWith: { first, _ in first })
                ResearchToolCard(color: colors.primary) {
                    Label {
                        Text(team.fullName).font(.headline)
                    } icon: {
                        ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 29, height: 29)
                    }
                } content: {
                    if let tip {
                        ResearchToolValues(items: [.init(label: "Opening tips won", text: "\(tip.tipWins)/\(tip.tips)")])
                    }
                }
                LazyVStack(spacing: 9) {
                    ForEach(players.filter { samples[$0.id] != nil }) { player in
                        if let sample = samples[player.id] {
                            ResearchToolCard(color: colors.primary) {
                                ResearchToolPortrait(name: "\(player.firstName) \(player.lastName)",
                                    subtitle: [player.team.abbreviation, player.position].compactMap { $0 }.joined(separator: " · "),
                                    portraits: player.headshot.map { [$0] } ?? [], teamLogo: team.logo,
                                    primary: colors.primary, secondary: colors.secondary)
                            } content: {
                                ResearchToolValues(items: [
                                    .init(label: "First field goal", text: String(sample.firstFieldGoals), tone: Brand.accent(for: scheme)),
                                    .init(label: "First score", text: String(sample.firstScores)),
                                    .init(label: "First attempt", text: String(sample.firstAttempts)),
                                    .init(label: "Team’s first field goal", text: String(sample.teamFirstFieldGoals)),
                                    .init(label: "Games", text: String(sample.games)),
                                ])
                            }
                        }
                    }
                }
            }
        } else {
            ResearchToolMessage(title: "First Basket history couldn’t load", error: historyError) { retry += 1 }
        }
    }

    private func playerHeader(_ player: CourtToolPlayer, detail: String) -> some View {
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        return ResearchToolPortrait(name: player.name, subtitle: "\(player.team.abbreviation) · \(detail)",
            portraits: player.headshot.map { [$0] } ?? [], teamLogo: player.team.logo,
            primary: colors.primary, secondary: colors.secondary)
    }

    private func marketLabel(_ value: String) -> String {
        switch value {
        case "first_basket", "first_field_goal": "First Basket"
        case "first_score": "First Score"
        case "team_first_basket", "team_first_field_goal": "Team First Basket"
        default: value.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func currentRows(_ odds: OddsObservation) -> [CourtFirstBasketOdds.Row] {
        let elapsed = ProcessInfo.processInfo.systemUptime - odds.requestUptime
        guard elapsed >= 0, let serverTime = SidelineBoard.timestamp(odds.payload.fetchedAt) else { return [] }
        let now = serverTime.addingTimeInterval(elapsed)
        let frozen = odds.payload.frozenGameIds.contains(board.game.id)
        return odds.payload.rows.filter { $0.game.id == board.game.id && $0.game.date == board.game.date
            && $0.isVisible(mode: board.oddsMode, now: now, frozen: frozen) }
    }

    private func loadOdds() async {
        let started = ProcessInfo.processInfo.systemUptime
        do {
            let result = try await CourtToolAPI(scope: scope).read(CourtFirstBasketOdds.self, tool: "first-basket-odds",
                publicPath: "/the-paint/first-basket/odds", query: [
                    .init(name: "date", value: board.game.date),
                    .init(name: "game", value: String(board.game.id)),
                    .init(name: "mode", value: board.oddsMode.rawValue)
                ])
            guard !Task.isCancelled else { return }
            guard result.mode == board.oddsMode, result.requestedDate == board.game.date, result.date == board.game.date else {
                throw URLError(.cannotParseResponse)
            }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { odds = .init(payload: result, requestUptime: started) }
        } catch {
            if !Task.isCancelled { oddsError = error }
        }
    }

    private func loadHistory() async {
        do {
            let result = try await CourtToolAPI(scope: scope).read(CourtFirstBasketHistory.self, tool: "first-basket",
                publicPath: "/the-paint/first-basket", query: [
                    .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue)
                ])
            guard !Task.isCancelled else { return }
            guard result.mode == board.oddsMode else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { history = result }
        } catch {
            if !Task.isCancelled { historyError = error }
        }
    }
}
