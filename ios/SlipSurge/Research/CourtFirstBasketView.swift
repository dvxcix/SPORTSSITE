import SwiftUI

struct CourtFirstBasketView: View {
    private enum Page: String, CaseIterable { case odds = "Odds", history = "History" }
    private struct OddsObservation {
        let payload: CourtFirstBasketOdds
        let requestUptime: TimeInterval
    }

    private struct Play: Identifiable {
        let game: CourtBoard.Game
        let selection: TrackedPickAPI.Leg
        var id: String { selection.id }
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let reload: Int
    var explicitBook: String?
    var linkedBooks: [String]?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.memberResearchPreferences) private var preferences
    @State private var page = Page.odds
    @State private var book: String?
    @State private var market: String?
    @State private var odds: OddsObservation?
    @State private var history: CourtFirstBasketHistory?
    @State private var oddsError: (any Error)?
    @State private var historyError: (any Error)?
    @State private var retry = 0
    @State private var play: Play?

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
        .sheet(item: $play) { selected in
            NavigationStack {
                if case .member(let account, let userID) = scope {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(selected.selection.player_name).font(.title2.weight(.bold))
                        Text(selected.selection.line).font(.headline)
                        ResearchToolBook(book: selected.selection.book, price: selected.selection.odds)
                        CourtMarketActions(account: account, userID: userID, game: selected.game, selection: selected.selection)
                    }
                    .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                    .navigationTitle("First Basket")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { play = nil } } }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private var oddsBody: some View {
        if let odds, odds.payload.mode == board.oddsMode, odds.payload.requestedDate == board.game.date {
            TimelineView(.periodic(from: .now, by: 5)) { _ in
                let rows = currentRows(odds)
                let markets = Set(rows.map(\.offer.propType)).sorted()
                let books = Set(rows.map(\.offer.vendor)).sorted()
                let preferred = preferredBooks(in: books)
                let initialSelection = linkedBooks?.isEmpty == false && explicitBook == "all"
                    ? "preferred" : explicitBook ?? (preferred.isEmpty ? "all" : "preferred")
                let selection = book ?? initialSelection
                let visible = rows.filter { row in
                    let vendor = row.offer.vendor
                    let matchesBook = selection == "all" || selection == "preferred" && preferred.contains(vendor) ||
                        Sportsbook.normalized(vendor) == Sportsbook.normalized(selection)
                    return matchesBook && (market == nil || row.offer.propType == market)
                }
                HStack {
                    ResearchToolFilter(title: "Market", symbol: "ticket", selection: market.map(marketLabel) ?? "All markets") {
                        Picker("Market", selection: $market) {
                            Text("All markets").tag(nil as String?)
                            ForEach(markets, id: \.self) { Text(marketLabel($0)).tag(Optional($0)) }
                        }
                    }
                    Spacer(minLength: 0)
                    ResearchArtworkPicker(title: "Sportsbook",
                        options: bookOptions(books, preferred: preferred),
                        selection: Binding(get: { selection }, set: { book = $0 }))
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
                                if case .member = scope, board.oddsMode == .pregame, !board.isFrozen,
                                   let tip = board.tip, tip > .now, let line = Double(row.offer.lineValue), line == 0.5 {
                                    HStack(spacing: 7) {
                                        playButton(row, line: line, side: .over)
                                        playButton(row, line: line, side: .under)
                                    }
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

    @ViewBuilder private func playButton(_ row: CourtFirstBasketOdds.Row, line: Double, side: CourtPlayerMarket.Side) -> some View {
        if row.offer.market.type == "over_under", let price = row.offer.price(side) {
            Button {
                let selection = TrackedPickAPI.Leg.court(game: row.game, playerID: row.player.id, name: row.player.name,
                    team: row.player.team, headshot: row.player.headshot, position: row.player.position,
                    market: row.offer.propType, label: marketLabel(row.offer.propType), line: line,
                    side: side == .under ? .under : .over, book: row.offer.vendor, odds: price)
                play = .init(game: row.game, selection: selection)
            } label: {
                Label("\(side == .under ? "No" : "Yes") \(ResearchFormat.price(price))",
                    systemImage: side == .under ? "minus.circle" : "plus.circle").monospacedDigit()
            }
            .buttonStyle(.bordered)
        }
    }

    private func preferredBooks(in books: [String]) -> [String] {
        if let linkedBooks {
            return books.filter { book in
                linkedBooks.contains { $0 == book || Sportsbook.normalized($0) == Sportsbook.normalized(book) }
            }
        }
        guard case .member(_, let userID) = scope,
              let wanted = preferences?.read(for: userID)?.preferences.books else { return [] }
        return books.filter { wanted.contains(Sportsbook.normalized($0)) }
    }

    private func bookOptions(_ books: [String], preferred: [String]) -> [ResearchArtworkPicker.Option] {
        var items = [ResearchArtworkPicker.Option(id: "all", title: "All books", icon: "books.vertical")]
        if let first = preferred.first {
            let logo = ResearchArtworkPicker.Option.sportsbook(first)
            items.append(.init(id: "preferred", title: "Preferred books", asset: logo.asset,
                url: logo.url, icon: "books.vertical"))
        }
        if let explicitBook, explicitBook != "all", !books.contains(explicitBook) {
            items.append(.sportsbook(explicitBook))
        }
        return items + books.map(ResearchArtworkPicker.Option.sportsbook)
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
