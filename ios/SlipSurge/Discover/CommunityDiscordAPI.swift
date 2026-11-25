import AuthenticationServices
import Foundation

@MainActor
struct CommunityDiscordAPI {
    enum Grant {
        case membership, setup
        var scope: String { self == .setup ? "identify guilds" : "identify guilds.join" }
    }

    struct Membership: Decodable {
        let connected: Bool
        let ready: Bool
        let guildName: String
        let roles: [String]
        let inviteUrl: URL?
    }

    struct Receipt: Decodable {
        let guildName: String
        let roles: [String]
    }

    struct Setup: Decodable {
        struct Integration: Decodable, Identifiable {
            let id: UUID
            let guildId: String
            let guildName: String
            let roleId: String
            let roleName: String
            let inviteUrl: URL?
        }

        let configured: Bool
        let connected: Bool
        let accountHandle: String?
        let installUrl: URL?
        let integrations: [Integration]
    }

    struct Server: Decodable, Identifiable {
        let id: String
        let name: String
        let icon: URL?
    }

    struct Role: Decodable, Identifiable {
        let id: String
        let name: String
    }

    struct Inspection: Decodable {
        let guildId: String
        let guildName: String
        let roles: [Role]
        let canCreateRoles: Bool
        let inviteUrl: URL?
    }

    struct Channel: Decodable, Identifiable {
        let id: String
        let name: String
    }

    struct Problem: Decodable, Error {
        let error: String
        let code: String?
    }

    private struct Action: Encodable {
        let action: String
        var guildId: String?
        var roleIds: [String]?
        var name: String?
        var channelId: String?
        var inviteUrl: String?
        var providerToken: String?
    }

    private struct Confirmation: Decodable { let ok: Bool }
    let account: AccountStore
    let userID: UUID
    let groupID: UUID
    private var path: String { "/api/groups/\(groupID.uuidString.lowercased())/discord" }

    func membership() async throws -> Membership { try await read(path + "/claim") }

    func claim(providerToken: String? = nil) async throws -> Receipt {
        try await write(path + "/claim", action: .init(action: "claim", providerToken: providerToken))
    }

    func setup() async throws -> Setup { try await read(path, snakeCase: true) }

    func servers(providerToken: String) async throws -> [Server] {
        struct Result: Decodable { let servers: [Server] }
        let result: Result = try await write(path, action: .init(action: "servers", providerToken: providerToken))
        return result.servers
    }

    func inspect(guildID: String) async throws -> Inspection {
        try await read(path, query: [.init(name: "guildId", value: guildID)])
    }

    func save(guildID: String, roles: Set<String>, invite: String) async throws {
        let result: Confirmation = try await write(path, action: .init(action: "configure", guildId: guildID,
            roleIds: roles.sorted(), inviteUrl: invite.isEmpty ? nil : invite))
        guard result.ok else { throw URLError(.cannotParseResponse) }
    }

    func disconnect() async throws {
        let result: Confirmation = try await write(path, method: "DELETE")
        guard result.ok else { throw URLError(.cannotParseResponse) }
    }

    func newRole(guildID: String, name: String) async throws -> Role {
        struct Result: Decodable { let role: Role }
        let result: Result = try await write(path + "/actions", action: .init(action: "create_role", guildId: guildID, name: name))
        return result.role
    }

    func channels(guildID: String) async throws -> [Channel] {
        struct Result: Decodable { let channels: [Channel] }
        let result: Result = try await write(path + "/actions", action: .init(action: "channels", guildId: guildID))
        return result.channels
    }

    func publish(guildID: String, channelID: String) async throws -> URL {
        struct Result: Decodable { let ok: Bool; let url: URL }
        let result: Result = try await write(path + "/actions",
            action: .init(action: "publish_panel", guildId: guildID, channelId: channelID))
        guard result.ok, Self.trusted(result.url, pathPrefix: "/channels/") else { throw URLError(.cannotParseResponse) }
        return result.url
    }

    func authorize(_ grant: Grant, authenticate: (URL) async throws -> URL) async throws -> String {
        let auth = AccountAPI()
        let attempt = try ConnectionAttempt()
        let url = try await account.withSecuritySession(for: userID) { session in
            let user = try await auth.validatedUser(session)
            if user.identities?.contains(where: { $0.provider == "discord" }) == true {
                return try auth.discordGrantURL(attempt: attempt, scope: grant.scope)
            }
            return try await auth.connectionAuthorization(provider: .discord, attempt: attempt, session: session, discordScope: grant.scope)
        }
        let callback = try await authenticate(url)
        let code = try attempt.callbackValue(callback, key: "code")
        struct Proof: Decodable { let provider_token: String? }
        let data = try await auth.tokenData(grant: "pkce", payload: ["auth_code": code, "code_verifier": attempt.verifier])
        let decoder = JSONDecoder()
        let temporary = try decoder.decode(AccountSession.self, from: data)
        guard temporary.user.id == userID, account.memberID == userID,
              try await auth.validatedUser(temporary).identities?.contains(where: { $0.provider == "discord" }) == true,
              let proof = try decoder.decode(Proof.self, from: data).provider_token else {
            try? await auth.signOut(temporary)
            throw URLError(.userAuthenticationRequired)
        }
        try? await auth.signOut(temporary)
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return proof
    }

    static func trusted(_ url: URL, pathPrefix: String) -> Bool {
        url.scheme == "https" && url.host == "discord.com" && url.path.hasPrefix(pathPrefix) &&
            url.user == nil && url.password == nil && url.port == nil
    }

    static func invite(_ url: URL?) -> URL? {
        guard let url, url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil else { return nil }
        let valid = url.host == "discord.gg" && url.path.range(of: #"^/[A-Za-z0-9-]+/?$"#, options: .regularExpression) != nil ||
            url.host == "discord.com" && url.path.range(of: #"^/invite/[A-Za-z0-9-]+/?$"#, options: .regularExpression) != nil
        return valid ? url : nil
    }

    private func read<T: Decodable>(_ path: String, query: [URLQueryItem] = [], snakeCase: Bool = false) async throws -> T {
        do {
            let data = try await SlipSurgeHTTP.memberData(path, query: query, account: account, userID: userID)
            let decoder = JSONDecoder()
            if snakeCase { decoder.keyDecodingStrategy = .convertFromSnakeCase }
            return try decoder.decode(T.self, from: data)
        } catch let status as SlipSurgeHTTP.Status {
            if status.code == 404 { throw status }
            if let problem = try? JSONDecoder().decode(Problem.self, from: status.data) { throw problem }
            throw status
        }
    }

    private func write<T: Decodable>(_ path: String, method: String = "POST", action: Action? = nil) async throws -> T {
        do {
            let data = try await AccountPrivacyRequest.send(path, method: method, account: account, userID: userID,
                body: action.map { try JSONEncoder().encode($0) })
            return try JSONDecoder().decode(T.self, from: data)
        } catch let status as SlipSurgeHTTP.Status {
            if let problem = try? JSONDecoder().decode(Problem.self, from: status.data) { throw problem }
            throw status
        }
    }
}

private extension AccountAPI {
    func discordGrantURL(attempt: ConnectionAttempt, scope: String) throws -> URL {
        let callback = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/auth/callback",
            query: [.init(name: "native_connection_state", value: attempt.state)]).url
        guard let callback else { throw URLError(.badURL) }
        let request = try authRequest("/auth/v1/authorize", query: [
            .init(name: "provider", value: "discord"), .init(name: "redirect_to", value: callback.absoluteString),
            .init(name: "scopes", value: scope), .init(name: "prompt", value: "consent"),
            .init(name: "code_challenge", value: attempt.challenge), .init(name: "code_challenge_method", value: "s256"),
        ])
        guard let url = request.url else { throw URLError(.badURL) }
        return url
    }
}
