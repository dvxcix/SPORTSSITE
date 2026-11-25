import Foundation

struct CommunityPagesAPI {
    struct Page: Decodable, Identifiable {
        let id: UUID
        let ownerId: UUID
        let name: String
        let slug: String
        let description: String?
        let category: String?
        let sport: String?
        let emoji: String?
        let avatarUrl: String?
        let bannerUrl: String?
        let isVerified: Bool?
        let isPublished: Bool?
        let followerCount: Int?
        let createdAt: String?

        var avatarArtwork: URL? { avatarUrl.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil } }
        var bannerArtwork: URL? { bannerUrl.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil } }
    }

    struct Detail: Decodable {
        let page: Page
        let owner: Bool
        let following: Bool
        let allowMlb: Bool
        let posts: [FeedPost]
        let next: String?
    }

    struct Follow: Decodable { let following: Bool; let followerCount: Int }

    struct Draft: Encodable {
        let page: Page?
        let id: UUID
        var name: String
        var description: String
        var category: String
        var sport: String
        var emoji: String
        var banner: String
        var avatar: String
        var published: Bool

        init(page: Page? = nil) {
            self.page = page
            id = page?.id ?? UUID()
            name = page?.name ?? ""
            description = page?.description ?? ""
            category = page?.category ?? ""
            sport = page?.sport ?? ""
            emoji = page?.emoji ?? "⭐"
            avatar = page?.avatarUrl ?? ""
            banner = page?.bannerUrl ?? ""
            published = page?.isPublished ?? true
        }

        private enum CodingKeys: String, CodingKey { case action, id, name, description, category, sport, emoji, banner, avatar, published, expected }
        private enum Existing: String, CodingKey {
            case name, description, category, sport, emoji
            case banner = "banner_url", avatar = "avatar_url", published = "is_published"
        }

        func encode(to encoder: any Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(page == nil ? "create" : "settings", forKey: .action)
            try values.encode(id.uuidString.lowercased(), forKey: .id)
            try values.encode(name, forKey: .name)
            try values.encode(description, forKey: .description)
            try values.encode(category, forKey: .category)
            try values.encode(sport, forKey: .sport)
            try values.encode(emoji, forKey: .emoji)
            try values.encode(banner, forKey: .banner)
            try values.encode(avatar, forKey: .avatar)
            try values.encode(published, forKey: .published)
            if let page {
                var expected = values.nestedContainer(keyedBy: Existing.self, forKey: .expected)
                try expected.encode(page.name, forKey: .name)
                try expected.encode(page.description, forKey: .description)
                try expected.encode(page.category, forKey: .category)
                try expected.encode(page.sport, forKey: .sport)
                try expected.encode(page.emoji, forKey: .emoji)
                try expected.encode(page.bannerUrl, forKey: .banner)
                try expected.encode(page.avatarUrl, forKey: .avatar)
                try expected.encode(page.isPublished, forKey: .published)
            }
        }
    }

    let viewer: DiscoverAPI
    private static let path = "/api/mobile/pages"

    func available() async -> Bool {
        struct Access: Decodable { let enabled: Bool }
        guard viewer.userID != nil else { return false }
        return (try? await viewer.readPublic(Access.self, path: Self.path, query: [.init(name: "view", value: "access")]))?.enabled == true
    }

    func pages(category: String, mine: Bool) async throws -> [Page] {
        struct Result: Decodable { let pages: [Page] }
        var query: [URLQueryItem] = [.init(name: "view", value: mine ? "mine" : "index")]
        if !category.isEmpty { query.append(.init(name: "category", value: category)) }
        return try await viewer.readPublic(Result.self, path: Self.path, query: query).pages
    }

    func detail(_ slug: String, after: String? = nil) async throws -> Detail {
        var query: [URLQueryItem] = [.init(name: "view", value: "detail"), .init(name: "slug", value: slug)]
        if let after { query.append(.init(name: "after", value: after)) }
        let result = try await viewer.readPublic(Detail.self, path: Self.path, query: query)
        guard result.page.slug == slug else { throw URLError(.badServerResponse) }
        return result
    }

    func save(_ draft: Draft) async throws -> Page {
        struct Result: Decodable { let page: Page }
        let response = try await viewer.write(Result.self, path: Self.path, body: draft, keyDecodingStrategy: .convertFromSnakeCase)
        guard response.page.id == draft.id else { throw URLError(.badServerResponse) }
        return response.page
    }

    func follow(_ following: Bool, page id: UUID) async throws -> Follow {
        struct Change: Encodable { let action = "follow"; let id: String; let following: Bool }
        return try await viewer.write(Follow.self, path: Self.path, body: Change(id: id.uuidString.lowercased(), following: following),
            keyDecodingStrategy: .convertFromSnakeCase)
    }

    func delete(_ id: UUID) async throws {
        struct Receipt: Decodable { let id: UUID }
        let receipt = try await viewer.write(Receipt.self, path: Self.path, body: ["action": "delete", "id": id.uuidString.lowercased()])
        guard receipt.id == id else { throw URLError(.badServerResponse) }
    }
}
