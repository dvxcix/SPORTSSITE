import SwiftUI

struct CourtMatchupHistory: View {
    let api: MatchupArchiveAPI
    let game: CourtBoard.Game
    let away: ResearchMatchup.Team
    let home: ResearchMatchup.Team
    let benchmark: String
    let revision: Int
    @Environment(\.slipPalette) private var palette
    @State private var expanded = false
    @State private var archive: MatchupArchive?
    @State private var failure = false
    @State private var retry = 0

    private struct Request: Equatable {
        let game: Int
        let date: String
        let revision: Int
        let retry: Int
    }

    var body: some View {
        DisclosureGroup("Last 10 games", isExpanded: $expanded) {
            Group {
                if let archive, archive.game == String(game.id), archive.date == game.date {
                    MatchupHistory(archive: archive, away: away, home: home, benchmark: benchmark)
                } else if failure {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Archived results couldn’t load.").font(.subheadline).foregroundStyle(.secondary)
                        Button("Retry") { retry += 1 }.buttonStyle(.bordered)
                    }
                } else {
                    ProgressView("Loading archived games").padding(.vertical, 8)
                }
            }
            .padding(.top, 10)
            .task(id: Request(game: game.id, date: game.date, revision: revision, retry: retry)) { await load() }
        }
        .padding(14)
        .background(palette.surface, in: .rect(cornerRadius: 14))
    }

    private func load() async {
        failure = false
        do {
            let result = try await api.read(.nba, game: String(game.id), date: game.date, away: away.name, home: home.name)
            try Task.checkCancellation()
            archive = result
        } catch {
            if !Task.isCancelled { failure = true }
        }
    }
}
