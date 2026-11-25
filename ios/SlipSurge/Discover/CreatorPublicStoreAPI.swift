import Foundation

struct CreatorPublicStoreAPI {
    struct Storefront: Decodable {
        let creator: DiscoverAPI.Creators.Creator
        let groups: [DiscoverAPI.Communities.Community]
        let activeProductIds: [UUID]
        let joinedIds: [UUID]
        let following: Bool?
        let posts: [FeedPost]
        let postsUnavailable: Bool
    }

    struct Offer: Decodable {
        struct Creator: Decodable {
            let id: UUID
            let username: String
            let displayName: String?
            let avatarUrl: URL?
            let isVerified: Bool?
        }

        let offer: CreatorMembershipOffer
        let creator: Creator?
        let community: DiscoverAPI.Communities.Community?
    }

    let client: DiscoverAPI
    private let path = "/api/mobile/creator-storefront"

    func storefront(_ username: String) async throws -> Storefront {
        let store = try await client.readPublic(Storefront.self, path: path, query: [.init(name: "username", value: username)])
        guard store.creator.username == username else { throw URLError(.cannotParseResponse) }
        return store
    }

    func offer(_ id: UUID) async throws -> Offer {
        let value = try await client.readPublic(Offer.self, path: path, query: [.init(name: "offer", value: id.uuidString.lowercased())])
        guard value.offer.id == id else { throw URLError(.cannotParseResponse) }
        return value
    }

    func changeFollowing(_ id: UUID, to active: Bool) async throws {
        struct Action: Encodable { let id: UUID; let action = "follow"; let enabled: Bool }
        struct Result: Decodable { let ok: Bool }
        let result = try await client.write(Result.self, path: "/api/mobile/profiles", body: Action(id: id, enabled: active))
        guard result.ok else { throw URLError(.badServerResponse) }
    }
}
