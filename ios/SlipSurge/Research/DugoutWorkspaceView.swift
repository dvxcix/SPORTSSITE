import SwiftUI

struct DugoutWorkspaceView: View {
    let api: DugoutAPI
    let initialGameID: Int?
    let initialGameKey: String?
    let initialPanel: DugoutWorkspaceGame.Panel?
    let initialPlayer: Int?
    @State var date: Date
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var choice: Int?
    @State private var ignoresInitialGame = false
    @State private var showsGames = false
    @State private var result: Rollup?

    private struct Rollup {
        let day: String
        let content: Result<DugoutBoard, any Error>
    }

    var body: some View {
        let day = SlateDate.key(date)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                ResearchSlateControls(date: $date)
                if let result, result.day == day {
                    switch result.content {
                    case .success(let board): slate(board)
                    case .failure(let error):
                        ResearchToolMessage(title: "Research slate couldn’t load", error: error) { Task { await load(day) } }
                    }
                } else {
                    ProgressView("Loading research slate").frame(maxWidth: .infinity).padding(.vertical, 24)
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Research Workspace")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: day) { await load(day) }
        .refreshable { await load(day) }
        .onChange(of: day) { choice = nil; ignoresInitialGame = true; showsGames = false }
    }

    @ViewBuilder private func slate(_ board: DugoutBoard) -> some View {
        if board.batterCostAccess != true {
            ContentUnavailableView("Ultimate access required", systemImage: "lock")
        } else if board.games.isEmpty {
            ContentUnavailableView("No games on this slate", systemImage: "calendar",
                description: Text("Choose another date to review its pregame research."))
        } else {
            let game = activeGame(board.games)
            Button {
                showsGames = true
            } label: {
                HStack {
                    if let game {
                        ResearchMatchup(away: game.away.matchup, home: game.home.matchup,
                            subtitle: lineupStatus(game), fullWidth: true)
                    } else {
                        Label("Choose a game", systemImage: "baseball.diamond").frame(maxWidth: .infinity, minHeight: 52)
                    }
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold)).padding(.trailing, 12)
                }
            }
            .buttonStyle(SlipSurgePressStyle())
            .accessibilityLabel(game.map { "\($0.away.name) at \($0.home.name), choose a game" } ?? "Choose a game")
            .sensoryFeedback(.selection, trigger: game?.id)
            .sheet(isPresented: $showsGames) { selector(board.games, active: game?.id) }
            if let game {
                DugoutWorkspaceGame(api: api, day: board.date, game: game,
                    initialPanel: ignoresInitialGame ? nil : initialPanel, initialPlayer: ignoresInitialGame ? nil : initialPlayer)
                    .id("\(board.date):\(game.id)")
            } else {
                ContentUnavailableView("Matchup unavailable on this slate", systemImage: "baseball.diamond")
            }
        }
    }

    private func activeGame(_ games: [DugoutBoard.Game]) -> DugoutBoard.Game? {
        if let choice { return games.first { $0.id == choice } }
        if !ignoresInitialGame, let initialGameID { return games.first { $0.id == initialGameID } }
        if !ignoresInitialGame, let initialGameKey { return games.first { $0.key == initialGameKey } }
        return games.first
    }

    private func selector(_ games: [DugoutBoard.Game], active: Int?) -> some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 9) {
                    ForEach(games) { game in
                        Button {
                            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) {
                                choice = game.id
                                ignoresInitialGame = true
                                showsGames = false
                            }
                        } label: {
                            ResearchMatchup(away: game.away.matchup, home: game.home.matchup,
                                subtitle: lineupStatus(game), selected: game.id == active, fullWidth: true)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityAddTraits(game.id == active ? .isSelected : [])
                    }
                }.padding(16)
            }
            .background(Brand.background(for: scheme))
            .navigationTitle("Choose a game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showsGames = false } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func lineupStatus(_ game: DugoutBoard.Game) -> String {
        let status = game.awayLineupConfirmed && game.homeLineupConfirmed ? "Confirmed" : "Projected"
        return "\(game.statusLabel()) · \(status)"
    }

    private func load(_ day: String) async {
        do {
            let board = try await api.board(date: day, mode: .pregame)
            try Task.checkCancellation()
            guard SlateDate.key(date) == day else { return }
            result = Rollup(day: day, content: .success(board))
        } catch {
            if !Task.isCancelled, SlateDate.key(date) == day { result = Rollup(day: day, content: .failure(error)) }
        }
    }
}
