import Foundation

enum FeedFilter: String, CaseIterable {
    case latest, top, picks, following
}

struct FeedPost: Decodable, Identifiable {
    struct Author: Decodable {
        let username: String
        let displayName: String?
        let avatar: URL?
        let verified: Bool?
    }

    struct Pick: Decodable {
        struct Leg: Decodable {
            let label: String
            let line: String?
            let odds: String?
            let result: String?
        }

        let label: String?
        let line: String?
        let odds: String?
        let result: String?
        let legs: [Leg]
    }

    struct Poll: Decodable {
        let options: [String]
        let endsAt: String
    }

    struct ID: Hashable {
        let post: UUID
        let repostedAt: String?
        let reposter: String?
    }

    let postID: UUID
    let author: Author?
    let repostedBy: String?
    let repostedAt: String?
    let createdAt: String
    let content: String
    let kind: String
    let sport: String?
    let media: [URL]
    let spoiler: Bool
    let shareable: Bool
    let reactions: Int
    let comments: Int
    let reposts: Int
    let pick: Pick?
    let poll: Poll?

    enum CodingKeys: String, CodingKey {
        case postID = "id"
        case author, repostedAt, repostedBy, createdAt, content, kind, sport
        case media, spoiler, shareable, reactions, comments, reposts, pick, poll
    }

    var id: ID { ID(post: postID, repostedAt: repostedAt, reposter: repostedBy) }
}

struct FeedPage: Decodable {
    let posts: [FeedPost]
    let nextCursor: String?
    let hasMore: Bool
    let sports: [String]
}

struct FeedAPI {
    let account: AccountStore
    let userID: UUID?

    func page(filter: FeedFilter, sport: String?, cursor: String?) async throws -> FeedPage {
        var query = [URLQueryItem(name: "filter", value: filter.rawValue)]
        if let sport { query.append(.init(name: "sport", value: sport)) }
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }

        let resource = "/api/mobile/feed"
        let page: FeedPage
        if let userID {
            let data = try await SlipSurgeHTTP.memberData(resource, query: query, account: account, userID: userID)
            page = try JSONDecoder().decode(FeedPage.self, from: data)
        } else {
            page = try await SlipSurgeHTTP.get(resource, query: query)
        }
        guard page.posts.count <= 20,
              !page.hasMore || (userID != nil && page.nextCursor != nil && page.nextCursor != cursor) else {
            throw URLError(.cannotParseResponse)
        }
        return page
    }
}
