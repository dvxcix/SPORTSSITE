import Foundation

struct AdminCreatorBusinessData: Decodable {
    struct Creator: Decodable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String?
        let email: String?
        let avatarUrl: URL?
        let accountType: String
        let creatorCommerceStatus: String?
        let creatorCommerceUpdatedAt: String?
        let linked: Bool

        var name: String { displayName ?? username }
    }

    struct Community: Decodable, Identifiable {
        let id: UUID
        let name: String
        let slug: String
        let ownerId: UUID
        let accessType: String
        let isPublic: Bool
        let memberCount: Int
        let sport: String?
    }

    struct Offer: Decodable, Identifiable {
        let id: UUID
        let creatorId: UUID
        let title: String
        let price: Double
        let currency: String
        let status: String
        let productType: String
        let billingPeriodDays: Int?
    }

    struct Access: Decodable, Identifiable {
        struct Member: Decodable { let username: String; let displayName: String? }
        let id: UUID
        let creatorId: UUID
        let productId: UUID
        let userId: UUID
        let status: String
        let currentPeriodEnd: String?
        let adminRevokedAt: String?
        let adminRevokedReason: String?
        let member: Member?

        var name: String { member?.displayName ?? member?.username ?? "Member" }
        var held: Bool { adminRevokedAt != nil }
        var active: Bool {
            !held && ["active", "trialing"].contains(status) && (currentPeriodEnd == nil || currentPeriodEnd.flatMap(SidelineBoard.timestamp).map { $0 > .now } == true)
        }
    }

    struct Event: Decodable, Identifiable {
        let id: UUID
        let creatorId: UUID
        let eventType: String
        let amount: Double?
        let currency: String?
        let status: String?
        let createdAt: String
    }

    struct Promotion: Decodable, Identifiable {
        struct Creator: Decodable { let username: String? }
        let creatorId: UUID
        let name: String
        let logoUrl: URL?
        let featured: Bool
        let featuredRank: Int
        let creator: Creator?
        var id: UUID { creatorId }
    }

    let creators: [Creator]
    let groups: [Community]
    let offers: [Offer]
    let members: [Access]
    let events: [Event]
    let promotions: [Promotion]
}

struct AdminCreatorBusinessAPI {
    struct Change: Encodable {
        let action: String
        let id: UUID
        var status: String? = nil
        var reason: String? = nil
    }

    struct Placement: Encodable {
        let creatorId: UUID
        let featured: Bool
        let rank: Int
    }

    private struct Result: Decodable { let ok: Bool }
    let viewer: DiscoverAPI

    func fetch() async throws -> AdminCreatorBusinessData {
        try await viewer.readPublic(AdminCreatorBusinessData.self, path: "/api/mobile/admin/creator-business")
    }

    func manage(_ change: Change) async throws {
        let result = try await viewer.write(Result.self, path: "/api/admin/creators/manage", body: change)
        guard result.ok else { throw URLError(.badServerResponse) }
    }

    func promote(_ placement: Placement) async throws {
        let result = try await viewer.write(Result.self, path: "/api/admin/creators/promotions", body: placement)
        guard result.ok else { throw URLError(.badServerResponse) }
    }
}
