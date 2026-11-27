import Foundation

struct MatchupArchiveAPI {
    let account: AccountStore
    let user: UUID

    func read(_ league: MatchupArchive.League, game: String, date: String,
              away: String, home: String) async throws -> MatchupArchive {
        let query = [URLQueryItem(name: "league", value: league.rawValue), .init(name: "game", value: game), .init(name: "date", value: date)]
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/research/matchup-archive", query: query,
            account: account, userID: user, timeout: 42)
        guard data.count <= 196_608 else { throw URLError(.cannotParseResponse) }
        let archive = try JSONDecoder().decode(MatchupArchive.self, from: data)
        guard archive.league == league, archive.game == game, archive.date == date,
              archive.away.team == away, archive.home.team == home,
              SidelineBoard.timestamp(archive.cutoffAt) != nil,
              [archive.away, archive.home].allSatisfy({ team in
                  team.games.count <= 10 && Set(team.games.map(\.id)).count == team.games.count &&
                  team.games.allSatisfy { $0.date < date && $0.id != game && $0.lines.count <= 128 }
              }) else { throw URLError(.cannotParseResponse) }
        return archive
    }
}
