import Foundation

struct ArticlesAPI {
    struct Article: Decodable, Identifiable {
        struct Author: Decodable {
            let username: String?
            let displayName: String?
            let avatarUrl: URL?
            let avatarRingStyle: String?
            let avatarRingColor: String?
            let isVerified: Bool?
            let bio: String?
        }

        let id: UUID
        let slug: String
        let title: String
        let excerpt: String?
        let content: String?
        let category: String?
        let sport: String?
        let coverImage: URL?
        let status: String?
        let viewCount: Int?
        let likeCount: Int?
        let authorId: UUID?
        let createdAt: String?
        let updatedAt: String?
        let author: Author?
    }

    struct Page: Decodable { let articles: [Article]; let next: String? }
    struct Detail: Decodable { let article: Article; let related: [Article]; let liked: Bool }
    struct Like: Decodable { let liked: Bool; let count: Int }
    struct Receipt: Decodable { let id: UUID; let slug: String; let status: String; let updatedAt: String? }
    struct GeneratedDraft: Decodable { var title: String; var excerpt: String; var content: String }

    struct Draft: Encodable {
        enum Status: String, Encodable { case draft, published }

        let article: Article?
        var identifier: UUID
        var title: String
        var excerpt: String
        var content: String
        var category: String
        var sport: String
        var cover: String
        var status: Status = .draft

        init(article: Article? = nil) {
            self.article = article
            identifier = article?.id ?? UUID()
            title = article?.title ?? ""
            excerpt = article?.excerpt ?? ""
            content = article?.content ?? ""
            category = article?.category ?? ""
            sport = article?.sport ?? ""
            cover = article?.coverImage?.absoluteString ?? ""
        }

        private enum CodingKeys: String, CodingKey { case action, id, title, excerpt, content, category, sport, cover, status, updatedAt }

        func encode(to encoder: any Encoder) throws {
            var fields = encoder.container(keyedBy: CodingKeys.self)
            try fields.encode(article == nil ? "create" : "edit", forKey: .action)
            try fields.encode(identifier.uuidString.lowercased(), forKey: .id)
            try fields.encode(title, forKey: .title)
            try fields.encode(excerpt, forKey: .excerpt)
            try fields.encode(content, forKey: .content)
            try fields.encode(category, forKey: .category)
            try fields.encode(sport, forKey: .sport)
            try fields.encode(cover, forKey: .cover)
            try fields.encode(status, forKey: .status)
            if let article { try fields.encode(article.updatedAt, forKey: .updatedAt) }
        }
    }

    let viewer: DiscoverAPI
    private static let path = "/api/mobile/articles"

    func available() async -> Bool {
        struct Access: Decodable { let enabled: Bool }
        guard viewer.userID != nil else { return false }
        return (try? await read(Access.self, view: "access"))?.enabled == true
    }

    func articles(mine: Bool, after: String? = nil) async throws -> Page {
        try await read(Page.self, view: mine ? "mine" : "index", query: after.map { [.init(name: "after", value: $0)] } ?? [])
    }

    func detail(_ slug: String) async throws -> Detail {
        let result = try await read(Detail.self, view: "detail", query: [.init(name: "slug", value: slug)])
        guard result.article.slug == slug else { throw URLError(.badServerResponse) }
        return result
    }

    func editor(_ id: UUID) async throws -> Article {
        struct Value: Decodable { let article: Article }
        let result = try await read(Value.self, view: "editor", query: [.init(name: "id", value: id.uuidString.lowercased())])
        guard result.article.id == id, result.article.authorId == viewer.userID else { throw URLError(.badServerResponse) }
        return result.article
    }

    func save(_ draft: Draft) async throws -> Receipt {
        let result = try await viewer.write(Receipt.self, path: Self.path, body: draft, keyDecodingStrategy: .convertFromSnakeCase)
        guard result.id == draft.identifier else { throw URLError(.badServerResponse) }
        return result
    }

    func view(_ id: UUID) async throws -> Int {
        struct Result: Decodable { let views: Int }
        return try await viewer.write(Result.self, path: Self.path,
            body: ["action": "view", "id": id.uuidString.lowercased()]).views
    }

    func like(_ liked: Bool, article id: UUID) async throws -> Like {
        struct Selection: Encodable { let action = "like"; let id: String; let liked: Bool }
        return try await viewer.write(Like.self, path: Self.path, body: Selection(id: id.uuidString.lowercased(), liked: liked))
    }

    func generate(prompt: String, sport: String, tone: String) async throws -> GeneratedDraft {
        guard let userID = viewer.userID else { throw URLError(.userAuthenticationRequired) }
        let token = try await viewer.account.accessToken(for: userID)
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/ai/blog", timeout: 45)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "X-SlipSurge-Client")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["prompt": prompt, "sport": sport, "tone": tone])
        let data = try await SlipSurgeHTTP.send(request)
        guard await viewer.account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return try JSONDecoder().decode(GeneratedDraft.self, from: data)
    }

    private func read<Value: Decodable>(_ type: Value.Type, view: String, query: [URLQueryItem] = []) async throws -> Value {
        try await viewer.readPublic(type, path: Self.path, query: [.init(name: "view", value: view)] + query)
    }
}
