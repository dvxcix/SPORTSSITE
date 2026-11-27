@main
struct CourtGameProjectionChecks {
    static func main() {
        let away = CourtGameProjection.TeamRates(pace: 98, offense: 114, defense: 112)!
        let home = CourtGameProjection.TeamRates(pace: 102, offense: 118, defense: 108)!
        let projection = CourtGameProjection(away: away, home: home)
        expect(projection.possessions, 100)
        expect(projection.awayScore, 111)
        expect(projection.homeScore, 115)
        expect(projection.homeMargin, 4)
        expect(projection.total, 226)
        precondition(CourtGameProjection.TeamRates(pace: nil, offense: 115, defense: 112) == nil)
        precondition(CourtGameProjection.TeamRates(pace: .nan, offense: 115, defense: 112) == nil)
        precondition(CourtGameProjection.TeamRates(pace: 100, offense: 0, defense: 112) == nil)

        let offers = [
            offer(spread: -4.5, opposingSpread: 4.5, total: 224.5, moneyline: -180, opposingMoneyline: 150),
            offer(spread: -3.5, opposingSpread: 3.5, total: 226, moneyline: -120, opposingMoneyline: 120),
            offer(spread: 0, opposingSpread: 0, total: 225.5, moneyline: -110, opposingMoneyline: -110)
        ]
        let mismatched = offer(spread: -5, opposingSpread: 4, total: .infinity, moneyline: 0, opposingMoneyline: 120)
        let partial = offer(spread: -4, opposingSpread: nil, total: nil, moneyline: -130, opposingMoneyline: nil)
        let median = compare(offers + [mismatched, partial])
        expect(median.homeSpread?.value, -3.5)
        precondition(median.homeSpread?.count == 3 && median.homeSpread?.range == (-4.5...0))
        expect(median.total?.value, 225.5)
        expect(median.homeMoneylineProbability?.value, 6.0 / 11)
        precondition(median.homeMoneylineProbability?.count == 3)

        let even = compare(Array(offers.prefix(2)))
        expect(even.homeSpread?.value, -4)
        expect(even.total?.value, 225.25)
        let pickEm = compare([offers[2]])
        expect(pickEm.homeSpread?.value, 0)
        expect(pickEm.homeMoneylineProbability?.value, 0.5)
        let missing = compare([mismatched, partial])
        precondition(missing.homeSpread == nil && missing.total == nil && missing.homeMoneylineProbability == nil)
        print("Court game projection checks passed")
    }

    private static func expect(_ value: Double?, _ expected: Double) {
        guard let value, abs(value - expected) < 0.001 else {
            preconditionFailure("Expected \(expected), got \(String(describing: value))")
        }
    }

    private static func compare(_ offers: [GameMarketBook]) -> GameMarketComparison {
        GameMarketComparison(offers: offers) { odds in
            let price = Double(odds)
            return price < 0 ? -price / (100 - price) : 100 / (100 + price)
        }
    }

    private static func offer(spread: Double?, opposingSpread: Double?, total: Double?,
                              moneyline: Int?, opposingMoneyline: Int?) -> GameMarketBook {
        .init(vendor: "Test", moneylineAway: opposingMoneyline, moneylineHome: moneyline,
              spreadAway: opposingSpread, spreadHome: spread, spreadAwayOdds: nil, spreadHomeOdds: nil,
              total: total, totalOverOdds: nil, totalUnderOdds: nil, updatedAt: nil, isOpeningOnly: nil)
    }
}
