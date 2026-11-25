import Foundation

struct NflMatrix: Decodable, Identifiable {
    struct Definition: Codable {
        var factors: [Rule]?
        var steps: [Rule]?
    }

    struct Rule: Codable, Identifiable {
        var id = UUID().uuidString.lowercased()
        var category = "score"
        var field = "index"
        var `operator` = "gte"
        var value: Double? = 60
        var window = "season"
        var vendor: String?
        var propType: String?
        var marketValue: String?
        var marketLine: Double?
        var marketSide: String?
        var marketKind: String?
        var kind: String?
        var join: String?
        var direction: String?
        var scope: String?
        var keep: Int?

        static var step: Self { .init(kind: "filter", join: "and", direction: "highest", scope: "team", keep: 1) }
    }

    let id: UUID
    let name: String
    let color: String
    let enabled: Bool
    let matrixType: String
    let matchMode: String
    let matchAnyCount: Int?
    let pipelineScope: String?
    let definition: Definition
    let elementCode: String
    let updatedAt: String?

    var conditionCount: Int { matrixType == "pipeline" ? definition.steps?.count ?? 0 : definition.factors?.count ?? 0 }
}

struct NflMatrixCatalog: Decodable {
    struct Field: Decodable, Identifiable {
        let category: String
        let field: String
        let label: String
        var id: String { field }
    }
    struct Market: Decodable, Identifiable {
        let value: String
        let title: String
        var id: String { value }
    }

    let fields: [Field]
    let books: [String]
    let markets: [Market]
}

struct NflMatrixListing: Decodable, Identifiable {
    let id: UUID
    let title: String
    let description: String
    let color: String
    let matrixType: String
    let copyCount: Int
}

struct NflMatricesAPI {
    struct Edits: Encodable {
        var name: String?
        var color: String?
        var enabled: Bool?
        var matrix_type: String?
        var match_mode: String?
        var match_any_count: Int?
        var pipeline_scope: String?
        var definition: NflMatrix.Definition?
        var expected_updated_at: String?
    }

    private static let path = "/api/mobile/nfl-matrices"
    let account: AccountStore
    let userID: UUID

    func mine() async throws -> [NflMatrix] {
        struct Result: Decodable { let matrices: [NflMatrix] }
        return try await read(Result.self, view: "mine").matrices
    }

    func catalog() async throws -> NflMatrixCatalog { try await read(NflMatrixCatalog.self, view: "catalog") }

    func community() async throws -> [NflMatrixListing] {
        struct Result: Decodable { let listings: [NflMatrixListing] }
        return try await read(Result.self, view: "community").listings
    }

    func save(_ edits: Edits, id: UUID?) async throws {
        if let id { try await write("PATCH", id: id, body: JSONEncoder().encode(edits)) }
        else { try await write("POST", action: "create", body: JSONEncoder().encode(edits)) }
    }

    func delete(_ matrix: NflMatrix) async throws { try await write("DELETE", id: matrix.id, version: matrix.updatedAt) }

    func importCode(_ code: String) async throws {
        try await write("POST", action: "import-code", body: JSONEncoder().encode(["element_code": code]))
    }

    func importListing(_ id: UUID) async throws { try await write("POST", action: "import-listing", id: id) }

    func publish(_ id: UUID, title: String, description: String) async throws {
        try await write("POST", action: "publish", body: JSONEncoder().encode([
            "matrix_id": id.uuidString.lowercased(), "title": title, "description": description,
        ]))
    }

    private func read<T: Decodable>(_ type: T.Type, view: String) async throws -> T {
        let data = try await SlipSurgeHTTP.memberData(Self.path, query: [.init(name: "view", value: view)], account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }

    private func write(_ method: String, action: String? = nil, id: UUID? = nil, version: String? = nil, body: Data? = nil) async throws {
        var query: [URLQueryItem] = []
        if let action { query.append(.init(name: "action", value: action)) }
        if let id { query.append(.init(name: "id", value: id.uuidString.lowercased())) }
        if let version { query.append(.init(name: "version", value: version)) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path, query: query)
        request.httpMethod = method
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        _ = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
    }
}
