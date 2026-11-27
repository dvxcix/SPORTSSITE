import Foundation

struct CourtGameProjection {
    struct TeamRates {
        let pace: Double
        let offense: Double
        let defense: Double

        init?(pace: Double?, offense: Double?, defense: Double?) {
            guard let pace, let offense, let defense,
                  (50...150).contains(pace), (40...170).contains(offense), (40...170).contains(defense) else { return nil }
            self.pace = pace
            self.offense = offense
            self.defense = defense
        }
    }

    let away: TeamRates
    let home: TeamRates

    var possessions: Double { (away.pace + home.pace) / 2 }
    var awayRate: Double { (away.offense + home.defense) / 2 }
    var homeRate: Double { (home.offense + away.defense) / 2 }
    var awayScore: Double { possessions * awayRate / 100 }
    var homeScore: Double { possessions * homeRate / 100 }
    var homeMargin: Double { homeScore - awayScore }
    var total: Double { homeScore + awayScore }
}

struct CourtGameMarketComparison {
    struct Sample {
        let value: Double
        let count: Int
        let range: ClosedRange<Double>

        init?(_ values: [Double]) {
            let ordered = values.sorted()
            guard let minimum = ordered.first, let maximum = ordered.last else { return nil }
            let middle = ordered.count / 2
            value = ordered.count.isMultiple(of: 2) ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle]
            count = ordered.count
            range = minimum...maximum
        }
    }

    let homeSpread: Sample?
    let total: Sample?
    let homeMoneylineProbability: Sample?

    init(offers: [GameMarketBook], impliedProbability: (Int) -> Double) {
        homeSpread = Sample(offers.compactMap { book in
            guard let home = book.spreadHome, let away = book.spreadAway,
                  (-100...100).contains(home), (-100...100).contains(away), abs(home + away) < 0.001 else { return nil }
            return home
        })
        total = Sample(offers.compactMap { book in
            guard let total = book.total, (50...500).contains(total) else { return nil }
            return total
        })
        homeMoneylineProbability = Sample(offers.compactMap { book in
            guard let home = book.moneylineHome, let away = book.moneylineAway,
                  abs(Double(home)) >= 100, abs(Double(away)) >= 100 else { return nil }
            let homePrice = impliedProbability(home)
            let awayPrice = impliedProbability(away)
            guard (0...1).contains(homePrice), (0...1).contains(awayPrice), homePrice + awayPrice > 0 else { return nil }
            return homePrice / (homePrice + awayPrice)
        })
    }
}
