import Foundation

struct ForumAPI {
    struct Category: Decodable, Identifiable {
        let id: UUID
        let slug: String
        let name: String
        let description: String?
        let sport: String?
        let icon: String?
        let threadCount: Int?
    }

    struct Author: Decodable {
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingStyle: String?
        let avatarRingColor: String?
        let isVerified: Bool?
    }

    struct Mention: Decodable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let isVerified: Bool?
    }

    struct Topic: Decodable, Identifiable {
        struct Label: Decodable { let name: String; let slug: String }
        let id: UUID
        let authorId: UUID?
        let content: String?
        let title: String
        let isPinned: Bool?
        let isLocked: Bool?
        let replyCount: Int?
        let createdAt: String?
        let author: Author?
        let category: Label?
    }

    struct Reply: Decodable, Identifiable {
        let id: UUID
        let authorId: UUID
        let content: String?
        let author: Author?
        let parentReplyId: UUID?
        let createdAt: String
        let editedAt: String?
        let isDeleted: Bool?
    }

    struct Reaction: Decodable, Identifiable {
        let emoji: String
        let count: Int
        let mine: Bool
        var id: String { emoji }
    }

    struct Board: Decodable {
        let category: Category
        let threads: [Topic]
    }

    struct Discussion: Decodable {
        let thread: Topic
        let replies: [Reply]
        let reactions: [String: [Reaction]]
        let mentions: [String]?
        let next: String?
    }

    struct Admin: Decodable {
        let categories: [Category]
        let threads: [Topic]
    }

    struct Change: Encodable {
        enum Kind: String { case thread, reply, edit, remove, reaction }
        let kind: Kind
        let id: UUID
        var thread: UUID?
        var category: UUID?
        var parent: UUID?
        var title: String?
        var content: String?
        var target: String?
        var emoji: String?
        var enabled: Bool?
        var expectedEditedAt: String?

        private enum CodingKeys: String, CodingKey {
            case kind, id, thread, category, parent, title, content, target, emoji, enabled, expectedEditedAt
        }

        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(kind.rawValue, forKey: .kind)
            try container.encode(id.uuidString.lowercased(), forKey: .id)
            try container.encodeIfPresent(thread?.uuidString.lowercased(), forKey: .thread)
            try container.encodeIfPresent(category?.uuidString.lowercased(), forKey: .category)
            try container.encodeIfPresent(parent?.uuidString.lowercased(), forKey: .parent)
            try container.encodeIfPresent(title, forKey: .title)
            try container.encodeIfPresent(content, forKey: .content)
            try container.encodeIfPresent(target, forKey: .target)
            try container.encodeIfPresent(emoji, forKey: .emoji)
            try container.encodeIfPresent(enabled, forKey: .enabled)
            if kind == .edit || kind == .remove { try container.encode(expectedEditedAt, forKey: .expectedEditedAt) }
        }
    }

    struct Receipt: Decodable {
        let id: UUID
        let reactions: [Reaction]?
        let reply: Reply?
    }

    let viewer: DiscoverAPI
    private static let path = "/api/mobile/forum"
    private static let adminPath = "/api/mobile/admin/forum"

    func available() async -> Bool {
        struct Access: Decodable { let enabled: Bool }
        return (try? await viewer.readPublic(Access.self, path: Self.path, query: [.init(name: "view", value: "access")]))?.enabled == true
    }

    func categories() async throws -> [Category] {
        struct Response: Decodable { let categories: [Category] }
        return try await viewer.readPublic(Response.self, path: Self.path).categories
    }

    func board(_ slug: String) async throws -> Board {
        try await viewer.readPublic(Board.self, path: Self.path,
            query: [.init(name: "view", value: "category"), .init(name: "slug", value: slug)])
    }

    func discussion(_ id: UUID, after: String? = nil) async throws -> Discussion {
        var query: [URLQueryItem] = [.init(name: "view", value: "detail"), .init(name: "id", value: id.uuidString.lowercased())]
        if let after { query.append(.init(name: "after", value: after)) }
        let response = try await viewer.readPublic(Discussion.self, path: Self.path, query: query)
        guard response.thread.id == id else { throw URLError(.badServerResponse) }
        return response
    }

    func change(_ action: Change) async throws -> Receipt {
        let result = try await viewer.write(Receipt.self, path: Self.path, body: action, keyDecodingStrategy: .convertFromSnakeCase)
        guard result.id == action.id else { throw URLError(.badServerResponse) }
        return result
    }

    func mentions(_ term: String) async throws -> [Mention] {
        struct Results: Decodable { let members: [Mention] }
        return try await viewer.readPublic(Results.self, path: Self.path,
            query: [.init(name: "view", value: "mentions"), .init(name: "q", value: term)]).members
    }

    func admin() async throws -> Admin { try await viewer.readPublic(Admin.self, path: Self.adminPath) }

    func moderate(_ topic: Topic, action: String) async throws {
        struct Mutation: Encodable {
            let id: String
            let action: String
            let expected: Bool
            let enabled: Bool
        }
        struct Result: Decodable { let id: UUID }
        let state = action == "pin" ? topic.isPinned == true : topic.isLocked == true
        let mutation = Mutation(id: topic.id.uuidString.lowercased(), action: action, expected: state, enabled: !state)
        let result: Result = try await adminRequest(method: "PATCH", body: JSONEncoder().encode(mutation))
        guard result.id == topic.id else { throw URLError(.badServerResponse) }
    }

    func remove(_ topic: UUID) async throws {
        struct Result: Decodable { let removed: UUID }
        let result: Result = try await adminRequest(method: "DELETE", body: nil,
            query: [.init(name: "id", value: topic.uuidString.lowercased())])
        guard result.removed == topic else { throw URLError(.badServerResponse) }
    }

    private func adminRequest<Result: Decodable>(method: String, body: Data?, query: [URLQueryItem] = []) async throws -> Result {
        guard let userID = viewer.userID else { throw URLError(.userAuthenticationRequired) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.adminPath, query: query)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await viewer.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        let result = try JSONDecoder().decode(Result.self, from: await SlipSurgeHTTP.send(request))
        guard await viewer.account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return result
    }
}
