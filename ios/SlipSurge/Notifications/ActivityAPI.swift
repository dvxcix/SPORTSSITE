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

    var destination: URL? {
        guard let link, link.hasPrefix("/"), !link.hasPrefix("//"), !link.contains("\\"),
              !link.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let url = URL(string: "https://\(SlipSurgeHTTP.site)\(link)"),
              url.scheme == "https", url.host == SlipSurgeHTTP.site else { return nil }
        return url
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
