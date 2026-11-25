import CryptoKit
import Foundation
import Security

enum SignInProvider: String, CaseIterable, Identifiable {
    case discord, x, whop

    var id: String { rawValue }

    var title: String {
        switch self {
        case .discord: "Discord"
        case .x: "X"
        case .whop: "Whop"
        }
    }
}

struct ProviderSignIn {
    static let scheme = "slipsurge-ios"

    struct CallbackError: Error {
        let code: String
    }

    let state: String
    let verifier: String
    let url: URL

    init(provider: SignInProvider) throws {
        state = try Self.randomValue()
        verifier = try Self.randomValue()
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let request = try SlipSurgeHTTP.request(
            host: SlipSurgeHTTP.site,
            path: "/auth/native/start",
            query: [
                .init(name: "provider", value: provider.rawValue),
                .init(name: "state", value: state),
                .init(name: "challenge", value: challenge),
            ]
        )
        guard let url = request.url else { throw URLError(.badURL) }
        self.url = url
    }

    func handoff(from callback: URL) throws -> String {
        guard callback.scheme == Self.scheme, callback.host == "auth",
              callback.path == "/complete", callback.fragment == nil,
              callback.user == nil, callback.password == nil, callback.port == nil,
              let parameters = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              parameters.count == 2,
              parameters.first(where: { $0.name == "state" })?.value == state else {
            throw URLError(.badServerResponse)
        }
        if let error = parameters.first(where: { $0.name == "error" })?.value {
            throw CallbackError(code: error)
        }
        guard let handoff = parameters.first(where: { $0.name == "handoff" })?.value,
              handoff.range(of: "^[A-Za-z0-9_-]{40,3072}$", options: .regularExpression) != nil else {
            throw URLError(.badServerResponse)
        }
        return handoff
    }

    private static func randomValue() throws -> String {
        var bytes = Data(count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            guard let base = buffer.baseAddress else { return errSecAllocate }
            return SecRandomCopyBytes(kSecRandomDefault, buffer.count, base)
        }
        guard status == errSecSuccess else { throw URLError(.resourceUnavailable) }
        return base64URL(bytes)
    }

    private static func base64URL(_ bytes: Data) -> String {
        bytes.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
