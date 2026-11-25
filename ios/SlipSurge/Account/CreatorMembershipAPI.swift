import Foundation

struct CreatorMembershipOffer: Decodable, Identifiable {
    let id: UUID
    let title: String
    let description: String?
    let price: Double?
    let currency: String?
    let productType: String?
    let status: String?
    let billingPeriodDays: Int?
    var accessStatus: String? = nil
    var active: Bool? = nil
    var currentPeriodEnd: String? = nil
}

struct CreatorMembershipAPI {
    struct Access: Decodable {
        let active: Bool
        let status: String
        let group: DiscoverAPI.Communities.Community?
    }

    let client: DiscoverAPI

    func memberships() async throws -> [CreatorMembershipOffer] {
        struct Response: Decodable { let memberships: [CreatorMembershipOffer] }
        return try await client.memberRead(Response.self, path: "/api/mobile/creator-memberships").memberships
    }

    func access(_ offer: UUID) async throws -> Access {
        try await client.memberRead(Access.self, path: path(offer, action: "access"))
    }

    func checkout(_ offer: UUID, state: String) async throws -> URL {
        try await whopLink(offer, action: "checkout", values: ["state": state])
    }

    func manage(_ offer: UUID) async throws -> URL { try await whopLink(offer, action: "manage") }

    func restore(_ offer: UUID) async throws {
        struct Response: Decodable { let active: Bool?; let status: String? }
        _ = try await client.write(Response.self, path: path(offer, action: "restore"), body: [String: String]())
    }

    private func whopLink(_ offer: UUID, action: String, values: [String: String] = [:]) async throws -> URL {
        struct Response: Decodable { let url: URL }
        let url = try await client.write(Response.self, path: path(offer, action: action), body: values).url
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
            let host = url.host?.lowercased(), host == "whop.com" || host.hasSuffix(".whop.com") else { throw URLError(.badURL) }
        return url
    }

    private func path(_ offer: UUID, action: String) -> String { "/api/creator/products/\(offer.uuidString.lowercased())/\(action)" }
}
