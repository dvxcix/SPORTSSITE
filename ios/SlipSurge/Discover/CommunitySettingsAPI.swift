import Foundation

struct CommunitySettingsState: Decodable {
    struct Community: Decodable {
        let id: UUID
        let name: String
        let description: String?
        let rules: String?
        let sport: String?
        let avatarUrl: URL?
        let bannerUrl: URL?
        let isPublic: Bool?
        let accessType: String?
        let channelId: UUID?
    }

    struct Member: Decodable, Identifiable {
        let id: UUID
        let role: String
        let user: MessagePerson?
    }

    struct Role: Decodable, Identifiable {
        let id: UUID
        let name: String
        let color: String
        let isDefault: Bool
        let permissions: [String: Bool]
    }

    struct Assignment: Decodable { let userId: UUID; let roleId: UUID }
    struct Override: Decodable {
        let channelId: UUID
        let roleId: UUID
        let canView: Bool?
        let canSend: Bool?
        let canManageMessages: Bool?
    }

    let group: Community
    let allowMlb: Bool
    let owner: Bool
    let channelManagement: Bool
    let roleManagement: Bool
    let memberManagement: Bool
    let invite: Bool
    let members: [Member]
    let channels: [MessagesAPI.Channel]
    let roles: [Role]
    let assignments: [Assignment]
    let overrides: [Override]
}

@MainActor
struct CommunitySettingsAPI {
    let account: AccountStore
    let userID: UUID
    let groupID: UUID

    struct Change: Encodable {
        let action: String
        var name: String?
        var description: String?
        var icon: String?
        var sport: String?
        var rules: String?
        var avatar: URL?
        var banner: URL?
        var `public`: Bool?
        var channel: String?
        var channelKind: String?
        var user: String?
        var role: String?
        var roleId: String?
        var color: String?
        var enabled: Bool?
        var permissions: [String: Bool]?
        var canView: Bool?
        var canSend: Bool?
        var canManageMessages: Bool?
    }

    struct Matches: Decodable { let users: [MessagePerson]; let pending: [UUID]? }

    private var path: String { "/api/mobile/communities/\(groupID.uuidString.lowercased())/settings" }

    func load() async throws -> CommunitySettingsState {
        try await read(CommunitySettingsState.self)
    }

    func search(_ term: String) async throws -> Matches {
        try await read(Matches.self, query: [.init(name: "q", value: term)])
    }

    func save(_ change: Change) async throws {
        _ = try await AccountPrivacyRequest.send(path, method: "POST", account: account, userID: userID, body: JSONEncoder().encode(change))
    }

    private func read<T: Decodable>(_ type: T.Type, query: [URLQueryItem] = []) async throws -> T {
        let data = try await SlipSurgeHTTP.memberData(path, query: query, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}
