import SwiftUI

struct CourtView: View {
    enum Scope {
        case featured
        case member(AccountStore, UUID)
        case game(CourtBoard.Game, AccountStore, UUID)
    }

    private enum State {
        case loading
        case slate([CourtBoard.Game])
        case board(CourtBoard, Date)
        case denied
        case unavailable
    }

    let scope: Scope
    private let api = CourtAPI()
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var date = Date.now
    @State private var revision = 0
    @State private var mode = CourtResearchMode.pregame

    private struct RequestKey: Equatable {
        let revision: Int
        let mode: CourtResearchMode
        let date: String
    }

    private var requestKey: RequestKey { RequestKey(revision: revision, mode: mode, date: SlateDate.key(date)) }
    @State private var state = State.loading

    var body: some View {
        List {
            if case .member = scope {
                DatePicker("Slate date", selection: $date, displayedComponents: .date)
                    .environment(\.timeZone, SlateDate.zone)
                    .listRowBackground(Brand.surface(for: scheme))
            } else {
                Picker("Research mode", selection: $mode) {
                    Text("Pregame").tag(CourtResearchMode.pregame)
                    Text("Live").tag(CourtResearchMode.live)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Brand.surface(for: scheme))
            }
            switch state {
            case .loading:
                ProgressView("Loading NBA research")
                    .listRowBackground(Brand.surface(for: scheme))
            case .slate(let games):
                slateRows(games)
            case .board(let board, let observedAt):
                if board.oddsMode == mode { boardSections(board, observedAt: observedAt) }
            case .denied:
                ContentUnavailableView {
                    Label("Court access required", systemImage: "lock")
                } description: {
                    Text("The full NBA slate requires Ultimate membership.")
                } actions: {
                    NavigationLink("View featured matchup") { CourtView(scope: .featured) }
                }
                .listRowBackground(Brand.surface(for: scheme))
            case .unavailable:
                ContentUnavailableView {
                    Label("Research unavailable", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .navigationTitle("The Court")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: requestKey) { await load() }
        .refreshable { revision += 1 }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { revision += 1 }
        }
    }

    @ViewBuilder
    private func slateRows(_ games: [CourtBoard.Game]) -> some View {
        if case .member(let account, let userID) = scope {
            Section("NBA slate") {
                if games.isEmpty { Text("No NBA games for this date.") }
                ForEach(games) { game in
                    NavigationLink {
                        CourtView(scope: .game(game, account, userID))
                    } label: {
                        matchup(game)
                    }
                }
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    @ViewBuilder
    private func boardSections(_ board: CourtBoard, observedAt: Date) -> some View {
        Section("NBA matchup · \(board.game.date)") {
            matchup(board.game, showScore: board.oddsMode == .live)
            if board.oddsMode == .live {
                Label(board.game.isFinal ? "Final score" : "Live research", systemImage: "waveform")
                if board.game.isInProgress {
                    LabeledContent("Checked", value: observedAt.formatted(date: .omitted, time: .standard))
                }
            } else if board.isFrozen {
                Label("Saved pregame snapshot", systemImage: "clock")
            }
            if !board.issues.isEmpty {
                Text("Some research is unavailable for this matchup.")
                    .foregroundStyle(.secondary)
            }
        }
        .listRowBackground(Brand.surface(for: scheme))

        if board.hasUsableResearch {
            ForEach([board.game.visitorTeam, board.game.homeTeam], id: \.id) { team in
                Section(team.fullName) {
                    let players = board.players.filter { $0.team.id == team.id }
                    if players.isEmpty { Text("No pregame player data available.") }
                    ForEach(players) { player in
                        NavigationLink {
                            CourtPlayerView(
                                player: player, game: board.game, mode: board.oddsMode,
                                frozen: board.isFrozen, tip: board.tip, observedAt: observedAt
                            )
                        } label: {
                            CourtPlayerIdentity(player: player)
                        }
                    }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        } else {
            Text(board.oddsMode == .live ? "Live research isn’t available for this matchup." : "A verified pregame snapshot is unavailable.")
                .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func matchup(_ game: CourtBoard.Game, showScore: Bool = false) -> some View {
        let visible = showScore && (game.isInProgress || game.isFinal)
        return VStack(alignment: .leading, spacing: 8) {
            team(game.visitorTeam, role: "Away", score: visible ? game.visitorTeamScore : nil)
            team(game.homeTeam, role: "Home", score: visible ? game.homeTeamScore : nil)
        }
    }

    private func team(_ team: CourtBoard.Team, role: String, score: Int?) -> some View {
        HStack {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 28, height: 28)
            Text(team.fullName)
                .fontWeight(.semibold)
            Spacer()
            if let score {
                Text(score.formatted()).monospacedDigit()
                    .accessibilityLabel("\(score) points, \(role)")
            } else {
                Text(role).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func load() async {
        state = .loading
        let requested = requestKey
        do {
            switch scope {
            case .member(let account, let userID):
                let games = try await api.slate(date: requested.date, account: account, userID: userID)
                try Task.checkCancellation()
                state = .slate(games)
            case .featured:
                try await show(api.featuredBoard(mode: requested.mode))
            case .game(let game, let account, let userID):
                try await show(api.memberBoard(game: game, mode: requested.mode, account: account, userID: userID))
            }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 {
            if !Task.isCancelled { state = .denied }
        } catch {
            if !Task.isCancelled { state = .unavailable }
        }
    }

    private func show(_ board: CourtBoard) async throws {
        try Task.checkCancellation()
        state = .board(board, .now)
        if board.oddsMode == .pregame, !board.isFrozen, let tip = board.tip, tip > .now {
            try await Task.sleep(for: .seconds(max(0, tip.timeIntervalSinceNow)))
            revision += 1
        }
    }
}
