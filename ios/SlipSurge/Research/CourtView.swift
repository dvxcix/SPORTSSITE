import SwiftUI

struct CourtView: View {
    enum Scope {
        case preview
        case member(AccountStore, UUID)
    }

    private enum BoardSection: String, CaseIterable {
        case players = "Player Board", markets = "Game Markets"
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

    let scope: Scope
    private let api = CourtAPI()
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var date = Date.now
    @State private var revision = 0
    @State private var selectedGameID: Int?
    @State private var mode = CourtResearchMode.pregame
    @State private var section = BoardSection.players
    @State private var market = CourtPlayerMarket.points
    @State private var sportsbook: String?
    @State private var side = CourtPlayerMarket.Side.over
    @State private var playerSearch = ""
    @State private var slate = Slate.loading
    @State private var state = LoadState.loading

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
        games.first { $0.id == selectedGameID } ?? games.first
    }

    private var boardRequest: BoardRequest { .init(slate: slateRequest, gameID: selectedGame?.id, mode: mode) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if isPreview {
                    boardContent()
                } else {
                    ResearchSlateControls(date: $date)
                    memberContent()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .navigationTitle("The Court")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: slateRequest) { await loadSlate() }
        .task(id: boardRequest) { await loadBoard() }
        .refreshable { revision += 1 }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { revision += 1 }
        }
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
            } else if list.isEmpty {
                ContentUnavailableView("No games on this date", systemImage: "calendar")
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 9) {
                        ForEach(list) { game in
                            Button {
                                if game.id != selectedGame?.id {
                                    selectedGameID = game.id
                                    mode = .pregame
                                }
                            } label: {
                                matchup(game, subtitle: gameTime(game), selected: game.id == selectedGame?.id)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(game.visitorTeam.fullName) at \(game.homeTeam.fullName)")
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
                boardContent()
            }
        }
    }

    private var selectors: some View {
        VStack(spacing: 9) {
            Picker("Research mode", selection: $mode) {
                Text("Pregame").tag(CourtResearchMode.pregame)
                Text("Live").tag(CourtResearchMode.live)
            }
            .pickerStyle(.segmented)
            Picker("Board", selection: $section) {
                ForEach(BoardSection.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    @ViewBuilder
    private func boardContent() -> some View {
        if isPreview, case .loaded(let board, _) = state {
            matchup(board.game, subtitle: SlateDate.fromKey(board.game.date).map { SlateDate.label($0) }, selected: false)
        }
        selectors
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

        if board.hasUsableResearch {
            if !board.issues.isEmpty {
                Text("Some research is unavailable for this matchup.").font(.caption).foregroundStyle(.secondary)
            }
            switch section {
            case .players:
                playerFilters(board)
                ForEach([board.game.visitorTeam, board.game.homeTeam], id: \.id) { team in
                    CourtPlayerBoard(
                        team: team, board: board, observedAt: observedAt,
                        market: market, sportsbook: sportsbook, side: side, search: playerSearch
                    )
                }
            case .markets:
                GameMarkets(
                    away: board.game.visitorTeam.abbreviation, home: board.game.homeTeam.abbreviation,
                    offers: board.gameOdds?.map(\.book) ?? []
                )
            }
        } else {
            ContentUnavailableView(
                board.oddsMode == .live ? "Live research unavailable" : "Pregame snapshot unavailable",
                systemImage: board.oddsMode == .live ? "waveform" : "clock"
            )
        }
    }

    private func playerFilters(_ board: CourtBoard) -> some View {
        let vendors = Set(board.players.flatMap(\.props).map(\.vendor)).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                menu(market.label, icon: "slider.horizontal.3", accessibility: "Market, \(market.label)") {
                    Picker("Market", selection: $market) {
                        ForEach(CourtPlayerMarket.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                }
                Spacer(minLength: 0)
                menu(sportsbook.map(Sportsbook.name) ?? "All books", icon: nil, accessibility: "Sportsbook, \(sportsbook.map(Sportsbook.name) ?? "all books")") {
                    Picker("Sportsbook", selection: $sportsbook) {
                        Text("All books").tag(nil as String?)
                        ForEach(vendors, id: \.self) { Text(Sportsbook.name($0)).tag(Optional($0)) }
                    }
                }
                menu(side.rawValue, icon: nil, accessibility: "Side, \(side.rawValue)") {
                    Picker("Side", selection: $side) {
                        ForEach(CourtPlayerMarket.Side.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
            }
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
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 10))
        }
        .onChange(of: vendors, initial: true) { _, current in
            if let sportsbook, !current.contains(sportsbook) { self.sportsbook = nil }
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
        .init(name: team.abbreviation, logo: team.logo, color: CourtTeamColors.colors(for: team.abbreviation).primary)
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
            if !list.contains(where: { $0.id == selectedGameID }) {
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

    private func loadBoard() async {
        let request = boardRequest
        let game = selectedGame
        if !isPreview, game == nil { return }
        if !isPreview { state = .loading }
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
            guard request == boardRequest else { return }
            let observedAt = Date.now
            state = .loaded(board, observedAt)
            if board.oddsMode == .pregame, !board.isFrozen, let tip = board.tip, tip > observedAt {
                try await Task.sleep(for: .seconds(max(0, tip.timeIntervalSinceNow)))
                revision += 1
            } else if board.oddsMode == .live, board.game.isInProgress {
                try await Task.sleep(for: .seconds(30))
                revision += 1
            }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 && !isPreview {
            if !Task.isCancelled, request == boardRequest { state = .denied }
        } catch {
            if !Task.isCancelled, request == boardRequest { state = .failed }
        }
    }
}
