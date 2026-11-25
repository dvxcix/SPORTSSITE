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
        struct Line: Decodable {
            let label: String?
            let line: String?
            let odds: String?
            let result: String?
            let sport: String?
            let team: String?
            let teamLogo: URL?
            let colors: [String]?
            let portraits: [URL]?
        }

        let single: Line
        let book: String?
        let combinedOdds: String?
        let legs: [Line]

        private enum CodingKeys: CodingKey { case book, combinedOdds, legs }

        init(from decoder: any Decoder) throws {
            single = try Line(from: decoder)
            let values = try decoder.container(keyedBy: CodingKeys.self)
            book = try values.decodeIfPresent(String.self, forKey: .book)
            combinedOdds = try values.decodeIfPresent(String.self, forKey: .combinedOdds)
            legs = try values.decode([Line].self, forKey: .legs)
        }
    }

    struct Poll: Decodable {
        let options: [String]
        let endsAt: String
        let votes: [Int]?
    }

    struct ID: Hashable {
        let post: UUID
        let repostedAt: String?
        let reposter: String?
    }

    let postID: UUID
    let author: Author?
    let authorId: UUID?
    let visibility: String?
    let reactionSummary: [String: Int]?
    let reacted: [String]?
    let reposted: Bool?
    let bookmarked: Bool?
    let pollVote: Int?
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
        case authorId, visibility, reactionSummary, reacted, reposted, bookmarked, pollVote
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

struct FeedThread: Decodable {
    struct Comment: Decodable, Identifiable {
        struct Author: Decodable {
            let username: String
            let displayName: String?
            let avatarUrl: URL?
        }

        let id: UUID
        let text: String
        let authorId: UUID
        let parentId: UUID?
        let createdAt: String
        let editedAt: String?
        let reactionCount: Int?
        let liked: Bool
        let author: Author?
    }

    let post: FeedPost
    let comments: [Comment]
}

extension FeedAPI {
    struct Mutation: Encodable {
        let kind: String
        var enabled: Bool?
        var emoji: String?
        var option: Int?
        var id: String?
        var text: String?
        var parent: String?
        var reason: String?
    }

    func thread(_ id: UUID) async throws -> FeedThread {
        let path = "/api/mobile/posts/\(id.uuidString.lowercased())"
        let thread: FeedThread
        if let userID {
            let data = try await SlipSurgeHTTP.memberData(path, account: account, userID: userID)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            thread = try decoder.decode(FeedThread.self, from: data)
        } else {
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path, timeout: 35)
            let data = try await SlipSurgeHTTP.send(request)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            thread = try decoder.decode(FeedThread.self, from: data)
        }
        guard thread.post.postID == id, thread.comments.count <= 1000 else { throw URLError(.cannotParseResponse) }
        return thread
    }

    func mutate(_ id: UUID, action: Mutation) async throws {
        struct Confirmation: Decodable { let ok: Bool }
        let result = try await DiscoverAPI(account: account, userID: userID).write(Confirmation.self,
            path: "/api/mobile/posts/\(id.uuidString.lowercased())", body: action)
        guard result.ok else { throw URLError(.cannotParseResponse) }
    }
}
