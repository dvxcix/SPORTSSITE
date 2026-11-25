import Foundation

struct AdminDiscordAPI {
    struct Configuration: Decodable {
        let guildId: String?
        let enabled: Bool
        let alertChannels: [String: String]?
        let tierRoles: [String: String]?
        let updatedAt: String
    }

    struct Channel: Decodable, Identifiable {
        let id: String
        let name: String
    }

    struct Environment: Decodable {
        let hasBotToken: Bool
        let hasApplicationId: Bool
        let hasPublicKey: Bool
    }

    struct CreatorStatus: Decodable {
        let configured: Bool
        let connected: Bool
        let name: String?
        let publicBot: Bool?
        let requiresCodeGrant: Bool?
        let interactionsReady: Bool?
        let guildCount: Int?
        let activeRoleMappings: Int?
        let pendingDeliveries: Int?
        let commands: [String]?
        let missingCommands: [String]?
    }

    struct AlertHealth: Decodable {
        struct Queue: Decodable {
            let pending: Int
            let processing: Int
            let failed: Int
            let succeeded: Int
        }
        struct Delivery: Decodable, Identifiable {
            let id: UUID
            let status: String
            let attempts: Int
            let maxAttempts: Int
            let responseStatus: Int?
            let createdAt: String?
            let latencyMs: Int?
            let kind: String?
            let batterName: String?
        }
        let ready: Bool
        let enabled: Bool
        let queue: Queue
        let latestSuccessAt: String?
        let latestFailureAt: String?
        let recent: [Delivery]
    }

    struct Slate: Decodable {
        let slateId: String?
        let otherCount: Int
    }

    struct Draft: Encodable {
        var channelId = ""
        var content = ""
        var title = ""
        var description = ""
        var authorName = ""
        var authorIconUrl = ""
        var url = ""
        var thumbnailUrl = ""
        var imageUrl = ""
        var footerText = ""
        var footerIconUrl = ""
        var color: Int? = 0xB4FF4D
    }

    let viewer: DiscoverAPI
    private let base = "/api/admin/discord/"

    func configuration() async throws -> Configuration {
        struct Result: Decodable { let config: Configuration }
        return try await viewer.memberRead(Result.self, path: base + "config", keyDecodingStrategy: .convertFromSnakeCase).config
    }

    func channels() async throws -> [Channel] {
        struct Result: Decodable { let channels: [Channel] }
        return try await viewer.memberRead(Result.self, path: base + "channels").channels
    }

    func environment() async throws -> Environment {
        try await viewer.memberRead(Environment.self, path: base + "env-check")
    }

    func creatorStatus() async throws -> CreatorStatus {
        try await viewer.memberRead(CreatorStatus.self, path: base + "creator-health")
    }

    func alerts() async throws -> AlertHealth {
        try await viewer.memberRead(AlertHealth.self, path: base + "contact-alerts")
    }

    func slate() async throws -> Slate {
        try await viewer.memberRead(Slate.self, path: base + "slate-command")
    }

    func save(guild: String, enabled: Bool, channels: [String: String], roles: [String: String], expected: String) async throws -> Configuration {
        struct Update: Encodable {
            let guild_id: String
            let enabled: Bool
            let alert_channels: [String: String]
            let tier_roles: [String: String]
            let expectedUpdatedAt: String
        }
        struct Result: Decodable { let config: Configuration }
        guard let userID = viewer.userID else { throw URLError(.userAuthenticationRequired) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: base + "config", timeout: 30)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await viewer.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Update(guild_id: guild, enabled: enabled, alert_channels: channels,
            tier_roles: roles, expectedUpdatedAt: expected))
        let data = try await SlipSurgeHTTP.send(request)
        guard await viewer.account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(Result.self, from: data).config
    }

    func post(_ draft: Draft) async throws {
        struct Receipt: Decodable { let ok: Bool }
        guard try await viewer.write(Receipt.self, path: base + "compose", body: draft).ok else {
            throw URLError(.cannotParseResponse)
        }
    }

    func register() async throws -> Int {
        struct Receipt: Decodable { let ok: Bool; let registered: Int }
        let receipt = try await viewer.write(Receipt.self, path: base + "register-commands", body: [String: String]())
        guard receipt.ok else { throw URLError(.cannotParseResponse) }
        return receipt.registered
    }

    func syncRoles() async throws -> (synced: Int, total: Int, failed: Int) {
        struct Receipt: Decodable { let ok: Bool; let synced: Int; let total: Int; let failed: Int }
        let receipt = try await viewer.write(Receipt.self, path: base + "sync-all-roles", body: [String: String](), timeout: 295)
        guard receipt.ok else { throw URLError(.cannotParseResponse) }
        return (receipt.synced, receipt.total, receipt.failed)
    }

    func retireSlate(_ expected: String) async throws -> Int {
        struct Receipt: Decodable { let removed: Bool; let otherCount: Int }
        let receipt = try await viewer.write(Receipt.self, path: base + "slate-command", body: ["expectedId": expected])
        guard receipt.removed else { throw URLError(.cannotParseResponse) }
        return receipt.otherCount
    }

    func sendCanary(kind: String) async throws {
        struct Receipt: Decodable { struct Result: Decodable { let ok: Bool }; let result: Result }
        guard try await viewer.write(Receipt.self, path: base + "contact-alerts", body: ["kind": kind], timeout: 90).result.ok else {
            throw URLError(.cannotParseResponse)
        }
    }
}
