import Foundation

struct MatchupArchive: Decodable {
    enum League: String, Decodable {
        case nba, nfl
    }

    struct Team: Decodable {
        let team: String
        let games: [Game]
    }

    struct Game: Decodable, Identifiable {
        struct Line: Decodable {
            let vendor: String
            let spread: Double?
            let total: Double?
        }

        let id: String
        let date: String
        let season: Int
        let opponent: String
        let home: Bool
        let scored: Int
        let allowed: Int
        let observedAt: String?
        let readFailed: Bool
        let lines: [Line]
    }

    let league: League
    let game: String
    let date: String
    let season: Int
    let cutoffAt: String
    let away: Team
    let home: Team

    struct Grade {
        let game: Game
        let spread: Double?
        let total: Double?

        var spreadResult: Int? { spread.map { Self.result(Double(game.scored - game.allowed) + $0) } }
        var totalResult: Int? { total.map { Self.result(Double(game.scored + game.allowed) - $0) } }

        private static func result(_ edge: Double) -> Int {
            abs(edge) < 0.001 ? 0 : (edge > 0 ? 1 : -1)
        }
    }

    struct Record {
        let above: Int
        let below: Int
        let pushes: Int

        init(_ grades: [Grade], result: KeyPath<Grade, Int?>) {
            let observed = grades.compactMap { $0[keyPath: result] }
            above = observed.count { $0 == 1 }
            below = observed.count { $0 == -1 }
            pushes = observed.count { $0 == 0 }
        }

        var count: Int { above + below + pushes }
        var display: String { count == 0 ? "—" : "\(above)–\(below)–\(pushes)" }
    }

    static func grades(_ team: Team, benchmark: String, normalize: (String) -> String) -> [Grade] {
        team.games.map { game in
            var used = Set<String>()
            let lines = game.lines.filter { line in
                let book = normalize(line.vendor)
                return !book.isEmpty && (benchmark == "consensus" || book == normalize(benchmark)) && used.insert(book).inserted
            }
            return Grade(game: game, spread: GameMarketComparison.Sample(lines.compactMap(\.spread))?.value,
                total: GameMarketComparison.Sample(lines.compactMap(\.total))?.value)
        }
    }

    struct FootballProjection {
        struct TeamRates {
            let games: Int
            let scored: Double
            let allowed: Double

            init?(games: [Game], season: Int) {
                let finals = games.filter { $0.season == season }
                guard finals.count >= 4 else { return nil }
                self.games = finals.count
                scored = Double(finals.reduce(0) { $0 + $1.scored }) / Double(finals.count)
                allowed = Double(finals.reduce(0) { $0 + $1.allowed }) / Double(finals.count)
            }
        }

        let away: TeamRates
        let home: TeamRates
        var awayScore: Double { (away.scored + home.allowed) / 2 }
        var homeScore: Double { (home.scored + away.allowed) / 2 }
        var total: Double { awayScore + homeScore }
        var margin: Double { homeScore - awayScore }
    }

    var footballProjection: FootballProjection? {
        guard league == .nfl, let away = FootballProjection.TeamRates(games: away.games, season: season),
              let home = FootballProjection.TeamRates(games: home.games, season: season) else { return nil }
        return .init(away: away, home: home)
    }
}
