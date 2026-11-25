import Foundation

struct DugoutMatrix: Decodable, Identifiable {
    struct Tie: Codable, Identifiable {
        var id = UUID()
        var category = "dugout_specs"
        var field_key = "mm"
        var recency: String? = "l5"
        var book: String?
        var direction = "highest"
        var tolerance: Double?
        var zero_eligible: Bool?
        var mm_base_window: String?
        var mm_compare_windows: [String]?

        enum CodingKeys: String, CodingKey {
            case category, field_key, recency, book, direction, tolerance, zero_eligible, mm_base_window, mm_compare_windows
        }
    }

    struct Rule: Codable, Identifiable {
        var id = UUID()
        var category = "odds"
        var field_key = "fhr"
        var `operator`: String? = "gte"
        var value: Double?
        var recency: String?
        var recency_start: String?
        var recency_end: String?
        var book: String?
        var books: [String]?
        var books_min_count: Int?
        var tie_scope: String?
        var tie_direction: String?
        var tiebreakers: [Tie]?
        var mm_base_window: String?
        var mm_compare_windows: [String]?
        var mm_direction: String?
        var mm_match_mode: String?
        var mm_amount_mode: String?
        var kind: String?
        var join_mode: String?
        var direction: String?
        var tolerance: Double?
        var zero_eligible: Bool?
        var condition_scope: String?
        var condition_steps: [Rule]?
        var then_steps: [Rule]?
        var unless_mode: String?
        var uses_anchor: Bool?

        enum CodingKeys: String, CodingKey {
            case category, field_key, `operator`, value, recency, recency_start, recency_end, book, books, books_min_count
            case tie_scope, tie_direction, tiebreakers, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode
            case kind, join_mode, direction, tolerance, zero_eligible, condition_scope, condition_steps, then_steps, unless_mode, uses_anchor
        }

        static func step(_ kind: String = "filter", previous: Self? = nil) -> Self {
            var rule = Self()
            rule.kind = kind
            if kind == "rank" || kind == "group" { rule.operator = nil; rule.direction = "highest" }
            if kind == "unless" {
                rule.category = previous?.category ?? rule.category
                rule.field_key = previous?.field_key ?? rule.field_key
                rule.recency = previous?.recency
                rule.book = previous?.book
                rule.operator = nil
                rule.condition_scope = "game"
                rule.uses_anchor = false
                rule.unless_mode = "replace"
                rule.condition_steps = [.step()]
                rule.then_steps = [.step()]
            }
            return rule
        }
    }

    struct Draft: Encodable {
        var name = ""
        var color = "#A3F03B"
        var priority = 1
        var match_mode = "all"
        var match_any_count: Int? = 1
        var matrix_type = "classic"
        var pipeline_scope: String? = "team"
        var enabled = true
        var factors: [Rule]? = [.init()]
        var pipeline_steps: [Rule]?

        init() {}

        init(_ matrix: DugoutMatrix) {
            name = matrix.name
            color = matrix.color
            priority = matrix.priority
            match_mode = matrix.match_mode
            match_any_count = matrix.match_any_count
            matrix_type = matrix.matrix_type
            pipeline_scope = matrix.pipeline_scope
            enabled = matrix.enabled
            factors = matrix.matrix_type == "pipeline" ? nil : matrix.factors
            pipeline_steps = matrix.matrix_type == "pipeline" ? matrix.pipeline_steps : nil
        }
    }

    let id: UUID
    let name: String
    let color: String
    let priority: Int
    let enabled: Bool
    let match_mode: String
    let match_any_count: Int?
    let matrix_type: String
    let pipeline_scope: String?
    let element_code: String?
    let updated_at: String?
    let factors: [Rule]
    let pipeline_steps: [Rule]

    var count: Int { matrix_type == "pipeline" ? pipeline_steps.count : factors.count }
}

struct DugoutMatrixListing: Decodable, Identifiable {
    struct Author: Decodable {
        let username: String?
        let display_name: String?
        let avatar_url: URL?
        let is_verified: Bool?
    }

    struct Snapshot: Decodable {
        let factors: [DugoutMatrix.Rule]?
        let pipeline_steps: [DugoutMatrix.Rule]?
    }

    let id: UUID
    let title: String
    let description: String?
    let tags: [String]?
    let matrix_type: String
    let color: String
    let author: Author?
    let is_owner: Bool
    let copy_count: Int
    let snapshot: Snapshot
}

struct DugoutMatricesAPI {
    private struct ListResponse: Decodable { let matrices: [DugoutMatrix] }
    private struct MarketResponse: Decodable { let listings: [DugoutMatrixListing] }
    private struct Receipt: Decodable {
        struct Created: Decodable { let id: UUID }
        let ok: Bool?
        let matrix: Created?
        let listing_id: UUID?
        let matrix_id: UUID?
    }

    let account: AccountStore
    let userID: UUID
    private static let path = "/api/mobile/mlb-matrices"
    private var api: DiscoverAPI { .init(account: account, userID: userID) }

    func list() async throws -> [DugoutMatrix] {
        try await api.memberRead(ListResponse.self, path: Self.path).matrices
    }

    func marketplace(search: String, sort: String, type: String, mine: Bool) async throws -> [DugoutMatrixListing] {
        try await api.memberRead(MarketResponse.self, path: Self.path, query: [
            .init(name: "op", value: "marketplace"), .init(name: "q", value: search), .init(name: "sort", value: sort),
            .init(name: "type", value: type), .init(name: "mine", value: mine ? "1" : "0"),
        ]).listings
    }

    func save(_ draft: DugoutMatrix.Draft, previous: DugoutMatrix?) async throws {
        try await mutate(previous == nil ? "create" : "edit", body: draft, id: previous?.id, version: previous?.updated_at)
    }

    func enable(_ matrix: DugoutMatrix, enabled: Bool) async throws {
        try await mutate("edit", body: ["enabled": enabled], id: matrix.id, version: matrix.updated_at)
    }

    func delete(_ matrix: DugoutMatrix) async throws {
        try await mutate("delete", body: [String: String](), id: matrix.id, version: matrix.updated_at)
    }

    func importElement(_ code: String) async throws {
        try await mutate("import-code", body: ["element_code": code])
    }

    func importMarketplace(_ id: UUID) async throws {
        try await mutate("import-listing", body: [String: String](), id: id)
    }

    func removeMarketplace(_ id: UUID) async throws {
        try await mutate("remove-listing", body: [String: String](), id: id)
    }

    func publish(_ matrix: DugoutMatrix, title: String, description: String, tags: [String]) async throws {
        struct Listing: Encodable { let matrix_id: UUID; let title: String; let description: String; let tags: [String] }
        try await mutate("publish", body: Listing(matrix_id: matrix.id, title: title, description: description, tags: tags))
    }

    private func mutate<Body: Encodable>(_ op: String, body: Body, id: UUID? = nil, version: String? = nil) async throws {
        var query = [URLQueryItem(name: "op", value: op)]
        if let id { query.append(.init(name: "id", value: id.uuidString.lowercased())) }
        if let version { query.append(.init(name: "updatedAt", value: version)) }
        let result = try await api.write(Receipt.self, path: Self.path, query: query, body: body)
        guard result.ok == true || result.matrix != nil || result.listing_id != nil || result.matrix_id != nil else {
            throw URLError(.cannotParseResponse)
        }
    }
}
