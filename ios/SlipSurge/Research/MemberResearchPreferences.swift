import Observation
import SwiftUI

struct MemberResearchPreferences: Codable, Equatable {
    let version: Int
    var launchPage: String
    var books: [String]
    var primaryBook: String?

    enum CodingKeys: String, CodingKey { case version, launchPage, books, primaryBook }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(launchPage, forKey: .launchPage)
        try values.encode(books, forKey: .books)
        if let primaryBook { try values.encode(primaryBook, forKey: .primaryBook) }
        else { try values.encodeNil(forKey: .primaryBook) }
    }
}

struct MemberResearchOptions: Decodable {
    struct LaunchPage: Decodable, Identifiable {
        let id: String
        let label: String
        let group: String
        let href: String
        let eligible: Bool

        var destination: URL? {
            guard id != "explore", href.hasPrefix("/"), !href.hasPrefix("//"), !href.contains("\\"),
                  let url = URL(string: "https://" + SlipSurgeHTTP.site + href) else { return nil }
            if ResearchDeepLink(url) != nil { return url }
            guard let route = NativeSiteLink(url), route != .launch else { return nil }
            return url
        }
    }

    struct Book: Decodable, Identifiable {
        let id: String
        let label: String
    }

    var preferences: MemberResearchPreferences
    let defaults: MemberResearchPreferences
    let launchPages: [LaunchPage]
    let books: [Book]

    var launch: URL? {
        launchPages.first { $0.id == preferences.launchPage && $0.eligible }?.destination
    }
}

struct MemberResearchPreferencesAPI {
    let account: AccountStore
    let userID: UUID

    func load() async throws -> MemberResearchOptions {
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/account/research-preferences", account: account, userID: userID)
        return try JSONDecoder().decode(MemberResearchOptions.self, from: data)
    }

    func save(_ value: MemberResearchPreferences, expected: MemberResearchPreferences) async throws {
        struct Edit: Encodable {
            let kind = "research"
            let value: MemberResearchPreferences
            let expected: MemberResearchPreferences
        }

        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/account/preferences")
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(Edit(value: value, expected: expected))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let token = try await account.accessToken(for: userID)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
    }
}

@MainActor @Observable
final class MemberResearchPreferenceStore {
    private var userID: UUID?
    private var options: MemberResearchOptions?

    func read(for userID: UUID?) -> MemberResearchOptions? {
        guard self.userID == userID else { return nil }
        return options
    }

    func apply(_ options: MemberResearchOptions?, for userID: UUID?) {
        self.userID = userID
        self.options = options
    }
}

extension EnvironmentValues {
    @Entry var memberResearchPreferences: MemberResearchPreferenceStore? = nil
}
