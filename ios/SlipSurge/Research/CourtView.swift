import SwiftUI

struct CourtView: View {
    enum Scope {
        case preview
        case member(AccountStore, UUID)
    }

    fileprivate enum BoardSection: String, CaseIterable {
        case players = "Player Board", odds = "Odds Board", comparison = "Compare Books"
        case ladders = "Prop Ladders", movement = "Market Story", markets = "Game Markets"

        var glyph: String {
            switch self {
            case .players: "person.text.rectangle"
            case .odds: SlipGlyph.oddsBoard.rawValue
            case .comparison: SlipGlyph.compareBooks.rawValue
            case .ladders: "stairs"
            case .movement: SlipGlyph.marketStory.rawValue
            case .markets: "list.bullet.rectangle"
            }
        }
    }

    enum Entry: String {
        case research, oddsBoard = "odds-board", gameMarkets = "game-markets", odds, ladders, movement
        case firstBasket = "first-basket", cheatsheets, trends, slate, score, dvp, matchup, lineups
        case availability, usage, tracking, publicActivity = "public", divergence

        fileprivate var tool: CourtMatchupTool? {
            switch self {
            case .firstBasket: .firstBasket
            case .cheatsheets: .cheatsheets
            case .trends: .trends
            case .slate: .slateEdge
            case .score: .score
            case .dvp: .defense
            case .matchup: .matchup
            case .lineups: .lineups
            case .availability: .availability
            case .usage: .scouting
            case .tracking: .tracking
            case .publicActivity: .publicActivity
            case .divergence: .crossMarket
            default: nil
            }
        }

        fileprivate var section: BoardSection {
            switch self {
            case .oddsBoard: .odds
            case .gameMarkets: .markets
            case .odds: .comparison
            case .ladders: .ladders
            case .movement: .movement
            default: .players
            }
        }
    }

    private enum Slate {
        case loading
        case games(String, [CourtBoard.Game])
        case denied
        case failed
    }

    private enum LoadState {
        case loading
        case loaded(CourtBoard, Date)
        case denied
        case failed
    }

    private struct SlateRequest: Equatable {
        let date: String
        let revision: Int
    }

    private struct BoardRequest: Equatable {
        let slate: SlateRequest
        let gameID: Int?
        let mode: CourtResearchMode
    }

    private struct RankRequest: Equatable {
        let id: Int
        let observation: String
        let mode: CourtResearchMode
        let market: CourtPlayerMarket
        let sportsbook: String?
    }

    private struct ResultRequest: Equatable {
        let gameID: Int
        let mode: CourtResearchMode
        let final: Bool
        let revision: Int
    }

    private struct LinkedPlayerSelection {
        let board: CourtBoard
        let observedAt: Date
    }

    private struct Comparison: Identifiable {
        let id = UUID()
        let board: CourtBoard
        let players: [CourtBoard.Player]
        let observedAt: Date
    }

    let scope: Scope
    private let linkedGame: Int?
    private let linkedDate: String
    private let preferredBook: String?
    private let comparisonBook: String?
    private let link: CourtLinkContext
    private let api = CourtAPI()
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @State private var date = Date.now
    @State private var revision = 0
    @State private var selectedGameID: Int?
    @State private var mode = CourtResearchMode.pregame
    @State private var section = BoardSection.players
    @State private var tool: CourtMatchupTool?
    @State private var market = CourtPlayerMarket.points
    @State private var sportsbook: String?
    @State private var oddsMarket = "points"
    @State private var oddsBook = "fanduel"
    @State private var quoteFilters = ResearchResumeFilters.Quotes()
    @State private var oddsFilters = ResearchOddsFilters()
    @State private var side = CourtPlayerMarket.Side.over
    @State private var contract: CourtLinkContext.Contract?
    @State private var target: Double?
    @State private var sort = CourtLinkContext.Sort.average
    @State private var ascending = false
    @State private var venue = CourtPlayerMarket.Venue.all
    @State private var teamFilter = ""
    @State private var position = ""
    @State private var savedOnly = false
    @State private var savedResults: (Int, Set<Int>)?
    @State private var savedError: Int?
    @State private var savedRevision = 0
    @State private var comparing: [Int] = []
    @State private var comparison: Comparison?
    @State private var playerSearch = ""
    @State private var slate = Slate.loading
    @State private var state = LoadState.loading
    @State private var gameResults: CourtObservedResults.Snapshot?
    @State private var rankResult: (RankRequest, [Int: CourtAPI.Rank])?
    @State private var matrices = false
    @State private var matrixRevision = 0
    @State private var linkedPlayerSelection: LinkedPlayerSelection?
    @State private var showLinkedPlayer = false
    @State private var didOpenLinkedPlayer = false

    init(scope: Scope, date: Date = .now, linkedGame: Int? = nil, entry: Entry = .research,
        startingMode: CourtResearchMode = .pregame, book: String? = nil, comparisonBook: String? = nil,
        link: CourtLinkContext = .init(), oddsMarket: String? = nil,
        restoredOdds: ResearchResumeFilters.Odds? = nil, restoredPlayers: ResearchResumeFilters.Players? = nil,
        restoredQuotes: ResearchResumeFilters.Quotes? = nil) {
        self.scope = scope
        self.linkedGame = linkedGame
        preferredBook = book
        self.comparisonBook = comparisonBook
        self.link = link
        linkedDate = SlateDate.key(date)
        _date = State(initialValue: date)
        _selectedGameID = State(initialValue: linkedGame)
        _section = State(initialValue: entry.section)
        _tool = State(initialValue: entry.tool)
        _mode = State(initialValue: startingMode)
        _sportsbook = State(initialValue: book == "all" ? nil : book)
        _market = State(initialValue: link.market ?? .points)
        _side = State(initialValue: link.side ?? .over)
        _contract = State(initialValue: link.contract)
        _target = State(initialValue: link.target)
        _sort = State(initialValue: link.sort ?? .average)
        _ascending = State(initialValue: link.ascending)
        _oddsMarket = State(initialValue: oddsMarket ?? "points")
        _oddsBook = State(initialValue: book == "all" ? "fanduel" : book ?? "fanduel")
        _oddsFilters = State(initialValue: ResearchOddsFilters(restoring: restoredOdds, slateGame: linkedGame.map(String.init)))
        if let restoredQuotes {
            _quoteFilters = State(initialValue: restoredQuotes)
            _playerSearch = State(initialValue: restoredQuotes.search)
        }
        if let restoredPlayers {
            _teamFilter = State(initialValue: restoredPlayers.team)
            _position = State(initialValue: restoredPlayers.position)
            _venue = State(initialValue: CourtPlayerMarket.Venue(rawValue: restoredPlayers.venue) ?? .all)
            _savedOnly = State(initialValue: restoredPlayers.savedOnly)
            _playerSearch = State(initialValue: restoredPlayers.search)
        }
    }

    private var isPreview: Bool {
        if case .preview = scope { return true }
        return false
    }

    private var slateRequest: SlateRequest { .init(date: SlateDate.key(date), revision: revision) }

    private var games: [CourtBoard.Game] {
        guard case .games(let key, let games) = slate, key == slateRequest.date else { return [] }
        return games
    }

    private var selectedGame: CourtBoard.Game? {
        games.first { $0.id == selectedGameID } ?? (missingLinkedGame ? nil : games.first)
    }

    private var missingLinkedGame: Bool {
        guard let linkedGame, linkedGame == selectedGameID, slateRequest.date == linkedDate else { return false }
        return !games.contains { $0.id == linkedGame }
    }

    private var boardRequest: BoardRequest { .init(slate: slateRequest, gameID: selectedGame?.id, mode: mode) }

    private var showsOddsBoard: Bool { tool == nil && section == .odds }

    private var accessTier: String? {
        guard case .member(let account, _) = scope else { return nil }
        return account.confirmedAccessTier
    }

    private var playerBoardRequest: BoardRequest? {
        if !isPreview, showsOddsBoard, link.player == nil { return nil }
        return boardRequest
    }

    private var resultGame: CourtBoard.Game? {
        if let selectedGame { return selectedGame }
        if isPreview, case .loaded(let board, _) = state { return board.game }
        return nil
    }

    private var resultRequest: ResultRequest? {
        guard playerBoardRequest != nil, let game = resultGame,
              CourtObservedResults.allowed(game: game, mode: mode) else { return nil }
        return .init(gameID: game.id, mode: mode, final: game.isFinal, revision: revision)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if isPreview {
                    boardContent()
                } else {
                    HStack(spacing: 6) {
                        ResearchSlateControls(date: $date)
                        if case .member(_, let user) = scope {
                            ResearchGamePin(account: user, league: "nba", current: selectedGame.map {
                                .init(date: $0.date, id: String($0.id), label: "\($0.visitorTeam.abbreviation) at \($0.homeTeam.abbreviation)")
                            }) { pin in
                                guard let id = Int(pin.id), let day = SlateDate.fromKey(pin.date) else { return }
                                date = day
                                selectedGameID = id
                                mode = .pregame
                            }
                        }
                    }
                    memberContent()
                    if showsOddsBoard {
                        if selectedGame != nil { selectors }
                        oddsBoard(showsContent: selectedGame != nil)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .navigationTitle(tool?.rawValue ?? "The Court")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Research tools", systemImage: "square.grid.2x2") {
                    Button("The Court", systemImage: "basketball") { tool = nil }
                    ForEach(CourtMatchupTool.allCases, id: \.self) { destination in
                        Button { tool = destination } label: { Label(destination.rawValue, glyph: destination.glyph, filled: slipPalette == .color) }
                    }
                    if !isPreview { Button("NBA Matrices", systemImage: "square.grid.3x3") { matrices = true } }
                }
            }
        }
        .background { SlipBackdrop() }
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
        .task(id: slateRequest) { await loadSlate() }
        .task(id: playerBoardRequest) {
            if let request = playerBoardRequest { await loadBoard(request) }
        }
        .task(id: resultRequest) { await updateResults() }
        .refreshable { revision += 1 }
        .navigationDestination(isPresented: $showLinkedPlayer) { linkedPlayer }
        .safeAreaInset(edge: .bottom, spacing: 6) {
            if !comparing.isEmpty, tool == nil, section == .players,
               case .loaded(let board, let observedAt) = state, board.oddsMode == mode {
                comparisonBar(board, observedAt: observedAt)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
            }
        }
        .sheet(item: $comparison) { selected in
            CourtPlayerComparison(board: selected.board, players: selected.players, market: market,
                venue: venue, observedAt: selected.observedAt)
        }
        .onChange(of: boardRequest.gameID) { _, _ in
            comparing = []
            teamFilter = ""
        }
        .onChange(of: slateRequest.date) { _, _ in oddsFilters = ResearchOddsFilters() }
        .onChange(of: oddsMarket) { _, _ in oddsFilters.clearLineSelection() }
        .onChange(of: accessTier) { _, tier in
            if tier == "ultimate" { revision += 1 }
        }
        .onChange(of: resumeLocation, initial: true) { old, location in
            if let location, case .member(let account, _) = scope {
                resume?.record(location, account: account, interaction: old != nil && old != location)
            }
        }
        .sheet(isPresented: $matrices) {
            if case .member(let account, let userID) = scope {
                NavigationStack {
                    MatricesView(api: .init(league: .nba, account: account, userID: userID), gameID: selectedGame?.id, mode: mode) { matrixRevision += 1 }
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { revision += 1 }
        }
        .environment(\.courtResults, visibleResults)
    }

    private var visibleResults: CourtObservedResults.Snapshot? {
        guard let request = resultRequest, let gameResults, request.gameID == gameResults.gameID,
              !request.final || gameResults.data.isFinal else { return nil }
        return gameResults
    }

    private func updateResults() async {
        guard let game = resultGame, let request = resultRequest else { return }
        repeat {
            if let snapshot = try? await CourtObservedResults.read(scope: scope, game: game, mode: request.mode),
               !Task.isCancelled, resultRequest == request {
                gameResults = snapshot
                if snapshot.data.isFinal { return }
            }
            guard request.mode == .live, !request.final else { return }
            do { try await Task.sleep(for: .seconds(30)) } catch { return }
        } while !Task.isCancelled && scenePhase == .active && request == resultRequest
    }

    private var resumeLocation: NativeResumeLocation? {
        guard resumeActive, !isPreview, let game = selectedGame, link.player == nil else { return nil }
        let view: String
        if let tool {
            view = switch tool {
            case .firstBasket: "first-basket"
            case .cheatsheets: "cheatsheets"
            case .trends: "trends"
            case .slateEdge: "slate"
            case .score: "score"
            case .defense: "dvp"
            case .matchup: "matchup"
            case .lineups: "lineups"
            case .availability: "availability"
            case .scouting: "usage"
            case .tracking: "tracking"
            case .publicActivity: "public"
            case .crossMarket: "divergence"
            }
        } else {
            view = switch section {
            case .players: "research"
            case .odds: "odds-board"
            case .comparison: "odds"
            case .ladders: "ladders"
            case .movement: "movement"
            case .markets: "game-markets"
            }
        }
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = "/the-paint"
        var query: [URLQueryItem] = [
            .init(name: "date", value: game.date), .init(name: "game", value: String(game.id)), .init(name: "mode", value: mode.rawValue),
            .init(name: "view", value: view), .init(name: "market", value: market.rawValue),
            .init(name: "book", value: sportsbook ?? "all"), .init(name: "side", value: side.rawValue.lowercased()),
            .init(name: "sort", value: sort.rawValue), .init(name: "order", value: ascending ? "asc" : "desc"),
        ]
        if view == "odds-board" {
            query = Array(query.prefix(4)) + [.init(name: "market", value: oddsMarket), .init(name: "book", value: oddsBook)]
            if let filters = ResearchResumeFilters.item(oddsFilters.resumeFilters(following: String(game.id))) { query.append(filters) }
        } else {
            if let contract { query.append(.init(name: "contract", value: contract.rawValue)) }
            if let target { query.append(.init(name: "target", value: String(target))) }
            if view == "research", let filters = ResearchResumeFilters.item(ResearchResumeFilters.Players(team: teamFilter,
                position: position, venue: venue.rawValue, savedOnly: savedOnly, search: ResearchResumeFilters.searchTerm(playerSearch))) {
                query.append(filters)
            } else if view == "odds" || view == "ladders" {
                var current = quoteFilters
                current.search = ResearchResumeFilters.searchTerm(playerSearch)
                if let filters = ResearchResumeFilters.item(current) { query.append(filters) }
            }
        }
        components.queryItems = query
        return components.url.flatMap { NativeResumeLocation.destination($0, title: tool?.rawValue ?? "The Court") }
    }

    @ViewBuilder
    private func memberContent() -> some View {
        switch slate {
        case .loading:
            loading("Loading slate")
        case .denied:
            accessRequired
        case .failed:
            unavailable("Slate couldn’t load")
        case .games(let key, let list):
            if key != slateRequest.date {
                loading("Loading slate")
            } else if missingLinkedGame {
                ContentUnavailableView {
                    Label("Matchup unavailable on this slate", systemImage: "calendar")
                } actions: {
                    if let first = list.first { Button("Show this slate") { selectedGameID = first.id } }
                }
            } else if list.isEmpty {
                ContentUnavailableView("No games on this date", systemImage: "calendar")
            } else {
                if tool != .slateEdge {
                    ScrollView(.horizontal) {
                        HStack(spacing: 9) {
                            ForEach(list) { game in
                                Button {
                                    if game.id != selectedGame?.id {
                                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.21)) {
                                            selectedGameID = game.id
                                            mode = .pregame
                                        }
                                    }
                                } label: {
                                    matchup(game, subtitle: gameTime(game), selected: game.id == selectedGame?.id)
                                }
                                .buttonStyle(SlipSurgePressStyle())
                                .accessibilityAddTraits(game.id == selectedGame?.id ? .isSelected : [])
                                .accessibilityLabel("\(game.visitorTeam.fullName) at \(game.homeTeam.fullName)")
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .scrollIndicators(.hidden)
                    .sensoryFeedback(.selection, trigger: selectedGameID)
                }
                if !showsOddsBoard { boardContent() }
            }
        }
    }

    private var selectors: some View {
        VStack(spacing: 9) {
            ResearchToolRail(title: "Research tools", choices: [nil] + CourtMatchupTool.allCases.map(Optional.some),
                selection: $tool, label: { $0?.rawValue ?? "The Court" }, glyph: { $0?.glyph ?? "basketball" })
            Picker("Research mode", selection: $mode) {
                Text("Pregame").tag(CourtResearchMode.pregame)
                Text("Live").tag(CourtResearchMode.live)
            }
            .pickerStyle(.segmented)
            if tool == nil {
                ResearchToolRail(title: "Board",
                    choices: isPreview ? [.players, .odds, .markets] : BoardSection.allCases,
                    selection: $section, label: \.rawValue, glyph: \.glyph)
            }
        }
    }

    @ViewBuilder
    private func boardContent() -> some View {
        if isPreview, case .loaded(let board, _) = state {
            matchup(board.game, subtitle: SlateDate.fromKey(board.game.date).map { SlateDate.label($0) }, selected: false)
        }
        selectors
        if tool == .slateEdge {
            CourtSlateEdgeView(scope: scope, date: slateRequest.date, mode: mode, games: games, reload: revision,
                initialGame: linkedGame, initialBook: preferredBook)
        } else if showsOddsBoard {
            oddsBoard(showsContent: true)
        } else {
            playerOrMarketContent()
        }
    }

    private func oddsBoard(showsContent: Bool) -> some View {
        CourtOddsBoardView(scope: scope, date: slateRequest.date, gameID: selectedGame?.id, mode: mode,
            reload: revision, showsContent: showsContent, explicitBook: preferredBook == "all" ? nil : preferredBook,
            market: $oddsMarket, book: $oddsBook, filters: oddsFilters)
    }

    @ViewBuilder
    private func playerOrMarketContent() -> some View {
        switch state {
        case .loading:
            loading("Loading board")
        case .denied:
            accessRequired
        case .failed:
            unavailable("Board couldn’t load")
        case .loaded(let board, let observedAt):
            if board.oddsMode == mode, isPreview || board.game.id == selectedGame?.id && board.game.date == slateRequest.date {
                research(board, observedAt: observedAt)
            } else {
                loading("Loading board")
            }
        }
    }

    @ViewBuilder
    private func research(_ board: CourtBoard, observedAt: Date) -> some View {
        if board.oddsMode == .live, board.game.isInProgress || board.game.isFinal {
            HStack {
                Label(board.game.isFinal ? "Final" : "Live", systemImage: "waveform")
                Spacer()
                Text("\(board.game.visitorTeam.abbreviation) \(score(board.game.visitorTeamScore))  ·  \(board.game.homeTeam.abbreviation) \(score(board.game.homeTeamScore))")
                    .monospacedDigit()
            }
            .font(.subheadline.weight(.medium))
        } else if board.isFrozen {
            Label("Saved pregame snapshot", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
        }

        if tool == .firstBasket {
            CourtFirstBasketView(scope: scope, board: board, reload: revision, explicitBook: comparisonBook,
                linkedBooks: link.booksChoice)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .cheatsheets {
            CourtCheatsheetsView(scope: scope, board: board, reload: revision, observedAt: observedAt, initialBook: preferredBook)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .lineups {
            CourtLineupView(scope: scope, board: board, observedAt: observedAt, revision: revision)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .publicActivity {
            CourtPublicView(scope: scope, board: board, observedAt: observedAt, revision: revision)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .score || tool == .defense {
            CourtIntelligenceView(scope: scope, board: board, defense: tool == .defense, revision: revision)
                .id("\(board.game.id):\(mode.rawValue):\(tool?.rawValue ?? "")")
        } else if tool == .crossMarket {
            CourtCrossMarketView(scope: scope, board: board, revision: revision)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .scouting {
            CourtRoleView(scope: scope, board: board, observedAt: observedAt, revision: revision)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if tool == .tracking {
            CourtTrackingView(scope: scope, board: board, revision: revision, linkedMetric: link.metric)
                .id("\(board.game.id):\(mode.rawValue)")
        } else if board.hasUsableResearch {
            if !board.issues.isEmpty {
                Text("Some research is unavailable for this matchup.").font(.caption).foregroundStyle(.secondary)
            }
            if let tool {
                switch tool {
                case .matchup: CourtMatchupLab(board: board, observedAt: observedAt, scope: scope)
                case .trends: CourtVolumeTrends(board: board, observedAt: observedAt, scope: scope)
                    .id("\(board.game.id):\(mode.rawValue)")
                case .availability: CourtAvailability(board: board, observedAt: observedAt, scope: scope)
                case .firstBasket, .cheatsheets, .slateEdge, .score, .defense, .lineups, .publicActivity, .crossMarket, .scouting, .tracking: EmptyView()
                }
            } else {
                switch section {
                case .players:
                    playerContent(board, at: observedAt)
                case .odds:
                    EmptyView()
                case .markets:
                    GameMarkets(
                        away: matchupTeam(board.game.visitorTeam), home: matchupTeam(board.game.homeTeam),
                        offers: board.gameOdds?.map(\.book) ?? [], initialBook: sportsbook
                    )
                case .comparison, .ladders:
                    quoteBoard(board, at: observedAt)
                case .movement:
                    CourtMovementView(scope: scope, game: board.game, mode: board.oddsMode, players: board.players,
                        initialMarket: market, initialSide: side, initialBook: sportsbook,
                        initialContract: contract, initialTarget: target)
                        .id("\(board.game.id):\(mode.rawValue)")
                }
            }
        } else {
            ContentUnavailableView(
                board.oddsMode == .live ? "Live research unavailable" : "Pregame snapshot unavailable",
                systemImage: board.oddsMode == .live ? "waveform" : "clock"
            )
        }
    }

    @ViewBuilder private var linkedPlayer: some View {
        if let selected = linkedPlayerSelection,
           let player = selected.board.players.first(where: { $0.id == link.player }) {
            let board = selected.board
            CourtPlayerView(player: player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                tip: board.tip, observedAt: selected.observedAt, sampleSeason: board.sampleSeason, initialBook: preferredBook,
                initialMarket: link.market?.rawValue ?? market.rawValue, initialSide: link.side ?? .over, researchScope: scope,
                linkedQuote: link.quote, matchupBoard: board, linkedPanel: link.panel, linkedMetric: link.metric)
        } else {
            ContentUnavailableView("Player unavailable in this matchup", systemImage: "person.crop.circle.badge.questionmark",
                description: Text("Open the game board to see the eligible players in its recorded snapshot."))
        }
    }

    private func quoteBoard(_ board: CourtBoard, at observedAt: Date) -> some View {
        let request = RankRequest(id: board.game.id, observation: board.observationID ?? "", mode: board.oddsMode,
                                  market: market, sportsbook: sportsbook)
        return VStack(alignment: .leading, spacing: 10) {
            playerFilters(board)
            CourtQuoteBoard(scope: scope, board: board, observedAt: observedAt,
                layout: section == .comparison ? .comparison : .ladder, market: market, side: side,
                contract: contract, target: target, search: playerSearch, initialBooks: link.booksChoice,
                oneBook: sportsbook, ranks: rankResult.flatMap { $0.0 == request ? $0.1 : nil } ?? [:], filters: $quoteFilters)
        }
        .task(id: request) { await loadRanks(board, request: request) }
    }

    private func playerContent(_ board: CourtBoard, at observedAt: Date) -> some View {
        let request = RankRequest(id: board.game.id, observation: board.observationID ?? "", mode: board.oddsMode,
                                  market: market, sportsbook: sportsbook)
        let ranks = rankResult.flatMap { $0.0 == request ? $0.1 : nil }
        return VStack(alignment: .leading, spacing: 12) {
            playerFilters(board)
            if case .member(let account, let userID) = scope {
                CourtMatrixBoard(api: .init(league: .nba, account: account, userID: userID), board: board,
                    revision: matrixRevision + revision, manage: { matrices = true }) { matches, filter in
                    playerTeams(board, at: observedAt, ranks: ranks ?? [:], matches: matches, filter: filter)
                }
            } else {
                playerTeams(board, at: observedAt, ranks: ranks ?? [:], matches: [:], filter: nil)
            }
        }
        .task(id: request) {
            await loadRanks(board, request: request)
        }
        .task(id: "\(board.game.id):\(savedOnly):\(savedRevision):\(revision)") {
            if savedOnly { await loadSaved(game: board.game.id) }
        }
    }

    private func loadRanks(_ board: CourtBoard, request: RankRequest) async {
        let rows = try? await api.ranks(board: board, market: request.market, book: request.sportsbook, scope: scope)
        if !Task.isCancelled { rankResult = (request, rows ?? [:]) }
    }

    private func playerTeams(_ board: CourtBoard, at observedAt: Date, ranks: [Int: CourtAPI.Rank],
        matches: [Int: [CourtMatrixResults.Match]], filter: String?,
    ) -> some View {
        Group {
            if savedOnly, savedResults?.0 != board.game.id {
                ResearchToolMessage(title: "Watchlist couldn’t load",
                    error: savedError == board.game.id ? URLError(.resourceUnavailable) : nil) { savedRevision += 1 }
            } else {
                let teams = [board.game.visitorTeam, board.game.homeTeam].filter { teamFilter.isEmpty || String($0.id) == teamFilter }
                ScrollView(.horizontal) {
                    HStack(spacing: 2) {
                        ForEach([CourtLinkContext.Sort.name, .average, .mm, .line, .odds, .l5, .l10, .l20, .minutes], id: \.self) { column in
                            ResearchSortHeader(title: column.label, selected: sort == column, ascending: ascending) {
                                if sort == column { ascending.toggle() }
                                else { sort = column; ascending = column == .name }
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .accessibilityLabel("Sort players by column")
                ForEach(teams, id: \.id) { team in
                    CourtPlayerBoard(team: team, board: board, observedAt: observedAt, market: market,
                        sportsbook: sportsbook, side: side, search: playerSearch, ranks: ranks, matrixMatches: matches, matrixFilter: filter,
                        scope: scope, contract: contract, target: target, sort: sort, ascending: ascending, venue: venue,
                        position: position, savedPlayers: savedOnly ? savedResults?.1 : nil, comparing: comparing,
                        toggleComparison: toggleComparison)
                }
            }
        }
    }

    private func comparisonBar(_ board: CourtBoard, observedAt: Date) -> some View {
        let controls = compareControls(board, observedAt: observedAt).padding(.horizontal, 12).padding(.vertical, 5)
        return Group {
            if #available(iOS 26, *) {
                controls.glassEffect(.regular, in: .rect(cornerRadius: 22))
            } else {
                controls.background(.regularMaterial, in: .rect(cornerRadius: 22))
            }
        }
    }

    private func compareControls(_ board: CourtBoard, observedAt: Date) -> some View {
        let players = comparing.compactMap { id in board.players.first { $0.id == id } }
        return HStack {
            Label("\(players.count) of 3 selected", systemImage: "rectangle.split.2x1").font(.caption.weight(.medium))
            Spacer(minLength: 4)
            Button("Compare players") {
                comparison = .init(board: board, players: players, observedAt: observedAt)
            }
            .buttonStyle(.borderedProminent).disabled(players.count < 2)
            Button("Clear comparison", systemImage: "xmark.circle") { comparing = [] }
                .labelStyle(.iconOnly).buttonStyle(.borderless).frame(minWidth: 44, minHeight: 44)
        }
    }

    private func toggleComparison(_ id: Int) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) {
            if comparing.contains(id) { comparing.removeAll { $0 == id } }
            else if comparing.count < 3 { comparing.append(id) }
        }
    }

    private func loadSaved(game: Int) async {
        guard case .member(let account, let userID) = scope else { return }
        savedError = nil
        do {
            let rows = try await ResearchLibraryAPI(account: account, userID: userID).courtSelections(game: game)
            try Task.checkCancellation()
            if game == selectedGameID { savedResults = (game, Set(rows.compactMap(\.playerID))) }
        } catch {
            if !Task.isCancelled, game == selectedGameID { savedError = game }
        }
    }

    private func playerFilters(_ board: CourtBoard) -> some View {
        let vendors = Set(board.players.flatMap(\.props).map(\.vendor) + (sportsbook.map { [$0] } ?? [])).sorted()
        let offers = board.players.flatMap { market.offers($0, gameID: board.game.id, side: side) }
            .filter { contract == nil || $0.milestone == (contract == .milestone) }
        let targets = Set(offers.filter { sportsbook == nil || $0.vendor == sportsbook }.map(\.line)
            + (target.map { [$0] } ?? [])).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                menu(market.label, icon: "slider.horizontal.3", accessibility: "Market, \(market.label)") {
                    Picker("Market", selection: Binding(get: { market }, set: { market = $0; target = nil })) {
                        ForEach(CourtPlayerMarket.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                }
                ResearchArtworkPicker(title: "Sportsbook",
                    options: [.init(id: "", title: "All books", icon: "books.vertical")] + vendors.map(ResearchArtworkPicker.Option.sportsbook),
                    selection: Binding(get: { sportsbook ?? "" }, set: { selectedBook in
                        sportsbook = selectedBook.isEmpty ? nil : selectedBook
                        if let target, !offers.contains(where: { $0.line == target && (sportsbook == nil || $0.vendor == sportsbook) }) {
                            self.target = nil
                        }
                    }))
                menu(side.rawValue, icon: nil, accessibility: "Side, \(side.rawValue)") {
                    Picker("Side", selection: Binding(get: { side }, set: { newSide in
                        guard side != newSide else { return }
                        side = newSide
                        target = nil
                        if newSide == .under, contract == .milestone { contract = nil }
                    })) {
                        ForEach(CourtPlayerMarket.Side.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
                Menu("Lines", systemImage: "target") {
                    Picker("Contract", selection: Binding(get: { contract }, set: { contract = $0; target = nil })) {
                        Text("All contracts").tag(nil as CourtLinkContext.Contract?)
                        ForEach(CourtLinkContext.Contract.allCases.filter { $0 != .milestone || side == .over }, id: \.self) {
                            Text($0.label).tag(Optional($0))
                        }
                    }
                    Picker("Line", selection: $target) {
                        Text("All lines").tag(nil as Double?)
                        ForEach(targets, id: \.self) { Text($0.formatted()).tag(Optional($0)) }
                    }
                }.frame(minHeight: 44)
                if section == .players {
                    ResearchArtworkPicker(title: "Team",
                        options: [.init(id: "", title: "Both teams", icon: "shield")] + [board.game.visitorTeam, board.game.homeTeam].map {
                            .team(id: String($0.id), title: $0.abbreviation, logo: $0.logo)
                        }, selection: $teamFilter)
                    Menu("Player filters", systemImage: "line.3.horizontal.decrease") {
                        Picker("Position", selection: $position) {
                            Text("All positions").tag("")
                            ForEach(["G", "F", "C"], id: \.self) { Text($0).tag($0) }
                        }
                        Picker("Venue", selection: $venue) {
                            ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        Picker("Sort by", selection: $sort) {
                            ForEach(CourtLinkContext.Sort.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        Toggle("Ascending", isOn: $ascending)
                        if !isPreview { Toggle("Saved players only", isOn: $savedOnly) }
                    }.frame(minHeight: 44)
                }
                }.padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("Find a player", text: $playerSearch)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if !playerSearch.isEmpty {
                    Button { playerSearch = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Clear player search")
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(slipPalette.surface, in: .rect(cornerRadius: 10))
        }
    }

    private func menu<Options: View>(
        _ title: String, icon: String?, accessibility: String, @ViewBuilder options: () -> Options
    ) -> some View {
        Menu(content: options) {
            HStack(spacing: 5) {
                if let icon { Image(systemName: icon) }
                Text(title)
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold))
            }
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: 44)
        }
        .accessibilityLabel(accessibility)
    }

    private func matchup(_ game: CourtBoard.Game, subtitle: String?, selected: Bool) -> some View {
        ResearchMatchup(away: matchupTeam(game.visitorTeam), home: matchupTeam(game.homeTeam), subtitle: subtitle, selected: selected, fullWidth: isPreview)
    }

    private func matchupTeam(_ team: CourtBoard.Team) -> ResearchMatchup.Team {
        let palette = CourtTeamColors.colors(for: team.abbreviation)
        return .init(name: team.abbreviation, logo: team.logo, color: palette.primary, secondary: palette.secondary)
    }

    private func gameTime(_ game: CourtBoard.Game) -> String? {
        game.datetime.flatMap(SidelineBoard.timestamp)?.formatted(date: .omitted, time: .shortened)
    }

    private func score(_ value: Int?) -> String { value.map(String.init) ?? "—" }

    private func loading(_ title: String) -> some View {
        ProgressView(title).frame(maxWidth: .infinity).padding()
    }

    private var accessRequired: some View {
        ContentUnavailableView {
            Label("Ultimate research", systemImage: "lock")
        } description: {
            Text("Ultimate includes the full Court slate.")
        } actions: {
            if case .member(let account, _) = scope {
                UltimateSpotlightButton(account: account, spotlight: .court)
            }
            NavigationLink("Open Preview") { CourtView(scope: .preview) }
        }
    }

    private func unavailable(_ title: String) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: "wifi.exclamationmark")
        } actions: {
            Button("Retry") { revision += 1 }
            if !isPreview {
                NavigationLink("Open Preview") { CourtView(scope: .preview) }
            }
        }
    }

    private func loadSlate() async {
        guard case .member(let account, let userID) = scope else { return }
        let request = slateRequest
        if games.isEmpty { slate = .loading }
        do {
            let list = try await api.slate(date: request.date, account: account, userID: userID)
            try Task.checkCancellation()
            guard request == slateRequest else { return }
            if !(linkedGame != nil && linkedGame == selectedGameID && request.date == linkedDate),
                !list.contains(where: { $0.id == selectedGameID }) {
                selectedGameID = list.first?.id
                mode = .pregame
            }
            slate = .games(request.date, list)
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 {
            if !Task.isCancelled, request == slateRequest { slate = .denied }
        } catch {
            if !Task.isCancelled, request == slateRequest { slate = .failed }
        }
    }

    private func hasLiveBoard(for request: BoardRequest) -> Bool {
        guard request.mode == .live, case .loaded(let board, _) = state else { return false }
        return board.oddsMode == .live && board.game.id == request.gameID && board.game.date == request.slate.date
    }

    private func loadBoard(_ request: BoardRequest) async {
        let game = selectedGame
        if !isPreview, game == nil { return }
        if !isPreview, !hasLiveBoard(for: request) { state = .loading }
        do {
            let board: CourtBoard
            switch scope {
            case .preview:
                board = try await api.previewBoard(mode: request.mode)
            case .member(let account, let userID):
                guard let game else { return }
                board = try await api.memberBoard(game: game, mode: request.mode, account: account, userID: userID)
            }
            try Task.checkCancellation()
            guard request == playerBoardRequest else { return }
            let observedAt = Date.now
            state = .loaded(board, observedAt)
            if !didOpenLinkedPlayer, link.player != nil, request.slate.date == linkedDate,
               linkedGame == nil || board.game.id == linkedGame {
                linkedPlayerSelection = .init(board: board, observedAt: observedAt)
                didOpenLinkedPlayer = true
                showLinkedPlayer = true
            }
            if board.oddsMode == .pregame, !board.isFrozen, let tip = board.tip, tip > observedAt {
                try await Task.sleep(for: .seconds(max(0, tip.timeIntervalSinceNow)))
                revision += 1
            } else if board.oddsMode == .live, board.game.isInProgress {
                try await Task.sleep(for: .seconds(30))
                revision += 1
            }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 && !isPreview {
            if !Task.isCancelled, request == playerBoardRequest { state = .denied }
        } catch {
            if !Task.isCancelled, request == playerBoardRequest { state = .failed }
        }
    }
}
