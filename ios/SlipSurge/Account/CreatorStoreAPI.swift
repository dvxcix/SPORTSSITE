import Foundation

struct CreatorStorePage: Decodable {
    struct Store: Decodable {
        let name: String
        let bio: String
        let logoUrl: String?
        let coverUrl: String?
        let sports: [String]
        let tags: [String]
        let accessMode: String
        let setupStep: Int
        let status: String
        let communityId: UUID?
        let productId: UUID?
        let hasDraft: Bool?
        let featured: Bool?
    }

    struct Offer: Decodable, Identifiable {
        let id: UUID
        let title: String
        let price: Double
        let currency: String?
        let status: String
        let productType: String
        let billingPeriodDays: Int?
        let providerReady: Bool
    }

    struct Community: Decodable, Identifiable {
        let id: UUID
        let name: String
        let avatarUrl: URL?
        let accessType: String
        let creatorProductId: UUID?
    }

    let store: Store?
    let username: String?
    let storeName: String
    let paymentStatus: String?
    let paymentConnected: Bool
    let canOnboard: Bool
    let sports: [String]
    let tags: [String]
    let offers: [Offer]
    let groups: [Community]
}

struct CreatorStoreDraft {
    var name: String
    var bio: String
    var logo: String?
    var cover: String?
    var sports: [String]
    var tags: [String]
    var access: String
    var product: UUID?
    var step: Int

    init(_ page: CreatorStorePage) {
        let store = page.store
        name = store?.name ?? page.storeName
        bio = store?.bio ?? ""
        logo = store?.logoUrl
        cover = store?.coverUrl
        sports = store?.sports ?? []
        tags = store?.tags ?? []
        access = store?.accessMode ?? "free"
        product = store?.productId
        step = store?.setupStep ?? 0
    }
}

struct CreatorStoreAPI {
    struct Payment: Decodable {
        struct Action: Decodable, Identifiable {
            let title: String
            let pending: Bool
            var id: String { title }
        }
        let state: String
        let canCharge: Bool
        let canPayout: Bool
        let actions: [Action]
    }

    struct NewOffer: Encodable {
        let requestId: String
        let title: String
        let description: String
        let price: Decimal
        let productType: String
        let billingDays: Int
    }

    let account: AccountStore
    let userID: UUID
    private var client: DiscoverAPI { .init(account: account, userID: userID) }

    func load() async throws -> CreatorStorePage {
        try await client.memberRead(CreatorStorePage.self, path: "/api/mobile/creator-store",
            keyDecodingStrategy: .convertFromSnakeCase)
    }

    func save(_ draft: CreatorStoreDraft, publish: Bool) async throws -> CreatorStorePage.Store {
        struct Result: Decodable { let store: CreatorStorePage.Store }
        let body: [String: Any] = ["name": draft.name, "bio": draft.bio, "logo_url": draft.logo as Any? ?? NSNull(),
            "cover_url": draft.cover as Any? ?? NSNull(), "sports": draft.sports, "tags": draft.tags, "access_mode": draft.access,
            "setup_step": draft.step, "product_id": (draft.access == "paid" ? draft.product?.uuidString.lowercased() : nil) as Any? ?? NSNull(),
            "action": publish ? "publish" : "save"]
        let encoded = try JSONSerialization.data(withJSONObject: body)
        return try await send(Result.self, path: "/api/creator/storefront", method: "POST", body: encoded).store
    }

    func attachCommunity(_ selection: String) async throws -> UUID {
        struct Result: Decodable { struct Group: Decodable { let id: UUID }; let group: Group }
        return try await client.write(Result.self, path: "/api/creator/storefront/community", body: ["communityId": selection]).group.id
    }

    func payment() async throws -> Payment { try await client.memberRead(Payment.self, path: "/api/creator/status") }

    func paymentSetup() async throws -> URL {
        try await whopLink("/api/creator/whop-onboard")
    }

    func payoutPortal() async throws -> URL {
        try await whopLink("/api/creator/payout-portal")
    }

    func wallet(after: String? = nil) async throws -> CreatorWalletSnapshot {
        try await client.memberRead(CreatorWalletSnapshot.self, path: "/api/creator/wallet",
            query: after.map { [.init(name: "after", value: $0)] } ?? [])
    }

    func revenue(days: Int, currency: String) async throws -> CreatorRevenueSnapshot {
        try await client.memberRead(CreatorRevenueSnapshot.self, path: "/api/mobile/creator-revenue",
            query: [.init(name: "days", value: String(days)), .init(name: "currency", value: currency)])
    }

    private func whopLink(_ path: String) async throws -> URL {
        struct Result: Decodable { let url: URL }
        let url = try await client.write(Result.self, path: path, body: [String: String]()).url
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
            let host = url.host?.lowercased(), host == "whop.com" || host.hasSuffix(".whop.com") else {
            throw URLError(.cannotParseResponse)
        }
        return url
    }

    func createOffer(_ offer: NewOffer) async throws -> UUID {
        struct Result: Decodable { let id: UUID }
        return try await client.write(Result.self, path: "/api/creator/products", body: offer).id
    }

    func setOffer(_ id: UUID, status: String) async throws {
        struct Result: Decodable { let ok: Bool }
        let body = try JSONEncoder().encode(["productId": id.uuidString.lowercased(), "status": status])
        let result = try await send(Result.self, path: "/api/creator/products", method: "PATCH", body: body)
        guard result.ok else { throw URLError(.cannotParseResponse) }
    }

    private func send<T: Decodable>(_ type: T.Type, path: String, method: String, body: Data) async throws -> T {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path, timeout: 80)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        let data = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}
