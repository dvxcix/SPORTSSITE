import Foundation

struct FeedStory: Decodable, Identifiable {
    struct Author: Decodable {
        let id: UUID
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingStyle: String?
        let avatarRingColor: String?

        var name: String { displayName ?? username }
        var pictures: [URL] { [avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia) }
    }

    let id: UUID
    let author: Author
    let sport: String?
    let content: String?
    let background: String
    let foreground: String
    let media: URL?
    let video: Bool
    let createdAt: String?
    let expiresAt: String
    let mine: Bool

    var expired: Bool { expiresAtDate.map { $0 <= .now } ?? true }
    private var expiresAtDate: Date? { SidelineBoard.timestamp(expiresAt) }
    var artwork: URL? { media.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
}

struct StoriesAPI {
    struct Page: Decodable {
        let enabled: Bool
        let canCreate: Bool
        let stories: [FeedStory]
    }

    struct Draft: Encodable {
        let id: String
        let content: String
        let sport: String
        let photo: URL?
        let background: String
    }

    private static let path = "/api/mobile/stories"
    let account: AccountStore
    let userID: UUID?

    func load() async throws -> Page {
        let data: Data
        if let userID {
            data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
        } else {
            data = try await SlipSurgeHTTP.send(SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path))
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(Page.self, from: data)
    }

    func add(_ draft: Draft) async throws { try await write(method: "POST", data: JSONEncoder().encode(draft)) }

    func remove(_ id: UUID) async throws {
        try await write(method: "DELETE", query: [.init(name: "id", value: id.uuidString.lowercased())])
    }

    private func write(method: String, query: [URLQueryItem] = [], data: Data? = nil) async throws {
        guard let userID else { throw URLError(.userAuthenticationRequired) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path, query: query)
        request.httpMethod = method
        request.httpBody = data
        if data != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
    }
}
