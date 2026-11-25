import SwiftUI

struct DugoutView: View {
    private enum Tool: Hashable { case weather, spray, pitcher, publicPicks, batterCost }
    private enum Board: String, CaseIterable {
        case lineup = "Lineups", mismatch = "MM", odds = "Odds Board", matrices = "Matrix Matches"

        var glyph: String {
            switch self {
            case .lineup: "list.bullet"
            case .mismatch: "chart.bar.xaxis"
            case .odds: "chart.line.uptrend.xyaxis"
            case .matrices: "square.grid.3x3"
            }
        }
    }

    private struct Load: Equatable {
        let date: String
        let mode: DugoutMode
        let revision: Int
    }

    private struct PlayerSelection: Identifiable {
        let player: DugoutBoard.Batter
        let game: DugoutBoard.Game
        var id: Int { player.id }
    }

    let api: DugoutAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var date = Date.now
    @State private var mode = DugoutMode.pregame
    @State private var board = Board.lineup
    @State private var window = DugoutWindow.l5
    @State private var selectedGameID: Int?
    @State private var teamFilter = ""
    @State private var market = "sa"
    @State private var book = "fanduel"
    @State private var search = ""
    @State private var revision = 0
    @State private var result: (Load, DugoutBoard)?
    @State private var failure: (Load, any Error)?
    @State private var playerSelection: PlayerSelection?
    @State private var comparisonIDs: Set<Int> = []
    @State private var showComparison = false
    @State private var tool: Tool?

    init(api: DugoutAPI, date: Date = .now, linkedGame: Int? = nil) {
        self.api = api
        _date = State(initialValue: date)
        _selectedGameID = State(initialValue: linkedGame)
    }

    private var request: Load { .init(date: SlateDate.key(date), mode: mode, revision: revision) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                ResearchSlateControls(date: $date)
                if let result, result.0 == request {
                    slate(result.1.games)
                } else {
                    ResearchToolMessage(title: "The Dugout couldn’t load",
                        error: failure.flatMap { $0.0 == request ? $0.1 : nil }) { revision += 1 }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("The Dugout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Dugout tools", systemImage: mode == .live ? "dot.radiowaves.left.and.right" : "square.grid.2x2") {
                    Button("Pitcher Report", systemImage: "gauge") { tool = .pitcher }
                    Button("The Public", systemImage: "person.2") { tool = .publicPicks }
                    Button("Batter Cost", systemImage: "chart.line.uptrend.xyaxis") { tool = .batterCost }
                    Button("Weather Lab", systemImage: "cloud.sun") { tool = .weather }
                    Button("Spray Charts", systemImage: "scope") { tool = .spray }
                    Divider()
                    Picker("Research mode", selection: $mode) {
                        Label("Pregame", systemImage: "clock").tag(DugoutMode.pregame)
                        Label("Live", systemImage: "dot.radiowaves.left.and.right").tag(DugoutMode.live)
                    }
                }
            }
        }
        .navigationDestination(item: $tool) { destination in
            let tools = DugoutToolsAPI(account: api.account, userID: api.userID)
            switch destination {
            case .weather: DugoutWeatherView(api: tools, date: date)
            case .spray: DugoutSprayView(api: tools, date: date)
            case .pitcher: DugoutPitcherReport(api: api, date: date)
            case .publicPicks: DugoutMarketSlateView(api: api, date: date, mode: .publicPicks)
            case .batterCost: DugoutMarketSlateView(api: api, date: date, mode: .cost)
            }
        }
        .task(id: request) { await load(request) }
        .refreshable { revision += 1 }
        .onChange(of: SlateDate.key(date)) {
            mode = .pregame
            selectGame(nil)
        }
        .sheet(item: $playerSelection) { selection in
            NavigationStack {
                DugoutPlayerView(player: selection.player, game: selection.game, window: window,
                    watchTarget: mode == .pregame ? api.watchTarget(date: date, game: selection.game.id, player: selection.player.id) : nil)
            }
                .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private func slate(_ games: [DugoutBoard.Game]) -> some View {
        if let selectedGameID, !games.contains(where: { $0.id == selectedGameID }) {
            ContentUnavailableView {
                Label("Matchup unavailable on this slate", systemImage: "calendar")
            } actions: {
                if !games.isEmpty { Button("Show this slate") { selectGame(nil) } }
            }
        } else if let game = games.first(where: { $0.id == selectedGameID }) ?? games.first {
            let matchupCounts = Dictionary(grouping: games) { [$0.away.code, $0.home.code] }.mapValues(\.count)
            ScrollView(.horizontal) {
                HStack(spacing: 9) {
                    ForEach(games) { candidate in
                        let doubleheader = (matchupCounts[[candidate.away.code, candidate.home.code]] ?? 0) > 1
                        let status = candidate.statusLabel(doubleheader: doubleheader)
                        Button {
                            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { selectGame(candidate.id) }
                        } label: {
                            ResearchMatchup(away: candidate.away.matchup, home: candidate.home.matchup,
                                subtitle: status, selected: candidate.id == game.id)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityLabel("\(candidate.away.name) at \(candidate.home.name)")
                        .accessibilityValue(status)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .sensoryFeedback(.selection, trigger: game.id)

            gameHeader(game, doubleheader: (matchupCounts[[game.away.code, game.home.code]] ?? 0) > 1)
            if game.locked {
                NavigationLink {
                    NativeMembershipOverview(account: api.account)
                } label: {
                    Label("Unlock this matchup with Ultimate", systemImage: "lock")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            } else {
                ResearchToolRail(title: "Dugout boards", choices: Board.allCases, selection: $board,
                    label: { $0.rawValue }, glyph: { $0.glyph })
                filters(game)
                if board == .lineup {
                    battingOrder(game.away, lineup: game.awayLineup, confirmed: game.awayLineupConfirmed, game: game)
                    battingOrder(game.home, lineup: game.homeLineup, confirmed: game.homeLineupConfirmed, game: game)
                } else {
                    rankedBoard(game)
                }
                if !comparisonIDs.isEmpty {
                    Button("Compare players (\(comparisonIDs.count))", systemImage: "rectangle.split.2x1") {
                        showComparison = true
                    }
                    .buttonStyle(SlipSurgePrimaryButtonStyle())
                    .sheet(isPresented: $showComparison) {
                        comparison(game)
                    }
                }
            }
        } else {
            ContentUnavailableView("No games on this date", systemImage: "calendar")
        }
    }

    private func gameHeader(_ game: DugoutBoard.Game, doubleheader: Bool) -> some View {
        ResearchToolCard(color: game.home.color) {
            HStack(alignment: .center, spacing: 12) {
                headlineTeam(game.away)
                VStack(spacing: 4) {
                    Text(game.statusLabel(doubleheader: doubleheader)).font(.caption.weight(.semibold))
                    if !game.venue.isEmpty { Text(game.venue).font(.caption2).foregroundStyle(.secondary) }
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                headlineTeam(game.home)
            }
        } content: {
            if mode == .live {
                Label("Live research", systemImage: "dot.radiowaves.left.and.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(.orange)
            } else if game.snapshot.unavailable == true {
                Label("Some pregame research is unavailable", systemImage: "clock.badge.exclamationmark")
                    .font(.caption.weight(.medium)).foregroundStyle(.secondary)
            } else if game.snapshot.frozen == true {
                Label("Pregame snapshot", systemImage: "clock.badge.checkmark")
                    .font(.caption.weight(.medium)).foregroundStyle(.secondary)
            }
            if let noHr = game.noHr, !game.locked {
                HStack {
                    Text("No Home Run").font(.caption.weight(.medium))
                    Spacer()
                    ResearchToolBook(book: "fanduel", price: noHr.fanduel)
                    if let opening = noHr.openingFanduel {
                        Text("Open \(ResearchFormat.price(opening))").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func headlineTeam(_ team: DugoutBoard.Team) -> some View {
        VStack(spacing: 4) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 34, height: 34)
            HStack(spacing: 5) {
                Text(team.code)
                if let score = team.score { Text("\(score)").fontWeight(.bold).monospacedDigit() }
            }.font(.caption.weight(.semibold))
        }
        .accessibilityLabel(team.name)
        .accessibilityValue(team.score.map(String.init) ?? "")
    }

    private func filters(_ game: DugoutBoard.Game) -> some View {
        let markets = game.batters.flatMap(\.markets)
        let marketOptions = markets.reduce(into: [String: String]()) { $0[$1.key] = $1.label }
        let books = Set(markets.flatMap(\.quotes).map { Sportsbook.normalized($0.book) }).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ResearchArtworkPicker(title: "Teams", options: [.init(id: "", title: "Both teams", icon: "person.2")] +
                        [game.away, game.home].map { .team(id: $0.code, title: $0.name, logo: $0.logo) }, selection: $teamFilter)
                    if board == .odds && !marketOptions.isEmpty {
                        ResearchArtworkPicker(title: "Market", options: marketOptions.sorted { $0.value < $1.value }.map {
                            .init(id: $0.key, title: $0.value, icon: "chart.bar")
                        }, selection: $market)
                        SportsbookPicker(books: books, selection: $book)
                    }
                    if board == .mismatch || board == .matrices {
                        ResearchToolFilter(title: "Recent form", selection: window.title) {
                            Picker("Recent form", selection: $window) {
                                ForEach(DugoutWindow.form, id: \.self) { Text($0.title).tag($0) }
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            .onChange(of: game.id, initial: true) {
                if marketOptions[market] == nil { market = marketOptions.keys.sorted().first ?? "sa" }
                if !books.contains(book) { book = books.first ?? "fanduel" }
            }
            TextField("Find a batter", text: $search)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        }
    }

    @ViewBuilder
    private func battingOrder(_ team: DugoutBoard.Team, lineup: [DugoutBoard.Batter], confirmed: Bool, game: DugoutBoard.Game) -> some View {
        if teamFilter.isEmpty || teamFilter == team.code {
            let players = lineup.filter(matches)
            HStack(spacing: 9) {
                ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                    .frame(width: 22, height: 22)
                ResearchSectionTitle(title: team.name)
                Spacer()
                if !lineup.isEmpty {
                    Text(confirmed ? "Confirmed" : "Projected")
                        .font(.caption.weight(.semibold)).foregroundStyle(confirmed ? Brand.accent(for: scheme) : .secondary)
                }
            }
            if let pitcher = team.code == game.home.code ? game.homePitcher : game.awayPitcher, search.isEmpty {
                NavigationLink {
                    DugoutPitcherReport(api: api, date: date, linkedStarter: "\(game.id):\(pitcher.id)")
                } label: {
                    HStack {
                        ResearchToolPortrait(name: pitcher.name, subtitle: pitcher.hand == "L" ? "Left-handed starter" : "Right-handed starter",
                            portraits: [pitcher.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                        Spacer()
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    .padding(11)
                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
                }
                .buttonStyle(SlipSurgePressStyle())
            }
            ForEach(players) { player in playerCard(player, game: game) }
            if players.isEmpty {
                Text(lineup.isEmpty ? "Lineup unavailable" : "No batters match your search")
                    .font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 10)
            }
        }
    }

    @ViewBuilder
    private func rankedBoard(_ game: DugoutBoard.Game) -> some View {
        let players = game.batters.filter(matches)
        let filtered = switch board {
        case .lineup: players
        case .mismatch:
            players.filter { $0.mismatch(window) != nil }.sorted { ($0.mismatch(window) ?? 0) > ($1.mismatch(window) ?? 0) }
        case .odds: players.filter { price($0) != nil }
        case .matrices: players.filter { !$0.matrixMatches.isEmpty }
        }
        if filtered.isEmpty {
            let title = switch board {
            case .lineup: "No batters found"
            case .mismatch: "MM unavailable for this window"
            case .odds: "No posted prices for these filters"
            case .matrices: "No Matrix matches"
            }
            ContentUnavailableView(title, systemImage: board.glyph)
        } else {
            ForEach(filtered) { player in playerCard(player, game: game) }
        }
    }

    private func playerCard(_ player: DugoutBoard.Batter, game: DugoutBoard.Game) -> some View {
        let team = game.team(for: player)
        let selected = comparisonIDs.contains(player.id)
        return ResearchToolCard(color: team.color) {
            HStack(spacing: 5) {
                Button {
                    playerSelection = .init(player: player, game: game)
                } label: {
                    HStack(spacing: 8) {
                        ResearchToolPortrait(name: player.name, subtitle: "\(player.order) · \(player.position) · \(team.code)",
                            portraits: [player.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                        Spacer()
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(SlipSurgePressStyle())
                Button {
                    if selected { comparisonIDs.remove(player.id) } else { comparisonIDs.insert(player.id) }
                } label: {
                    Image(systemName: selected ? "checkmark.circle.fill" : "plus.circle")
                        .font(.title3)
                        .foregroundStyle(selected ? Brand.accent(for: scheme) : .secondary)
                        .frame(width: 44, height: 44)
                }
                .disabled(!selected && comparisonIDs.count == 4)
                .accessibilityLabel(selected ? "Remove \(player.name) from comparison" : "Compare \(player.name)")
            }
        } content: {
            if board == .odds, let price = price(player) {
                DugoutQuoteRow(quote: price)
            } else if board == .mismatch || board == .lineup {
                DugoutRankValues(player: player, window: window)
            }
            if !player.matrixMatches.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(player.matrixMatches) { matrix in
                            Label(matrix.name, systemImage: "diamond.fill")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 8).padding(.vertical, 5)
                                .background((Color(hex: matrix.color) ?? Brand.accent(for: scheme)).opacity(0.15), in: .capsule)
                        }
                    }
                }.scrollIndicators(.hidden)
            }
        }
    }

    private func comparison(_ game: DugoutBoard.Game) -> some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(game.batters.filter { comparisonIDs.contains($0.id) }) { player in
                        let team = game.team(for: player)
                        ResearchToolCard(color: team.color) {
                            ResearchToolPortrait(name: player.name, subtitle: team.name, portraits: [player.headshot],
                                teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                        } content: {
                            DugoutRankValues(player: player, window: window)
                            DugoutMismatchTrend(player: player)
                        }
                    }
                }.padding()
            }
            .background(Brand.background(for: scheme))
            .navigationTitle("Player comparison")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showComparison = false } }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func matches(_ player: DugoutBoard.Batter) -> Bool {
        (teamFilter.isEmpty || teamFilter == player.team) && (search.isEmpty || player.name.localizedCaseInsensitiveContains(search))
    }

    private func price(_ player: DugoutBoard.Batter) -> DugoutBoard.Market.Quote? {
        player.markets.first { $0.key == market }?.quotes.first { Sportsbook.normalized($0.book) == book }
    }

    private func selectGame(_ id: Int?) {
        selectedGameID = id
        teamFilter = ""
        comparisonIDs.removeAll()
    }

    private func load(_ request: Load) async {
        do {
            let loaded = try await api.board(date: request.date, mode: request.mode)
            guard !Task.isCancelled, request == self.request else { return }
            result = (request, loaded)
            failure = nil
        } catch {
            guard !Task.isCancelled, request == self.request else { return }
            failure = (request, error)
        }
    }
}
