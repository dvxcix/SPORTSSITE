import SwiftUI

struct SidelineView: View {
    private enum Section: String, CaseIterable {
        case gameDay = "Game Day", touchdowns = "TDs", props = "Props", oddsBoard = "Odds Board", capture = "Market Story"
        case usage = "Usage", tracking = "Tracking", team = "Team", all = "All", custom = "Custom"

        var glyph: String {
            switch self {
            case .gameDay: "calendar"
            case .touchdowns: "flag.checkered"
            case .props: "ticket"
            case .oddsBoard: SlipGlyph.oddsBoard.rawValue
            case .capture: SlipGlyph.marketStory.rawValue
            case .usage: "chart.pie"
            case .tracking: "location"
            case .team: "shield"
            case .all: "tablecells"
            case .custom: "slider.horizontal.3"
            }
        }

        var statsMode: SidelineStatMode? { SidelineStatMode(rawValue: rawValue) }
        var quotes: Bool { self == .touchdowns || self == .props || self == .oddsBoard }
    }

    enum Entry: String {
        case core, props, oddsBoard = "odds-board", touchdowns, publicActivity = "public", markets, cheatsheets
        case mismatch = "mm", slateEdge = "slate-edge", ladders, usage, tracking, team, all, custom, research, movement
    }

    private enum Workspace: String, CaseIterable {
        case matchup = "The Sideline", mismatch = "MM", cheatsheets = "Cheatsheets", slateEdge = "Slate Edge"
        case publicActivity = "The Public", sportsbooks = "Sportsbooks", ladders = "Prop Ladders"
        case matchupLab = "Matchup Lab"

        var glyph: String {
            switch self {
            case .matchup: "football"
            case .mismatch: SlipGlyph.mismatch.rawValue
            case .cheatsheets: SlipGlyph.cheatsheets.rawValue
            case .slateEdge: SlipGlyph.slateEdge.rawValue
            case .publicActivity: "chart.pie"
            case .sportsbooks: "sportscourt"
            case .ladders: "stairs"
            case .matchupLab: "chart.xyaxis.line"
            }
        }
    }

    private enum LoadState {
        case loading, loaded(SidelineBoard, ResearchOddsSlate), failed, denied
    }

    private enum ScheduleState {
        case loading, loaded(SidelineSchedule), failed, denied
    }

    private struct DayRequest: Equatable {
        let date: String
        let revision: Int
    }

    private struct RequestKey: Equatable {
        let date: String
        let selection: OddsSelection
        let revision: Int
        let fetchQuotes: Bool
    }

    let api: SidelineAPI
    private let linkedGame: String?
    private let linkedDate: String?
    private let preferredBook: String?
    private let link: SidelineLinkContext
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @State private var date = Date.now
    @State private var section = Section.gameDay
    @State private var tool = Workspace.matchup
    @State private var selection = OddsSelection()
    @State private var selectedGameID: String?
    @State private var revision = 0
    @State private var state = LoadState.loading
    @State private var oddsFilters = ResearchOddsFilters()
    @State private var oddsDetail: ResearchOddsDetail?
    @State private var lastBoard: SidelineBoard?
    @State private var schedule = ScheduleState.loading
    @State private var useDefaultDate = true
    @State private var matrices = false

    init(api: SidelineAPI, date: Date? = nil, linkedGame: String? = nil, entry: Entry = .core, book: String? = nil,
        link: SidelineLinkContext = .init()) {
        self.api = api
        self.linkedGame = linkedGame
        linkedDate = date.map(SlateDate.key)
        preferredBook = book == "all" ? nil : book
        self.link = link
        _date = State(initialValue: date ?? .now)
        _selectedGameID = State(initialValue: linkedGame)
        _useDefaultDate = State(initialValue: date == nil)
        let workspace: Workspace
        switch entry {
        case .mismatch: workspace = .mismatch
        case .slateEdge: workspace = .slateEdge
        case .cheatsheets: workspace = .cheatsheets
        case .publicActivity: workspace = .publicActivity
        case .markets: workspace = .sportsbooks
        case .ladders: workspace = .ladders
        case .research: workspace = .matchupLab
        default: workspace = .matchup
        }
        let exactProp = link.line != nil
        _tool = State(initialValue: exactProp && link.capture == nil ? .ladders : workspace)
        let selected: Section = switch entry {
        case .oddsBoard: .oddsBoard
        case .touchdowns: .touchdowns
        case .props: .props
        case .usage: .usage
        case .tracking: .tracking
        case .team: .team
        case .all: .all
        case .custom: .custom
        case .movement: .capture
        default: .gameDay
        }
        _section = State(initialValue: link.capture == nil ? selected : .capture)
        var initialOdds = OddsSelection()
        if entry == .touchdowns { initialOdds.market = "anytime_td" }
        if let book, book != "all" { initialOdds.book = book }
        _selection = State(initialValue: initialOdds)
    }

    private var dayRequest: DayRequest { .init(date: SlateDate.key(date), revision: revision) }

    private var requestKey: RequestKey {
        RequestKey(date: dayRequest.date, selection: selection, revision: revision, fetchQuotes: api.isFeatured || tool == .matchup && section.quotes)
    }

    private var dateSelection: Binding<Date> {
        Binding(get: { date }, set: { next in
            if SlateDate.key(next) != SlateDate.key(date) { selectedGameID = nil }
            useDefaultDate = false
            date = next
        })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if api.isFeatured {
                    if let slate = lastBoard, let game = slate.games.first {
                        previewMatchup(slate)
                        toolPicker
                        if tool != .matchup {
                            let teams = [game.away, game.home].map { nickname in
                                let team = matchupTeam(nickname, game, slate)
                                return SidelineMarketTools.Visual(code: nickname, logo: team.logo, primary: team.color, secondary: team.secondary)
                            }
                            toolContent(date: slate.date, gameID: game.id, selectedTeams: teams, slateTeams: teams)
                        } else {
                            boardPicker
                        }
                    }
                    if tool == .matchup || lastBoard?.games.isEmpty != false { oddsContent() }
                } else {
                    ResearchSlateControls(date: dateSelection)
                    memberSlate()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .navigationTitle(tool.rawValue)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Research tools", systemImage: "square.grid.2x2") {
                    ForEach(Workspace.allCases, id: \.self) { destination in
                        Button { tool = destination } label: { Label(destination.rawValue, glyph: destination.glyph) }
                    }
                    if !api.isFeatured {
                        Button("NFL Matrices", systemImage: "square.grid.3x3") { matrices = true }
                    }
                }
            }
        }
        .task(id: dayRequest) { await loadSchedule() }
        .task(id: requestKey) { await load() }
        .onChange(of: dayRequest.date) { _, _ in
            oddsFilters = ResearchOddsFilters()
            oddsDetail = nil
        }
        .onChange(of: selection.market) { _, _ in oddsFilters.clearLineSelection() }
        .onChange(of: selection) { _, _ in oddsDetail = nil }
        .refreshable { revision += 1 }
        .sheet(isPresented: $matrices) {
            if case .member(let account, let userID) = api.scope {
                NavigationStack { MatricesView(api: .init(league: .nfl, account: account, userID: userID)) { revision += 1 } }
            }
        }
        .sheet(item: $oddsDetail) { ResearchBookComparison(detail: $0) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { revision += 1 }
        }
        .onChange(of: resumeLocation, initial: true) { old, location in
            if let location, case .member(let account, _) = api.scope {
                resume?.record(location, account: account, interaction: old != nil && old != location)
            }
        }
    }

    private var resumeLocation: NativeResumeLocation? {
        guard resumeActive, let selectedGameID, !api.isFeatured, link.capture == nil, link.player == nil, link.line == nil else { return nil }
        let view: String = switch tool {
        case .matchup:
            switch section {
            case .gameDay: "core"
            case .touchdowns: "touchdowns"
            case .props: "props"
            case .oddsBoard: "odds-board"
            case .capture: "movement"
            case .usage: "usage"
            case .tracking: "tracking"
            case .team: "team"
            case .all: "all"
            case .custom: "custom"
            }
        case .matchupLab: "research"
        case .mismatch: "mm"
        case .cheatsheets: "cheatsheets"
        case .slateEdge: "slate-edge"
        case .publicActivity: "public"
        case .sportsbooks: "markets"
        case .ladders: "ladders"
        }
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = "/the-sideline"
        let mode = tool == .matchupLab || tool == .publicActivity || tool == .sportsbooks || tool == .cheatsheets
        var query: [URLQueryItem] = [.init(name: "date", value: dayRequest.date), .init(name: "game", value: selectedGameID),
            .init(name: mode ? "mode" : "view", value: view), .init(name: "book", value: selection.book)]
        if link.sample != .automatic { query.append(.init(name: "sample", value: link.sample.rawValue)) }
        components.queryItems = query
        return components.url.flatMap { NativeResumeLocation.destination($0, title: tool.rawValue) }
    }

    private var boardPicker: some View {
        ResearchToolRail(title: "Board", choices: api.isFeatured ? [.gameDay, .props, .oddsBoard] : Section.allCases,
            selection: $section, label: \.rawValue, glyph: \.glyph)
        .onChange(of: section) { _, current in
            if current == .touchdowns { selection.market = "anytime_td" }
        }
    }

    @ViewBuilder
    private func memberSlate() -> some View {
        switch schedule {
        case .loading:
            loading("Loading slate")
        case .failed:
            unavailable("Slate couldn’t load")
        case .denied:
            accessRequired
        case .loaded(let slate):
            if slate.date != dayRequest.date {
                loading("Loading slate")
            } else if let linkedGame, selectedGameID == linkedGame, (linkedDate == nil || dayRequest.date == linkedDate),
                      !slate.games.contains(where: { $0.id == linkedGame }) {
                ContentUnavailableView {
                    Label("Matchup unavailable on this slate", systemImage: "calendar")
                } actions: {
                    if let first = slate.games.first { Button("Show this slate") { selectedGameID = first.id } }
                }
            } else if let game = slate.games.first(where: { $0.id == selectedGameID }) ?? slate.games.first {
                if tool != .slateEdge { matchupPicker(slate, selected: game.id) }
                toolPicker
                let teams = [game.away, game.home].map(marketVisual)
                if tool != .matchup {
                    let slateTeams = slate.games.flatMap { [$0.away, $0.home] }.map(marketVisual)
                    toolContent(date: slate.date, gameID: game.id, selectedTeams: teams, slateTeams: slateTeams)
                } else {
                    boardPicker
                    if section == .gameDay {
                        SidelineGameDay(api: api, gameID: game.id, away: matchupTeam(game.away), home: matchupTeam(game.home),
                            date: slate.date, initialBook: preferredBook)
                            .id(game.id)
                    }
                    if let mode = section.statsMode {
                        statBoard(date: slate.date, gameID: game.id, teams: teams, mode: mode)
                    } else if section == .capture {
                        SidelineMarketStory(api: api, game: game.id, teams: teams, initialBook: preferredBook,
                            initialCapture: game.id == linkedGame ? link.capture : nil,
                            initialPlayer: game.id == linkedGame ? link.player : nil)
                            .id(game.id)
                    } else if section.quotes {
                        oddsContent()
                    }
                }
            } else {
                ContentUnavailableView("No games on this date", systemImage: "calendar")
            }
        }
    }

    private func statBoard(date: String, gameID: String, teams: [SidelineMarketTools.Visual], mode: SidelineStatMode) -> some View {
        SidelineStatBoard(api: api, game: gameID, date: date, teams: teams, mode: mode, revision: revision,
            initialSample: link.sample, initialBook: preferredBook,
            initialPlayer: link.line == nil && (gameID == linkedGame || linkedGame == nil) ? link.player : nil)
            .id("\(gameID):\(mode.rawValue)")
    }

    private var toolPicker: some View {
        ResearchToolRail(title: "Research tools", choices: Workspace.allCases, selection: $tool,
            label: \.rawValue, glyph: \.glyph)
    }

    private func marketVisual(_ team: SidelineSchedule.Team) -> SidelineMarketTools.Visual {
        let visual = matchupTeam(team)
        return .init(code: team.abbreviation, logo: visual.logo, primary: visual.color,
            secondary: visual.secondary ?? Color(hex: team.secondary))
    }

    @ViewBuilder
    private func toolContent(date: String, gameID: String, selectedTeams: [SidelineMarketTools.Visual],
        slateTeams: [SidelineMarketTools.Visual]) -> some View {
        switch tool {
        case .matchup:
            EmptyView()
        case .publicActivity, .sportsbooks:
            SidelineMarketTools(api: api, tool: tool == .publicActivity ? .publicActivity : .sportsbooks,
                date: date, gameID: gameID, teams: selectedTeams)
                .id("\(gameID):\(tool.rawValue)")
        case .mismatch, .cheatsheets:
            SidelineResearchView(api: api, tool: tool == .mismatch ? .mismatch : .cheatsheets,
                date: date, game: gameID, teams: selectedTeams, revision: revision, initialBook: preferredBook, initialSample: link.sample)
                .id("\(gameID):\(tool.rawValue)")
        case .slateEdge:
            SidelineSlateEdgeView(api: api, date: date, teams: slateTeams, revision: revision, initialSample: link.sample)
        case .ladders:
            SidelineLaddersView(api: api, date: date, game: gameID, teams: selectedTeams, revision: revision,
                initialBook: preferredBook, initialSample: link.sample, initialPlayer: gameID == linkedGame ? link.player : nil,
                initialLine: gameID == linkedGame ? link.line : nil)
                .id(gameID)
        case .matchupLab:
            statBoard(date: date, gameID: gameID, teams: selectedTeams, mode: .matchup)
        }
    }

    private func matchupPicker(_ slate: SidelineSchedule, selected: String) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 9) {
                ForEach(slate.games) { game in
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.21)) { selectedGameID = game.id }
                    } label: {
                        ResearchMatchup(
                            away: matchupTeam(game.away), home: matchupTeam(game.home),
                            subtitle: game.kickoff.flatMap(SidelineBoard.timestamp)?.formatted(date: .omitted, time: .shortened),
                            selected: selected == game.id
                        )
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityAddTraits(selected == game.id ? .isSelected : [])
                    .accessibilityLabel("\(game.away.name) at \(game.home.name)")
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selectedGameID)
    }

    private func matchupTeam(_ team: SidelineSchedule.Team) -> ResearchMatchup.Team {
        .init(name: team.abbreviation, logo: team.logo, color: Color(hex: team.color) ?? Brand.surface(for: scheme))
    }

    @ViewBuilder
    private func previewMatchup(_ board: SidelineBoard) -> some View {
        if let game = board.games.first {
            ResearchMatchup(
                away: matchupTeam(game.away, game, board), home: matchupTeam(game.home, game, board),
                subtitle: SlateDate.fromKey(board.date).map { SlateDate.label($0) }, fullWidth: true
            )
        }
    }

    private func matchupTeam(_ name: String, _ game: SidelineBoard.Game, _ board: SidelineBoard) -> ResearchMatchup.Team {
        let team = board.teams.first { $0.game == game.id && $0.abbreviation == name }
        return .init(name: name, logo: team?.logo, color: Color(hex: team?.primary) ?? Brand.surface(for: scheme),
            secondary: Color(hex: team?.secondary))
    }

    @ViewBuilder
    private func oddsContent() -> some View {
        if section != .gameDay, let lastBoard, api.isFeatured || lastBoard.date == dayRequest.date {
            quoteFilters(lastBoard)
        }
        switch state {
        case .loading:
            loading("Loading board")
        case .failed:
            unavailable("Board couldn’t load")
        case .denied:
            accessRequired
        case .loaded(let board, let oddsSlate):
            if !api.isFeatured, board.date != dayRequest.date {
                loading("Loading board")
            } else if api.isFeatured, section == .gameDay, let game = board.games.first {
                SidelineGameDay(api: api, gameID: game.id, away: matchupTeam(game.away, game, board), home: matchupTeam(game.home, game, board), date: board.date)
                    .id(game.id)
            } else if board.games.isEmpty {
                ContentUnavailableView(api.isFeatured ? "Preview unavailable" : "No games on this date", systemImage: "calendar")
            } else if board.market == selection.market, board.book == selection.book {
                if section == .props || section == .touchdowns {
                    if let game = board.games.first(where: { $0.id == selectedGameID }) ?? (api.isFeatured ? board.games.first : nil) {
                        quoteBoard(board, game: game)
                    } else {
                        Text("Odds unavailable for this matchup.").font(.subheadline).foregroundStyle(.secondary)
                    }
                } else {
                    ResearchOddsBoard(slate: oddsSlate, selectedGame: selectedGameID,
                        marketLabel: marketName(board.market), scorerLabel: board.scorerLabel, sportsbook: board.book,
                        readBook: comparisonReader(date: board.date, market: board.market), openQuote: { oddsDetail = $0 },
                        filter: oddsFilters, defaultSort: .shortened)
                }
            } else {
                loading("Loading board")
            }
        }
    }

    private func loading(_ title: String) -> some View {
        ProgressView(title).frame(maxWidth: .infinity).padding()
    }

    private func comparisonReader(date: String, market: String) -> ResearchBookRead {
        { [api] book, target in
            let board = try await api.board(for: .init(market: market, book: book), date: date)
            let expiry = try board.refreshDeadline()
            guard !board.availabilityUnavailable.contains(target.gameID) else { return nil }
            let matches = board.quotes.filter {
                $0.id.player.game == target.gameID && $0.id.player.id == target.playerID &&
                $0.id.player.team == target.team && $0.id.line == target.line
            }
            guard matches.count == 1, let quote = matches.first, quote.observedAt <= .now else { return nil }
            return .init(price: quote.oddsPrice(), expiry: expiry)
        }
    }

    private var accessRequired: some View {
        ContentUnavailableView {
            Label("Ultimate research", systemImage: "lock")
        } description: {
            Text("The full slate requires Ultimate or NFL early access.")
        } actions: {
            NavigationLink("Open Preview") { SidelineView(api: SidelineAPI()) }
        }
    }

    private func unavailable(_ title: String) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: "wifi.exclamationmark")
        } actions: {
            Button("Retry") { revision += 1 }
            if !api.isFeatured {
                NavigationLink("Open Preview") { SidelineView(api: SidelineAPI()) }
            }
        }
    }

    private func quoteFilters(_ board: SidelineBoard) -> some View {
        let markets = Array(Set(board.markets + [selection.market, "anytime_td", "first_td"])).sorted()
        let market = Picker("Market", selection: $selection.market) {
            ForEach(markets, id: \.self) {
                Label(marketName($0), systemImage: SidelineResearchMarket.glyph($0)).tag($0)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(minHeight: 44)
        let sportsbook = SportsbookPicker(books: Array(Set(board.books + [selection.book])).sorted(), selection: $selection.book)
            .fixedSize(horizontal: true, vertical: false)
            .frame(minHeight: 44)

        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                market
                Spacer(minLength: 0)
                sportsbook
            }
            VStack(alignment: .leading, spacing: 0) {
                market
                sportsbook
            }
        }
        .padding(.horizontal, 12)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
    }

    @ViewBuilder
    private func quoteBoard(_ board: SidelineBoard, game: SidelineBoard.Game) -> some View {
        let quotes = board.quotes.filter { $0.id.player.game == game.id }
        let groups = Dictionary(grouping: quotes, by: { $0.id.player })
        let players = groups.keys.sorted { $0.name == $1.name ? $0.id < $1.id : $0.name < $1.name }

        VStack(alignment: .leading, spacing: 8) {
            if section == .oddsBoard { ResearchSectionTitle(title: "\(game.away) at \(game.home)") }
            if board.availabilityUnavailable.contains(game.id) || game.status == "unavailable" {
                Text("Odds unavailable for this matchup.").font(.subheadline).foregroundStyle(.secondary)
            } else if game.status == "incomplete" {
                Text("This observation has incomplete coverage.").font(.caption).foregroundStyle(.secondary)
            }
            if players.isEmpty {
                Text("No verified prices for this selection.").font(.subheadline).foregroundStyle(.secondary)
            } else {
                HStack {
                    Text("Player")
                    Spacer()
                    Text("Line & price")
                }
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                LazyVStack(spacing: 0) {
                    ForEach(players, id: \.self) { player in
                        if let prices = groups[player], let first = prices.first {
                            let portrait = board.identities.first { $0.player == player }
                            let team = board.teams.first { $0.game == game.id && $0.abbreviation == player.team }
                            SidelinePlayerPrices(player: player, position: first.position, prices: prices, portrait: portrait, team: team)
                            if player != players.last { Divider() }
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
    }

    private func loadSchedule() async {
        guard !api.isFeatured else { return }
        let requested = dayRequest
        if case .loaded(let slate) = schedule, slate.date != requested.date { schedule = .loading }
        do {
            let slate = try await api.schedule(date: useDefaultDate ? nil : requested.date,
                game: useDefaultDate ? linkedGame : nil)
            try Task.checkCancellation()
            guard requested == dayRequest else { return }
            useDefaultDate = false
            if !(linkedGame != nil && selectedGameID == linkedGame && (linkedDate == nil || requested.date == linkedDate)),
               !slate.games.contains(where: { $0.id == selectedGameID }) { selectedGameID = slate.games.first?.id }
            schedule = .loaded(slate)
            if slate.date != requested.date, let nextDate = SlateDate.fromKey(slate.date) { date = nextDate }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 {
            if !Task.isCancelled, requested == dayRequest { schedule = .denied }
        } catch {
            if !Task.isCancelled, requested == dayRequest { schedule = .failed }
        }
    }

    private func load() async {
        let requested = requestKey
        guard requested.fetchQuotes else { return }
        if !canKeepQuotes(for: requested) { state = .loading }
        do {
            let board = try await api.board(for: requested.selection, date: requested.date)
            try Task.checkCancellation()
            guard requested == requestKey else { return }
            let deadline = try board.refreshDeadline()
            lastBoard = board
            var slate = board.oddsSlate
            slate.expiry = deadline
            state = .loaded(board, slate)
            if let deadline {
                try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow)))
                revision += 1
            } else if board.resultsPending == true {
                try await Task.sleep(for: .seconds(30))
                revision += 1
            }
        } catch let error as SlipSurgeHTTP.Status where [401, 403].contains(error.code) && !api.isFeatured {
            if !Task.isCancelled, requested == requestKey {
                oddsDetail = nil
                state = .denied
            }
        } catch {
            if !Task.isCancelled, requested == requestKey { state = .failed }
        }
    }

    private func canKeepQuotes(for request: RequestKey) -> Bool {
        guard case .loaded(let board, _) = state, board.date == request.date,
              board.market == request.selection.market, board.book == request.selection.book else { return false }
        // A verified snapshot can remain visible until its existing clock deadline.
        return (try? (board.refreshDeadline() ?? .distantFuture)) != nil
    }

    private func marketName(_ value: String) -> String {
        switch value {
        case "anytime_td": "Anytime TD"
        case "first_td": "First TD"
        default: value.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

private struct SidelinePlayerPrices: View {
    let player: SidelineBoard.PlayerIdentity
    let position: String
    let prices: [SidelineBoard.Quote]
    let portrait: SidelineBoard.Portrait?
    let team: SidelineBoard.Team?
    @State private var expanded = false

    private var sorted: [SidelineBoard.Quote] { prices.sorted { $0.id.line < $1.id.line } }
    private var reference: SidelineBoard.Quote? {
        sorted.min { abs(abs(Double($0.price)) - 100) < abs(abs(Double($1.price)) - 100) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DisclosureGroup(isExpanded: $expanded) {
                ForEach(sorted) { quote in
                    VStack(alignment: .leading, spacing: 3) {
                        LabeledContent("\(quote.id.line.formatted())+", value: price(quote.price))
                            .monospacedDigit()
                        HStack(spacing: 10) {
                            if let previous = quote.previousPrice {
                                Text("Prior \(price(previous))")
                            }
                            if let opening = quote.openingPrice,
                               !quote.openingConflict {
                                Text("Open \(price(opening))")
                            }
                        }
                        .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let stamp = sorted.map(\.observedAt).max() {
                    Text("Latest observation \(stamp.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            } label: {
                HStack(spacing: 9) {
                    PlayerArtwork(
                        portraits: portrait?.urls ?? [], logo: team?.logo,
                        primary: Color(hex: team?.primary) ?? Color(rgb: 0x263542),
                        secondary: Color(hex: team?.secondary) ?? Color(rgb: 0x141C25)
                    )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(player.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                        Text("\(player.team) · \(position)").font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 3)
                    if let reference {
                        VStack(alignment: .trailing, spacing: 3) {
                            Text("\(reference.id.line.formatted())+ · \(price(reference.price))")
                                .font(.footnote.weight(.medium)).monospacedDigit()
                            if sorted.count > 1 {
                                Text("\(sorted.count.formatted()) lines").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .padding(.vertical, 7)
    }

    private func price(_ value: Int) -> String { value > 0 ? "+\(value)" : String(value) }
}
