import SwiftUI

struct CourtLineupView: View {
    private struct Lineups: Decodable {
        struct Team: Decodable {
            struct Player: Decodable, Identifiable {
                let id: Int
                let firstName: String
                let lastName: String
                let position: String?
            }

            let teamId: Int
            let status: String
            let source: String
            let observedAt: String
            let players: [Player]
        }

        let gameId: Int
        let mode: CourtResearchMode
        let cutoffAt: String
        let teams: [Team]
        let unavailable: Bool
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let observedAt: Date
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @State private var value: Lineups?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let value {
                if value.unavailable {
                    Label("Some lineup observations are unavailable.", systemImage: "info.circle")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach([board.game.visitorTeam, board.game.homeTeam], id: \.id) { team in
                    lineup(team, data: value)
                }
            } else {
                ResearchToolMessage(title: "Lineups couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: "\(revision):\(retry)") {
            await load()
            while !Task.isCancelled && (board.oddsMode == .live && !board.game.isFinal || (board.tip.map { $0 > .now } ?? false)) {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                await load()
            }
        }
    }

    private func lineup(_ team: CourtBoard.Team, data: Lineups) -> some View {
        let palette = CourtTeamColors.colors(for: team.abbreviation)
        let teamLineup = data.teams.first { valid($0, team: team, data: data) }
        return ResearchToolCard(color: palette.primary) {
            HStack {
                ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 27, height: 27)
                Text(team.fullName).font(.headline)
            }
        } content: {
            if let teamLineup {
                let status = teamLineup.status == "actual" ? "Actual starters" :
                    teamLineup.status == "confirmed" ? "Confirmed pregame" : "Expected lineup"
                Label(status, systemImage: teamLineup.status == "expected" ? "clock" : "checkmark.seal")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(teamLineup.status == "expected" ? .secondary : Brand.accent(for: scheme))
                if let date = SidelineBoard.timestamp(teamLineup.observedAt) {
                    Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(teamLineup.players) { entry in
                    if let player = board.players.first(where: { $0.id == entry.id && $0.team.id == team.id }) {
                        NavigationLink {
                            CourtPlayerView(player: player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                                tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason, researchScope: scope)
                        } label: {
                            CourtPlayerIdentity(player: player)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(SlipSurgePressStyle())
                    } else {
                        ResearchToolPortrait(name: "\(entry.firstName) \(entry.lastName)", subtitle: entry.position ?? team.abbreviation,
                            portraits: [], teamLogo: team.logo, primary: palette.primary, secondary: palette.secondary)
                    }
                }
            } else {
                Text(board.oddsMode == .pregame ? "No pre-tip lineup recorded." : "Actual starters haven’t been reported.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func valid(_ lineup: Lineups.Team, team: CourtBoard.Team, data: Lineups) -> Bool {
        guard lineup.teamId == team.id, lineup.players.count == 5, Set(lineup.players.map(\.id)).count == 5,
              let at = SidelineBoard.timestamp(lineup.observedAt), let reported = SidelineBoard.timestamp(data.cutoffAt),
              let tip = board.tip else { return false }
        if lineup.source == "game" { return board.oddsMode == .live && lineup.status == "actual" }
        return lineup.source == "pregame" && at < min(tip, reported)
    }

    private func load() async {
        do {
            let data = try await CourtToolAPI(scope: scope).read(Lineups.self, tool: "lineups", publicPath: "/the-paint/lineups", query: [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue)
            ])
            guard !Task.isCancelled else { return }
            guard data.gameId == board.game.id, data.mode == board.oddsMode, data.teams.count <= 2 else {
                throw URLError(.cannotParseResponse)
            }
            value = data
        } catch {
            if !Task.isCancelled { value = nil; self.error = error }
        }
    }
}
