import SwiftUI

struct CourtMatrixBoard<Content: View>: View {
    private struct Request: Equatable {
        let game: Int
        let mode: CourtResearchMode
        let observation: String?
        let revision: Int
        let retry: Int
    }

    let api: MatricesAPI
    let board: CourtBoard
    let revision: Int
    let manage: () -> Void
    @ViewBuilder let content: ([Int: [CourtMatrixResults.Match]], String?) -> Content
    @Environment(\.slipPalette) private var slipPalette
    @State private var result: (Request, CourtMatrixResults)?
    @State private var issue = false
    @State private var retry = 0
    @State private var selection = ""

    private var request: Request {
        .init(game: board.game.id, mode: board.oddsMode, observation: board.observationID, revision: revision, retry: retry)
    }

    var body: some View {
        let current = result.flatMap { $0.0 == request ? $0.1 : nil }
        let matches = current?.matches ?? []
        let matchIDs = Dictionary(grouping: matches.flatMap { match in match.playerIds.map { ($0, match) } }, by: \.0)
            .mapValues { $0.map(\.1) }
        let filter = matches.contains { $0.id == selection } ? selection : nil
        VStack(alignment: .leading, spacing: 9) {
            if !matches.isEmpty {
                ResearchToolCard(color: slipPalette.accent) {
                    Label("NBA Matrices", systemImage: "square.grid.3x3").font(.headline)
                    Spacer()
                    Button("Manage", action: manage).font(.subheadline.weight(.semibold))
                } content: {
                    ResearchArtworkPicker(title: "NBA Matrix", options: [.init(id: "", title: "All players", icon: "person.2")]
                        + matches.map { .init(id: $0.id, title: "\($0.name) · \($0.playerIds.count)", icon: "square.grid.3x3") },
                        selection: $selection)
                    if let message = current?.unavailable, !message.isEmpty {
                        Text(message.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .sensoryFeedback(.selection, trigger: selection)
            } else if issue {
                Button("Retry NBA Matrices", systemImage: "arrow.clockwise") { retry += 1 }
                    .buttonStyle(.bordered)
            }
            content(matchIDs, filter)
        }
        .task(id: request) { await load(request) }
    }

    private func load(_ request: Request) async {
        selection = ""
        issue = false
        do {
            let matches = try await api.nbaMatches(gameID: request.game, mode: request.mode)
            try Task.checkCancellation()
            result = (request, matches)
        } catch {
            if !Task.isCancelled { issue = true }
        }
    }
}
