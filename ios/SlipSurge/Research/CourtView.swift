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
        case board(CourtBoard)
        case denied
        case unavailable
    }

    let scope: Scope
    private let api = CourtAPI()
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var date = Date.now
    @State private var revision = 0
    @State private var state = State.loading

    var body: some View {
        List {
            if case .member = scope {
                DatePicker("Slate date", selection: $date, in: ...Date.now, displayedComponents: .date)
                    .environment(\.timeZone, SlateDate.zone)
                    .listRowBackground(Brand.surface(for: scheme))
            }
            switch state {
            case .loading:
                ProgressView("Loading NBA research")
                    .listRowBackground(Brand.surface(for: scheme))
            case .slate(let games):
                slateRows(games)
            case .board(let board):
                boardSections(board)
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
        .task(id: revision) { await load() }
        .refreshable { revision += 1 }
        .onChange(of: date) { _, _ in revision += 1 }
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
    private func boardSections(_ board: CourtBoard) -> some View {
        Section("NBA matchup · \(board.game.date)") {
            matchup(board.game)
            if board.isFrozen {
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
                            CourtPlayerView(player: player, game: board.game, frozen: board.isFrozen, tip: board.tip)
                        } label: {
                            CourtPlayerIdentity(player: player)
                        }
                    }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        } else {
            Text("A verified pregame snapshot is unavailable.")
                .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func matchup(_ game: CourtBoard.Game) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            team(game.visitorTeam, role: "Away")
            team(game.homeTeam, role: "Home")
        }
    }

    private func team(_ team: CourtBoard.Team, role: String) -> some View {
        HStack {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 28, height: 28)
            Text(team.fullName)
                .fontWeight(.semibold)
            Spacer()
            Text(role).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        state = .loading
        do {
            switch scope {
            case .member(let account, let userID):
                let games = try await api.slate(date: SlateDate.key(date), account: account, userID: userID)
                try Task.checkCancellation()
                state = .slate(games)
            case .featured:
                try await show(api.featuredBoard())
            case .game(let game, let account, let userID):
                try await show(api.memberBoard(game: game, account: account, userID: userID))
            }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 {
            if !Task.isCancelled { state = .denied }
        } catch {
            if !Task.isCancelled { state = .unavailable }
        }
    }

    private func show(_ board: CourtBoard) async throws {
        try Task.checkCancellation()
        state = .board(board)
        if !board.isFrozen, let tip = board.tip, tip > .now {
            try await Task.sleep(for: .seconds(max(0, tip.timeIntervalSinceNow)))
            revision += 1
        }
    }
}
