import Foundation

struct AccountAPI {
    private let projectHost = "hkldweedwnxartkfhror.supabase.co"

    enum Failure: Error {
        case unconfigured
        case additionalVerificationRequired
    }

    var isConfigured: Bool { publishableKey != nil }

    private var publishableKey: String? {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SlipSurgeSupabasePublishableKey") as? String,
              key.hasPrefix("sb_publishable_") else { return nil }
        return key
    }

    func realtimeURL() -> URL? {
        guard let publishableKey else { return nil }
        var endpoint = URLComponents()
        endpoint.scheme = "wss"
        endpoint.host = projectHost
        endpoint.path = "/realtime/v1/websocket"
        endpoint.queryItems = [.init(name: "apikey", value: publishableKey), .init(name: "vsn", value: "1.0.0")]
        return endpoint.url
    }

    func providersAvailable() async -> Bool {
        struct Availability: Decodable { let available: Bool }
        let response: Availability? = try? await SlipSurgeHTTP.get("/auth/native/status")
        return response?.available == true
    }

    func exchange(handoff: String, attempt: ProviderSignIn) async throws -> AccountSession {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/auth/native/exchange")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "code": handoff, "state": attempt.state, "verifier": attempt.verifier,
        ])
        return try JSONDecoder().decode(AccountSession.self, from: await SlipSurgeHTTP.send(request))
    }

    func signIn(email: String, password: String) async throws -> AccountSession {
        try await token(grant: "password", payload: ["email": email, "password": password])
    }

    func refresh(_ current: AccountSession) async throws -> AccountSession {
        let updated = try await token(grant: "refresh_token", payload: ["refresh_token": current.refreshToken])
        guard updated.user.id == current.user.id else { throw URLError(.cannotParseResponse) }
        return updated
    }

    func verifyTOTP(_ code: String, factorID: UUID, session: AccountSession) async throws -> AccountSession {
        struct Challenge: Decodable { let id: UUID }
        struct Verified: Decodable {
            let access_token: String
            let refresh_token: String
            let expires_in: TimeInterval
            let user: AccountSession.User?
        }
        let factor = "/auth/v1/factors/\(factorID.uuidString.lowercased())"
        let challenge = try JSONDecoder().decode(
            Challenge.self, from: await post(factor + "/challenge", accessToken: session.accessToken)
        )
        let verified = try JSONDecoder().decode(Verified.self, from: await post(
            factor + "/verify", accessToken: session.accessToken,
            payload: ["challenge_id": challenge.id.uuidString.lowercased(), "code": code]
        ))
        let updated = AccountSession(
            accessToken: verified.access_token, refreshToken: verified.refresh_token,
            expiresAt: Date.now.timeIntervalSince1970 + verified.expires_in,
            user: verified.user ?? session.user
        )
        guard updated.user.id == session.user.id, updated.isMFAAuthenticated else {
            throw Failure.additionalVerificationRequired
        }
        return updated
    }

    func validatedUser(_ session: AccountSession) async throws -> AccountSession.User {
        var request = try authRequest("/auth/v1/user", query: [])
        request.httpMethod = "GET"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let profile = try JSONDecoder().decode(AccountSession.User.self, from: await SlipSurgeHTTP.send(request))
        guard profile.id == session.user.id else { throw URLError(.cannotParseResponse) }
        return profile
    }

    func onboardingComplete(_ session: AccountSession) async throws -> Bool {
        let data = try await post("/rest/v1/rpc/get_own_onboarding_complete", accessToken: session.accessToken)
        return try JSONDecoder().decode(Bool.self, from: data)
    }

    private func post(_ path: String, accessToken: String, payload: [String: String] = [:]) async throws -> Data {
        var request = try authRequest(path, query: [])
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        return try await SlipSurgeHTTP.send(request)
    }

    func signOut(_ current: AccountSession, otherDevices: Bool = false) async throws {
        var request = try authRequest("/auth/v1/logout", query: [.init(name: "scope", value: otherDevices ? "others" : "local")])
        request.setValue("Bearer \(current.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
    }

    func token(grant: String, payload: [String: String]) async throws -> AccountSession {
        try JSONDecoder().decode(AccountSession.self, from: await tokenData(grant: grant, payload: payload))
    }

    func tokenData(grant: String, payload: [String: String]) async throws -> Data {
        var request = try authRequest("/auth/v1/token", query: [.init(name: "grant_type", value: grant)])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        return try await SlipSurgeHTTP.send(request)
    }

    func authRequest(_ path: String, query: [URLQueryItem]) throws -> URLRequest {
        guard let publishableKey else { throw Failure.unconfigured }
        var request = try SlipSurgeHTTP.request(host: projectHost, path: path, query: query, timeout: 20)
        request.httpMethod = "POST"
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        return request
    }
}
