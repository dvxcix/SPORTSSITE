import Foundation

struct MessageDestination: Hashable {
    enum Kind: String, Hashable { case direct, group, channel }
    let kind: Kind
    let id: UUID

    var query: [URLQueryItem] { [.init(name: "kind", value: kind.rawValue), .init(name: "id", value: id.uuidString.lowercased())] }
}

struct MessagePerson: Decodable, Identifiable {
    let id: UUID
    let username: String
    let displayName: String?
    let avatarUrl: URL?
    let isVerified: Bool?

    var name: String { displayName ?? username }
}

struct MessageInbox: Decodable {
    struct Direct: Decodable, Identifiable {
        let id: UUID
        let content: String
        let createdAt: String
        let unreadCount: Int
        let lastIsMine: Bool
        let isRequest: Bool
        let partner: MessagePerson
    }

    struct Group: Decodable, Identifiable {
        let id: UUID
        let name: String
        let updatedAt: String
        let lastMessage: String
        let unreadCount: Int
        let members: [MessagePerson]
    }

    let conversations: [Direct]
    let groupConversations: [Group]
}

struct MessageThread: Decodable {
    struct Note: Decodable, Identifiable, Equatable {
        struct Author: Decodable, Equatable {
            let username: String
            let displayName: String?
            let avatarUrl: URL?
        }

        struct Reply: Decodable, Equatable {
            let id: UUID
            let content: String
            let sender: Author?
        }

        let id: UUID
        let content: String
        let createdAt: String
        let editedAt: String?
        let isDeleted: Bool?
        let senderId: UUID
        let mediaUrls: [URL]?
        let replyTo: Reply?
        let sender: Author?
    }

    struct Participant: Decodable, Identifiable {
        let id: UUID
        let role: String
        let muted: Bool
        let user: MessagePerson?
    }

    struct Reaction: Decodable {
        let messageId: UUID
        let emoji: String
        let mine: Bool
    }

    let title: String
    let partner: MessagePerson?
    let members: [Participant]
    let pins: [UUID]
    let reactions: [Reaction]
    let messages: [Note]
    let canSend: Bool
    let canModerate: Bool?
    let channelId: UUID?
    let muted: Bool
    let owner: Bool
}

struct MessagesAPI {
    struct Channel: Decodable, Identifiable {
        let id: UUID
        let name: String
        let description: String?
        let icon: String?
        let channelKind: String?
        let isPinned: Bool?
        let preferred: Bool?
        let memberCount: Int?
    }

    struct Change: Encodable {
        let action: String
        var message: String?
        var text: String?
        var reply: String?
        var image: URL?
        var emoji: String?
        var enabled: Bool?
        var status: String?
        var user: String?
        var users: [String]?
    }

    private struct Confirmation: Decodable { let ok: Bool; let id: UUID? }
    private static let path = "/api/mobile/messages"
    let account: AccountStore
    let userID: UUID

    func inbox() async throws -> MessageInbox { try await read(MessageInbox.self, query: []) }

    func search(_ query: String) async throws -> [MessagePerson] {
        struct Matches: Decodable { let users: [MessagePerson] }
        return try await read(Matches.self, query: [.init(name: "view", value: "search"), .init(name: "q", value: query)]).users
    }

    func channels(group: UUID?) async throws -> [Channel] {
        struct Catalog: Decodable { let channels: [Channel] }
        var query = [URLQueryItem(name: "view", value: "channels")]
        if let group { query.append(.init(name: "group", value: group.uuidString.lowercased())) }
        return try await read(Catalog.self, query: query).channels
    }

    func thread(_ destination: MessageDestination) async throws -> MessageThread {
        let thread = try await read(MessageThread.self, query: [.init(name: "view", value: "thread")] + destination.query)
        guard thread.messages.count <= 200, thread.partner?.id == (destination.kind == .direct ? destination.id : nil),
              destination.kind != .group || thread.members.contains(where: { $0.id == userID }),
              destination.kind != .channel || thread.channelId == destination.id else {
            throw URLError(.cannotParseResponse)
        }
        return thread
    }

    func change(_ action: Change, in destination: MessageDestination) async throws {
        _ = try await write(action, query: destination.query)
    }

    func createGroup(_ name: String, users: [UUID]) async throws -> MessageDestination {
        let result = try await write(.init(action: "group-create", text: name, users: users.map { $0.uuidString.lowercased() }), query: [])
        guard let id = result.id else { throw URLError(.cannotParseResponse) }
        return .init(kind: .group, id: id)
    }

    private func read<Value: Decodable>(_ type: Value.Type, query: [URLQueryItem]) async throws -> Value {
        let data = try await SlipSurgeHTTP.memberData(Self.path, query: query, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }

    private func write(_ action: Change, query: [URLQueryItem]) async throws -> Confirmation {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path, query: query)
        let token = try await account.accessToken(for: userID)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(action)
        let data = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        let result = try JSONDecoder().decode(Confirmation.self, from: data)
        guard result.ok else { throw URLError(.cannotParseResponse) }
        return result
    }
}
