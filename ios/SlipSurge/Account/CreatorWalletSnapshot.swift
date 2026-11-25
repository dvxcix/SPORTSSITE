import Foundation

struct CreatorWalletSnapshot: Decodable {
    struct Balance: Decodable, Identifiable {
        let currency: String
        let available: Decimal
        let pending: Decimal
        let reserved: Decimal
        var id: String { currency }
    }

    struct Payout: Decodable, Identifiable {
        let id: String
        let amount: String
        let net: String?
        let fee: String?
        let markup: String?
        let feePaidBy: String?
        let currency: String
        let status: String
        let createdAt: String
        let arrival: String?

        func amountLabel(_ value: String?) -> String {
            value.flatMap { Decimal(string: $0, locale: Locale(identifier: "en_US_POSIX")) }
                .map { $0.formatted(.currency(code: currency.uppercased())) } ?? "—"
        }
    }

    let balances: [Balance]?
    let payouts: [Payout]?
    let nextCursor: String?
    let checkedAt: String
    let canPayout: Bool
    let state: String
    let balanceError: Bool
    let historyError: Bool
}

struct CreatorRevenueSnapshot: Decodable {
    struct Point: Decodable, Identifiable {
        let date: String
        let amount: Decimal
        var id: String { date }
    }

    let points: [Point]
    let total: Decimal
    let count: Int
    let currency: String
    let currencies: [String]
    let limited: Bool
}
