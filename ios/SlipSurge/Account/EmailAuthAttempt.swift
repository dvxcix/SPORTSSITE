import CryptoKit
import Foundation

struct EmailAuthAttempt: Codable {
    enum Purpose: String, Codable { case registration, recovery }
    static let scheme = "slipsurge-ios-email"
    private static let lifetime: TimeInterval = 24 * 60 * 60

    let purpose: Purpose
    let state: String
    let verifier: String
    let createdAt: Date

    init(_ purpose: Purpose) throws {
        self.purpose = purpose
        state = try ProviderSignIn.randomValue()
        verifier = try ProviderSignIn.randomValue()
        createdAt = .now
    }

    var challenge: String { ProviderSignIn.base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }

    var redirect: String {
        var url = URLComponents()
        url.scheme = "https"
        url.host = SlipSurgeHTTP.site
        url.path = "/auth/native/email"
        url.queryItems = [.init(name: "state", value: state)]
        return url.string ?? ""
    }

    func code(from url: URL) throws -> String? {
        guard url.scheme == Self.scheme, url.host == "auth", url.path == "/complete",
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.count == 2, items.filter({ $0.name == "state" }).count == 1,
              items.first(where: { $0.name == "state" })?.value == state else { return nil }
        guard Date.now >= createdAt, Date.now.timeIntervalSince(createdAt) <= Self.lifetime,
              let code = items.first(where: { $0.name == "code" })?.value,
              code.range(of: "^[A-Za-z0-9_-]{32,256}$", options: .regularExpression) != nil else {
            throw URLError(.badServerResponse)
        }
        return code
    }
}

extension AccountAPI {
    struct Registration: Encodable {
        let email: String
        let password: String
        let username: String
        let displayName: String
        let sports: [String]
    }

    private struct EmailRequest: Encodable {
        struct Profile: Encodable {
            let username: String
            let display_name: String
            let sport_preferences: [String]
        }

        let email: String
        let password: String?
        let data: Profile?
        let code_challenge: String
        let code_challenge_method = "s256"
    }

    func register(_ registration: Registration, attempt: EmailAuthAttempt) async throws -> AccountSession? {
        let profile = EmailRequest.Profile(username: registration.username, display_name: registration.displayName,
            sport_preferences: registration.sports)
        let payload = EmailRequest(email: registration.email, password: registration.password, data: profile,
            code_challenge: attempt.challenge)
        return try await openEmail("/auth/v1/signup", payload: payload, attempt: attempt)
    }

    func recover(email: String, attempt: EmailAuthAttempt) async throws {
        let payload = EmailRequest(email: email, password: nil, data: nil, code_challenge: attempt.challenge)
        _ = try await openEmail("/auth/v1/recover", payload: payload, attempt: attempt)
    }

    func redeem(_ code: String, attempt: EmailAuthAttempt) async throws -> AccountSession {
        try await token(grant: "pkce", payload: ["auth_code": code, "code_verifier": attempt.verifier])
    }

    func updatePassword(_ password: String, nonce: String? = nil, session: AccountSession) async throws {
        var payload = ["password": password]
        if let nonce { payload["nonce"] = nonce }
        _ = try await updateUser(payload, session: session)
    }

    func updateUser(_ payload: [String: String], session: AccountSession) async throws -> AccountSession.User {
        var request = try authRequest("/auth/v1/user", query: [])
        request.httpMethod = "PUT"
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        let user = try JSONDecoder().decode(AccountSession.User.self, from: await SlipSurgeHTTP.send(request))
        guard user.id == session.user.id else { throw URLError(.cannotParseResponse) }
        return user
    }

    private func openEmail(_ path: String, payload: EmailRequest, attempt: EmailAuthAttempt) async throws -> AccountSession? {
        var request = try authRequest(path, query: [.init(name: "redirect_to", value: attempt.redirect)])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        let data = try await SlipSurgeHTTP.send(request)
        if path == "/auth/v1/signup" {
            return try? JSONDecoder().decode(AccountSession.self, from: data)
        }
        return nil
    }
}
