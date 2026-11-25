import Foundation

struct AccountSession: Codable {
    struct User: Codable {
        struct Identity: Codable {
            let identity_id: UUID
            let provider: String
        }

        struct Factor: Codable {
            let id: UUID
            let factorType: String
            let status: String
            let friendlyName: String?

            enum CodingKeys: String, CodingKey {
                case id, status
                case factorType = "factor_type"
                case friendlyName = "friendly_name"
            }
        }

        let id: UUID
        let email: String?
        let factors: [Factor]?
        let identities: [Identity]?

        var hasVerifiedFactor: Bool { factors?.contains { $0.status == "verified" } ?? false }
        var verifiedTOTP: UUID? { factors?.first { $0.status == "verified" && $0.factorType == "totp" }?.id }
    }

    let accessToken: String
    let refreshToken: String
    let expiresAt: TimeInterval
    let user: User

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case user
    }

    var isMFAAuthenticated: Bool {
        let chunks = accessToken.split(separator: ".")
        guard chunks.count == 3 else { return false }
        var payload = chunks[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        // This only controls the native UI. Supabase still verifies the token.
        return claims["aal"] as? String == "aal2"
    }

    var needsRefresh: Bool { expiresAt < Date.now.timeIntervalSince1970 + 60 }
}
