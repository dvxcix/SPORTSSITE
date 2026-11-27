struct GameMarketBook: Decodable, Identifiable {
    let vendor: String
    let moneylineAway: Int?
    let moneylineHome: Int?
    let spreadAway: Double?
    let spreadHome: Double?
    let spreadAwayOdds: Int?
    let spreadHomeOdds: Int?
    let total: Double?
    let totalOverOdds: Int?
    let totalUnderOdds: Int?
    let updatedAt: String?
    let isOpeningOnly: Bool?

    var id: String { vendor }
}
