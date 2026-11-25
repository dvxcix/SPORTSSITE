import Foundation

struct ActivityNotification: Decodable, Identifiable {
    struct Actor: Decodable {
        let username: String
        let displayName: String?
        let avatarUrl: URL?
    }

    let id: UUID
    let type: String
    let message: String?
    let body: String?
    let link: String?
    let read: Bool
    let createdAt: String
    let actor: Actor?
    let actorId: UUID?
    let targetId: UUID?
    let targetType: String?

    enum Destination: Hashable {
        case post(UUID), conversation(MessageDestination), discovery, community(UUID)
    }

    var destination: Destination? {
        let path = link.flatMap { URLComponents(string: $0) }.flatMap { value -> [Substring]? in
            guard value.scheme == nil, value.host == nil, value.percentEncodedPath.hasPrefix("/"),
                  !value.percentEncodedPath.contains("\\") else { return nil }
            return value.percentEncodedPath.split(separator: "/")
        } ?? []
        if targetType == "post", let targetId { return .post(targetId) }
        if path.count == 2, path[0] == "posts", let id = UUID(uuidString: String(path[1])) { return .post(id) }
        if type == "message" {
            if targetType == "group_conversation", let targetId { return .conversation(.init(kind: .group, id: targetId)) }
            if path.count == 3, path[0] == "messages", path[1] == "group", let id = UUID(uuidString: String(path[2])) {
                return .conversation(.init(kind: .group, id: id))
            }
            if let user = actorId ?? targetId { return .conversation(.init(kind: .direct, id: user)) }
        }
        if type == "group_invite" {
            if targetType == "group", let targetId { return .community(targetId) }
            return .discovery
        }
        return nil
    }

    var icon: String {
        switch type {
        case "follow": "person.badge.plus"
        case "reaction": "heart"
        case "comment", "message": "bubble.left"
        case "mention": "at"
        case "pick_result": "trophy"
        case "repost": "arrow.2.squarepath"
        case "group_invite": "person.2"
        case "new_pick": "chart.line.uptrend.xyaxis"
        case "lineup_confirmed": "checkmark.seal"
        default: "bell"
        }
    }
}

struct ActivityAPI {
    let account: AccountStore
    let userID: UUID

    private static let path = "/api/mobile/notifications"

    func load() async throws -> [ActivityNotification] {
        struct Page: Decodable { let notifications: [ActivityNotification] }
        let data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(Page.self, from: data).notifications
    }

    func markRead(_ ids: [UUID]) async throws {
        try await edit("PATCH", ["ids": ids.map { $0.uuidString.lowercased() }])
    }

    func remove(_ id: UUID) async throws {
        try await edit("DELETE", ["ids": [id.uuidString.lowercased()]])
    }

    func clear() async throws {
        try await edit("DELETE", ["clearAll": true])
    }

    private func edit<Value: Encodable>(_ method: String, _ body: Value) async throws {
        let token = try await account.accessToken(for: userID)
        // Reload after an ambiguous failure rather than replaying a mutation.
        _ = try await send(method, token: token, body: JSONEncoder().encode(body))
    }

    private func send(_ method: String, token: String, body: Data? = nil) async throws -> Data {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await SlipSurgeHTTP.send(request)
    }
}
