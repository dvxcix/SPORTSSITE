import CryptoKit
import Foundation

struct AccountConnection: Decodable, Identifiable {
    struct Identity: Decodable { let handle: String; let profileUrl: URL? }

    let provider: SignInProvider
    let connected: Bool
    let identity: Identity?
    let canDisconnect: Bool

    var id: SignInProvider { provider }
}

struct ConnectionAttempt {
    let state: String
    let verifier: String
    let challenge: String

    init() throws {
        state = try ProviderSignIn.randomValue()
        verifier = try ProviderSignIn.randomValue()
        challenge = ProviderSignIn.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    func callbackValue(_ url: URL, key: String) throws -> String {
        guard url.scheme == ProviderSignIn.scheme, url.host == "auth", url.path == "/connection", url.fragment == nil,
              url.user == nil, url.password == nil, url.port == nil,
              let parameters = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              parameters.count == 2, parameters.first(where: { $0.name == "state" })?.value == state,
              let value = parameters.first(where: { $0.name == key })?.value,
              value.range(of: key == "code" ? "^[A-Za-z0-9_-]{32,256}$" : "^[A-Za-z0-9_-]{40,2500}$", options: .regularExpression) != nil else {
            throw URLError(.badServerResponse)
        }
        return value
    }
}

@MainActor
struct AccountConnectionsAPI {
    private static let path = "/api/mobile/account/connections"
    let account: AccountStore
    let userID: UUID

    func list() async throws -> [AccountConnection] {
        struct Result: Decodable { let connections: [AccountConnection] }
        let data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
        return try JSONDecoder().decode(Result.self, from: data).connections
    }

    func start(_ provider: SignInProvider, attempt: ConnectionAttempt) async throws -> URL {
        if provider == .whop {
            struct Result: Decodable { let url: URL }
            let data = try await post(Self.path, ["action": "whop-start", "state": attempt.state, "challenge": attempt.challenge])
            let url = try JSONDecoder().decode(Result.self, from: data).url
            guard url.scheme == "https", url.host == SlipSurgeHTTP.site, url.path == "/auth/whop/login",
                  url.user == nil, url.password == nil, url.port == nil else { throw URLError(.badURL) }
            return url
        }
        return try await account.withSecuritySession(for: userID) { session in
            try await AccountAPI().connectionAuthorization(provider: provider, attempt: attempt, session: session)
        }
    }

    func finish(_ provider: SignInProvider, callback: URL, attempt: ConnectionAttempt) async throws {
        if provider == .whop {
            let proof = try attempt.callbackValue(callback, key: "proof")
            _ = try await post(Self.path, ["action": "whop-finish", "state": attempt.state, "verifier": attempt.verifier, "proof": proof])
        } else {
            let code = try attempt.callbackValue(callback, key: "code")
            try await account.withSecuritySession(for: userID) { session in
                let api = AccountAPI()
                let connection = try await api.token(grant: "pkce", payload: ["auth_code": code, "code_verifier": attempt.verifier])
                guard connection.user.id == session.user.id,
                      try await api.validatedUser(connection).identities?.contains(where: { $0.provider == provider.rawValue }) == true else {
                    throw URLError(.userAuthenticationRequired)
                }
            }
            _ = try await post("/api/account/verified-identities")
        }
    }

    func disconnect(_ provider: SignInProvider) async throws {
        if provider == .whop {
            _ = try await post("/api/whop/unlink")
        } else {
            try await account.withSecuritySession(for: userID) { session in
                try await AccountAPI().disconnectIdentity(provider: provider, session: session)
            }
            _ = try await post("/api/account/verified-identities")
        }
    }

    private func post(_ path: String, _ body: [String: String]? = nil) async throws -> Data {
        try await AccountPrivacyRequest.send(path, method: "POST", account: account, userID: userID, body: body.map { try JSONEncoder().encode($0) })
    }
}

extension AccountAPI {
    func connectionAuthorization(provider: SignInProvider, attempt: ConnectionAttempt, session: AccountSession,
        discordScope: String? = nil) async throws -> URL {
        struct Result: Decodable { let url: URL }
        guard provider != .whop, let callback = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/auth/callback",
            query: [.init(name: "native_connection_state", value: attempt.state)]).url else { throw URLError(.badURL) }
        var query: [URLQueryItem] = [
            .init(name: "provider", value: provider.rawValue), .init(name: "redirect_to", value: callback.absoluteString),
            .init(name: "skip_http_redirect", value: "true"), .init(name: "code_challenge", value: attempt.challenge),
            .init(name: "code_challenge_method", value: "s256"),
        ]
        if provider == .discord, let discordScope {
            query += [.init(name: "scopes", value: discordScope), .init(name: "prompt", value: "consent")]
        }
        var request = try authRequest("/auth/v1/user/identities/authorize", query: query)
        request.httpMethod = "GET"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let url = try JSONDecoder().decode(Result.self, from: await SlipSurgeHTTP.send(request)).url
        let hosts = provider == .discord ? ["discord.com", "www.discord.com"] : ["api.twitter.com", "twitter.com", "x.com", "api.x.com"]
        guard url.scheme == "https", let host = url.host, hosts.contains(host), url.user == nil, url.password == nil, url.port == nil else {
            throw URLError(.badURL)
        }
        return url
    }

    func disconnectIdentity(provider: SignInProvider, session: AccountSession) async throws {
        let identities = try await validatedUser(session).identities ?? []
        guard provider != .whop, identities.count > 1, let identity = identities.first(where: { $0.provider == provider.rawValue }) else {
            throw URLError(.userAuthenticationRequired)
        }
        var request = try authRequest("/auth/v1/user/identities/\(identity.identity_id.uuidString.lowercased())", query: [])
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
    }
}
