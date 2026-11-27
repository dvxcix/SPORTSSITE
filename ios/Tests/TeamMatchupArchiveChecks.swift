@main
struct TeamMatchupArchiveChecks {
    static func main() {
        let away = MatchupArchive.Team(team: "DEN", games: [
            game("a", score: 27, allowed: 24, spread: -3, total: 51),
            game("b", score: 31, allowed: 20, spread: -7.5, total: 50.5),
            game("c", score: 18, allowed: 23, spread: 4.5, total: 44),
            game("d", score: 24, allowed: 10, spread: nil, total: nil),
            game("old", season: 2025, score: 50, allowed: 3, spread: nil, total: nil)
        ])
        let grades = MatchupArchive.grades(away, benchmark: "fanduel", normalize: { $0.lowercased() })
        precondition(MatchupArchive.Record(grades, result: \.spreadResult).display == "1–1–1")
        precondition(MatchupArchive.Record(grades, result: \.totalResult).display == "1–1–1")
        precondition(MatchupArchive.Record(grades, result: \.spreadResult).count == 3)
        let uncovered = MatchupArchive.grades(away, benchmark: "betmgm", normalize: { $0.lowercased() })
        precondition(MatchupArchive.Record(uncovered, result: \.spreadResult).count == 0)

        let home = MatchupArchive.Team(team: "PIT", games: (1...4).map { game(String($0), score: 22, allowed: 24, spread: nil, total: nil) })
        let archive = MatchupArchive(league: .nfl, game: "example", date: "2026-11-27",
            season: 2026, cutoffAt: "2026-11-27T20:00:00Z", away: away, home: home)
        guard let projection = archive.footballProjection else { preconditionFailure("Expected four eligible finals") }
        precondition(projection.away.games == 4)
        precondition(projection.awayScore == 24.5 && projection.homeScore == 20.625)
        precondition(MatchupArchive.FootballProjection.TeamRates(games: Array(home.games.prefix(3)), season: 2026) == nil)
        print("Team matchup archive checks passed")
    }

    private static func game(_ id: String, season: Int = 2026, score: Int, allowed: Int,
                             spread: Double?, total: Double?) -> MatchupArchive.Game {
        .init(id: id, date: "2026-11-01", season: season, opponent: "BUF", home: true,
            scored: score, allowed: allowed, observedAt: nil, readFailed: false,
            lines: [.init(vendor: "FanDuel", spread: spread, total: total)])
    }
}
