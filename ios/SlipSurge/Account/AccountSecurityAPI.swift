import Foundation

struct AuthenticatorEnrollment: Decodable, Identifiable {
    struct Credentials: Decodable {
        let uri: URL
        let secret: String
    }

    let id: UUID
    let totp: Credentials
}

extension AccountAPI {
    func requestPasswordCode(session: AccountSession) async throws {
        _ = try await securityRequest("/auth/v1/reauthenticate", method: "GET", session: session)
    }

    func enrollAuthenticator(session: AccountSession) async throws -> AuthenticatorEnrollment {
        let data = try await securityRequest("/auth/v1/factors", method: "POST", session: session,
            payload: ["factor_type": "totp", "friendly_name": "SlipSurge authenticator"])
        let enrollment = try JSONDecoder().decode(AuthenticatorEnrollment.self, from: data)
        guard enrollment.totp.uri.scheme == "otpauth", enrollment.totp.uri.host == "totp" else {
            throw URLError(.cannotParseResponse)
        }
        return enrollment
    }

    func removeAuthenticator(_ id: UUID, session: AccountSession) async throws {
        _ = try await securityRequest("/auth/v1/factors/\(id.uuidString.lowercased())", method: "DELETE", session: session)
    }

    private func securityRequest(_ path: String, method: String, session: AccountSession, payload: [String: String]? = nil) async throws -> Data {
        var request = try authRequest(path, query: [])
        request.httpMethod = method
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        if let payload {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(payload)
        }
        return try await SlipSurgeHTTP.send(request)
    }
}
