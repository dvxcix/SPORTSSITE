import Foundation

struct ActivityNotification: Decodable, Identifiable {
    struct Actor: Decodable {
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingStyle: String?
        let avatarRingColor: String?
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
    let artworkUrl: URL?

    enum Destination: Hashable {
        case post(UUID), conversation(MessageDestination), discovery, community(UUID), profile(UUID), research(ResearchDeepLink), game(GameLink)
    }

    var destination: Destination? {
        let path = link.flatMap { URLComponents(string: $0) }.flatMap { value -> [Substring]? in
            guard value.scheme == nil, value.host == nil, value.percentEncodedPath.hasPrefix("/"),
                  !value.percentEncodedPath.contains("\\") else { return nil }
            return value.percentEncodedPath.split(separator: "/")
        } ?? []
        if path.first == "forum" || targetType == "forum_thread" { return .discovery }
        if path.first == "sports", let link, let url = URL(string: "https://\(SlipSurgeHTTP.site)" + link),
           case .scoreGame(let game) = NativeSiteLink(url) { return .game(game) }
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
        if type == "follow", let profile = actorId ?? targetId { return .profile(profile) }
        if let link, let research = ResearchDeepLink(sitePath: link) { return .research(research) }
        return nil
    }

    var title: String {
        switch type {
        case "follow": "Follow"
        case "reaction": "Reaction"
        case "comment": "Comment"
        case "message": "Message"
        case "mention": "Mention"
        case "pick_result": "Pick result"
        case "subscription": "Subscription"
        case "repost": "Repost"
        case "group_invite": "Community invite"
        case "new_pick": "New pick"
        case "lineup_confirmed": "Lineup confirmed"
        case "injury_update": "Injury update"
        case "roster_move": "Roster move"
        default: "Activity"
        }
    }

    var icon: String {
        switch type {
        case "follow": "person.badge.plus"
        case "reaction": "heart"
        case "comment", "message": "bubble.left"
        case "mention": "at"
        case "pick_result": "trophy"
        case "subscription": "person.crop.circle.badge.checkmark"
        case "repost": "arrow.2.squarepath"
        case "group_invite": "person.2"
        case "new_pick": "chart.line.uptrend.xyaxis"
        case "lineup_confirmed": "checkmark.seal"
        case "injury_update": "cross.case.fill"
        case "roster_move": "arrow.left.arrow.right"
        default: "bell"
        }
    }
}

extension [ActivityNotification] {
    var unreadCount: Int { count(where: { !$0.read }) }
}

struct ActivityAPI {
    let account: AccountStore
    let userID: UUID

    private static let path = "/api/mobile/notifications"

    func load(id: UUID? = nil) async throws -> [ActivityNotification] {
        struct Page: Decodable { let notifications: [ActivityNotification] }
        let query = id.map { [URLQueryItem(name: "id", value: $0.uuidString.lowercased())] } ?? []
        let data = try await SlipSurgeHTTP.memberData(Self.path, query: query, account: account, userID: userID)
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
