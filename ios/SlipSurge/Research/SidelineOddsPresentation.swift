import SwiftUI

extension SidelineBoard {
    private struct ResultKey: Hashable {
        let game: String
        let player: Int
        let team: String
    }

    private struct PickKey: Hashable {
        let result: ResultKey
        let line: Double
    }

    var scorerLabel: String? {
        switch market {
        case "anytime_td": "Anytime Touchdown"
        case "first_td": "First Touchdown"
        default: nil
        }
    }

    var oddsSlate: ResearchOddsSlate {
        let portraits = Dictionary(identities.map { ($0.player, $0.urls) }, uniquingKeysWith: { first, _ in first })
        let visuals = Dictionary(teams.map { ("\($0.game):\($0.abbreviation)", $0) }, uniquingKeysWith: { first, _ in first })
        let matchups = games.map { game in
            let team = { (name: String) -> ResearchMatchup.Team in
                let visual = visuals["\(game.id):\(name)"]
                return .init(name: name, logo: visual?.logo, color: Color(hex: visual?.primary) ?? Color(rgb: 0x263542),
                    secondary: Color(hex: visual?.secondary))
            }
            return ResearchOddsSlate.Game(id: game.id, title: "\(game.away) at \(game.home)", away: team(game.away), home: team(game.home))
        }
        let eligible = quotes.filter { !availabilityUnavailable.contains($0.id.player.game) }
        let groups = Dictionary(grouping: eligible) {
            let player = $0.id.player
            return ResultKey(game: player.game, player: player.id, team: player.team)
        }
        let finals = Dictionary(grouping: finals ?? []) { ResultKey(game: $0.game, player: $0.playerID, team: $0.team) }
        let pickCounts = Dictionary(grouping: (picks ?? []).filter { $0.market == market && $0.book == book && (0...10_000_000).contains($0.count) }) {
            PickKey(result: ResultKey(game: $0.game, player: $0.playerID, team: $0.team), line: $0.line)
        }
        let rows = groups.compactMap { key, offers -> ResearchOddsSlate.Player? in
            guard let quote = offers.first, offers.allSatisfy({ $0.id.player == quote.id.player }),
                  Set(offers.map(\.id.line)).count == offers.count else { return nil }
            let player = quote.id.player
            let team = visuals["\(player.game):\(player.team)"]
            let values = Set(finals[key]?.map(\.value) ?? [])
            let final = values.count == 1 ? values.first : nil
            let prices = offers.map { item -> ResearchOddsSlate.Price in
                let counts = pickCounts[PickKey(result: key, line: item.id.line)] ?? []
                let saved = counts.count == 1 ? counts.first : nil
                return item.oddsPrice(result: final.map { $0 >= item.id.line }, picks: saved?.count, estimated: saved?.estimated == true)
            }
            let status = final.map { value in
                market == "first_td" ? (value == 1 ? "First touchdown" : "Not first touchdown") : "Final \(value.formatted())"
            }
            return .init(gameID: player.game, playerID: player.id, name: player.name,
                team: .init(code: player.team, name: player.team), position: quote.position,
                portraits: portraits[player] ?? [], logo: team?.logo, primary: Color(hex: team?.primary) ?? Color(rgb: 0x263542),
                secondary: Color(hex: team?.secondary) ?? Color(rgb: 0x141C25), prices: prices, status: status)
        }
        var notices: [String] = []
        if games.contains(where: { $0.status != "ready" }) { notices.append("Some games have incomplete or unavailable prices.") }
        if !availabilityUnavailable.isEmpty { notices.append("Prices are withheld while player availability is verified.") }
        return .init(games: matchups, players: rows, books: books, notices: notices)
    }

}

extension SidelineBoard.Quote {
    func oddsPrice(result: Bool? = nil, picks: Int? = nil, estimated: Bool = false) -> ResearchOddsSlate.Price {
        .init(line: id.line, current: price, opening: verifiedPrice(openingConflict ? nil : openingPrice),
            earlier: verifiedPrice(previousPrice), observedAt: observedAt, earlierAt: previousObservedAt,
            result: result, picks: picks, estimated: estimated)
    }

    private func verifiedPrice(_ value: Int?) -> Int? {
        value.flatMap { abs(Double($0)) >= 100 ? $0 : nil }
    }
}
