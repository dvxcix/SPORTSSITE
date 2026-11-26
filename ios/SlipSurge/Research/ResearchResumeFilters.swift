import Foundation

enum ResearchResumeFilters {
    static let queryKey = "iosFilters"

    static func item(_ filter: some Encodable) -> URLQueryItem? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let bytes = try? encoder.encode(filter) else { return nil }
        let encoded = bytes.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
        return URLQueryItem(name: queryKey, value: encoded)
    }

    static func decode<T: Decodable>(_ type: T.Type, from value: String) -> T? {
        guard value.utf8.count <= 650, let bytes = Data(base64Encoded: value
            .replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")) else { return nil }
        return try? JSONDecoder().decode(type, from: bytes)
    }

    struct Odds: Codable, Hashable {
        var game: String?
        var team: String?
        var target: Double?
        var search = ""
        var sort: OddsSort?
        var sortedPriceLine: Double?
        var ascendingPrice = false
        var ascendingName = true
        var comparison = OddsComparison.opening

        func isValid(nfl: Bool) -> Bool {
            let pattern = nfl ? #"^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$"# : #"^[1-9][0-9]{0,9}$"#
            return game.map { $0.range(of: pattern, options: .regularExpression) != nil } != false &&
                team.map { $0.range(of: #"^[A-Z0-9]{2,4}$"#, options: .regularExpression) != nil } != false &&
                [target, sortedPriceLine].compactMap { $0 }.allSatisfy { (-1000...1000).contains($0) } &&
                search.utf8.count <= 160
        }
    }

    struct Players: Codable, Hashable {
        var team = ""
        var position = ""
        var venue = CourtPlayerMarket.Venue.all.rawValue
        var savedOnly = false
        var search = ""

        var isValid: Bool {
            (team.isEmpty || team.range(of: #"^[1-9][0-9]{0,9}$"#, options: .regularExpression) != nil) &&
                ["", "G", "F", "C"].contains(position) && CourtPlayerMarket.Venue(rawValue: venue) != nil &&
                search.utf8.count <= 160
        }
    }

    struct Quotes: Codable, Hashable {
        var books: [String]?
        var sort = ""
        var ascending = true
        var search = ""

        var isValid: Bool {
            let books = books ?? []
            let bookKey = #"^[a-z0-9_]{1,40}$"#
            return books.count <= 32 && Set(books).count == books.count &&
                books.allSatisfy { $0.range(of: bookKey, options: .regularExpression) != nil } &&
                (sort.isEmpty || sort.range(of: bookKey, options: .regularExpression) != nil) && search.utf8.count <= 160
        }
    }

    static func searchTerm(_ value: String) -> String {
        var prefix = value.utf8.prefix(160)
        while String(bytes: prefix, encoding: .utf8) == nil {
            prefix = prefix.dropLast()
        }
        return String(decoding: prefix, as: UTF8.self)
    }
}
