import Foundation

struct DiscoverAPI {
    struct Communities: Decodable {
        struct Community: Decodable, Identifiable {
            let id: UUID
            let slug: String
            let name: String
            let description: String?
            let sport: String?
            let avatarUrl: URL?
            let bannerUrl: URL?
            let emoji: String?
            let memberCount: Int?
            let accessType: String
            let price: Double?
            let invitationId: UUID?
            let creatorProductId: UUID?
            let productType: String?
            let billingPeriodDays: Int?
        }

        let groups: [Community]
        let joinedIds: [UUID]
        let invitations: [Community]
    }

    struct LinkedCommunity: Decodable {
        let group: Communities.Community
        let member: Bool
    }

    struct Creators: Decodable {
        struct Creator: Decodable, Identifiable {
            struct Store: Decodable {
                let name: String
                let bio: String?
                let logoUrl: URL?
                let coverUrl: URL?
            }

            struct Product: Decodable, Identifiable {
                let id: String
                let title: String
                let description: String?
                let price: Double
                let currency: String?
                let productType: String?
                let billingPeriodDays: Int?
            }

            let id: UUID
            let username: String
            let displayName: String?
            let avatarUrl: URL?
            let bannerUrl: URL?
            let bio: String?
            let followerCount: Int?
            let isVerified: Bool?
            let creatorProducts: [Product]
            let sports: [String]
            let tags: [String]
            let featured: Bool?
            let storefront: Store?

            var title: String { storefront?.name ?? displayName ?? username }
        }

        let creators: [Creator]
    }

    struct Records: Decodable {
        struct Record: Decodable {
            let wins: Int
            let losses: Int
            let pushes: Int?

            var count: Int { wins + losses }
            var rate: Double? { count > 0 ? Double(wins) / Double(count) : nil }
            var line: String { "\(wins)–\(losses)" + ((pushes ?? 0) > 0 ? "–\(pushes ?? 0)" : "") }
        }

        struct Person: Decodable, Identifiable {
            let id: UUID
            let username: String
            let displayName: String?
            let avatarUrl: URL?
            let isVerified: Bool?
            let avatarRingStyle: String?
            let avatarRingColor: String?
            let accountType: String?
            let followerCount: Int
            let wins: Int
            let losses: Int
            let pushes: Int
            let streak: Int
            let recentResults: [String]
            let thisWeek: Record
            let bySport: [String: Record]

            var allTime: Record { .init(wins: wins, losses: losses, pushes: pushes) }
        }

        let users: [Person]
        let allSports: [String]
    }

    let account: AccountStore
    let userID: UUID?

    func read<Value: Decodable>(_ type: Value.Type, resource: String) async throws -> Value {
        try await readPublic(type, path: "/api/mobile/discover", query: [.init(name: "resource", value: resource)])
    }

    func linkedCommunity(_ slug: String) async throws -> LinkedCommunity {
        try await readPublic(LinkedCommunity.self, path: "/api/mobile/discover",
            query: [.init(name: "resource", value: "communities"), .init(name: "slug", value: slug)])
    }

    func profileID(_ username: String) async throws -> UUID {
        struct Identity: Decodable { let id: UUID }
        struct ProfileResponse: Decodable { let profile: Identity }
        return try await readPublic(ProfileResponse.self, path: "/api/mobile/profiles",
            query: [.init(name: "user", value: username)]).profile.id
    }

    func readPublic<Value: Decodable>(_ type: Value.Type, path: String, query: [URLQueryItem] = []) async throws -> Value {
        let data: Data
        if let userID {
            data = try await SlipSurgeHTTP.memberData(path, query: query, account: account, userID: userID)
        } else {
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path, query: query, timeout: 45)
            data = try await SlipSurgeHTTP.send(request)
        }
        guard data.count <= 3_145_728 else { throw URLError(.cannotParseResponse) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}

enum LeagueArtwork {
    static func logo(_ id: String) -> URL? {
        switch id.lowercased() {
        case "nba", "nfl", "nhl", "mlb": URL(string: "https://a.espncdn.com/i/teamlogos/leagues/500/\(id.lowercased()).png")
        case "soccer", "mls": URL(string: "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png")
        default: nil
        }
    }

    static func label(_ id: String) -> String { id.lowercased() == "soccer" ? "MLS" : id.uppercased() }
}

extension DiscoverAPI {
    func memberRead<Response: Decodable>(_ type: Response.Type, path: String, query: [URLQueryItem] = []) async throws -> Response {
        guard let userID else { throw URLError(.userAuthenticationRequired) }
        let response = try await SlipSurgeHTTP.memberData(path, query: query, account: account, userID: userID)
        return try JSONDecoder().decode(type, from: response)
    }

    func write<Body: Encodable, Response: Decodable>(_ type: Response.Type, path: String, query: [URLQueryItem] = [], body: Body,
        keyDecodingStrategy: JSONDecoder.KeyDecodingStrategy = .useDefaultKeys) async throws -> Response {
        guard let userID else { throw URLError(.userAuthenticationRequired) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path, query: query)
        let access = try await account.accessToken(for: userID)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let response = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = keyDecodingStrategy
        return try decoder.decode(type, from: response)
    }
}
