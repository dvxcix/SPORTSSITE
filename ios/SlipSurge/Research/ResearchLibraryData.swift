import Foundation

struct ResearchLibraryData: Decodable {
    struct SavedMarket: Decodable, Identifiable {
        struct Offer: Decodable, Identifiable {
            let book: String
            let price: Double
            var id: String { book }
        }
        let id: UUID
        let sport: String
        let gamePk: String?
        let gameDate: String?
        let playerName: String
        let team: String?
        let headshotUrl: URL?
        let teamLogo: URL?
        let colors: [String]?
        let propLabel: String
        let line: String?
        let book: String?
        let odds: Int?
        let notes: String?
        let status: String
        let offers: [Offer]
    }

    struct Matrix: Decodable, Identifiable {
        let id: UUID
        let name: String
        let color: String?
        let elementCode: String?
    }

    struct Workspace: Decodable, Identifiable {
        let id: UUID
        let userId: UUID
        let name: String
        let description: String?
        let watchlistItemIds: [UUID]
        let mlbMatrixIds: [UUID]
        let nflMatrixIds: [UUID]
        let canEdit: Bool
        let updatedAt: String
    }

    struct Note: Decodable, Identifiable {
        let id: UUID
        let title: String
        let body: String
        let sport: String?
        let gameId: String?
        let pinned: Bool
        let updatedAt: String
    }

    struct Evidence: Decodable, Identifiable {
        let id: UUID
        let workspaceId: UUID
        let title: String
        let capturedAt: String
        let name: String
        let team: String
        let sport: String
        let score: Double?
        let mm: Double?
        let teamLogo: URL?
    }

    let showMlb: Bool
    let items: [SavedMarket]
    let nflMatrices: [Matrix]
    let mlbMatrices: [Matrix]
    let workspaces: [Workspace]
    let notes: [Note]
    let evidence: [Evidence]
}

struct ResearchLibraryAPI {
    struct MLBQuote: Encodable {
        let date: String
        let gameId: Int
        let playerId: Int
        let market: String
        let book: String
        let price: Int
    }

    struct Change: Encodable {
        let kind: String
        var id: String?
        var title: String?
        var body: String?
        var sport: String?
        var game: String?
        var enabled: Bool?
        var items: [String]?
        var baseline: [String]?
        var nfl: [String]?
        var mlb: [String]?
        var updatedAt: String?
        var username: String?
        var user: String?
        var message: String?
        var role: String?
        var market: TrackedPickAPI.Leg?
        var mlbQuote: MLBQuote?
    }

    private static let path = "/api/mobile/research-library"
    let account: AccountStore
    let userID: UUID

    private var api: DiscoverAPI { .init(account: account, userID: userID) }

    func load() async throws -> ResearchLibraryData {
        try await api.readPublic(ResearchLibraryData.self, path: Self.path)
    }

    func mutate(_ action: Change) async throws {
        struct Confirmation: Decodable { let ok: Bool }
        let response = try await api.write(Confirmation.self, path: Self.path, body: action)
        guard response.ok else { throw URLError(.cannotParseResponse) }
    }

    func collaboration(_ id: UUID) async throws -> ResearchCollaborationData {
        let result = try await api.readPublic(ResearchCollaborationData.self, path: Self.path, query: [.init(name: "workspace", value: id.uuidString.lowercased())])
        guard result.id == id else { throw URLError(.cannotParseResponse) }
        return result
    }

    func search(_ id: UUID, term: String) async throws -> [MessagePerson] {
        struct Matches: Decodable { let users: [MessagePerson] }
        return try await api.readPublic(Matches.self, path: Self.path, query: [.init(name: "workspace", value: id.uuidString.lowercased()),
            .init(name: "q", value: term)]).users
    }
}

struct ResearchCollaborationData: Decodable {
    struct Person: Decodable {
        let username: String?
        let displayName: String?
        let avatarUrl: URL?
    }

    struct Member: Decodable, Identifiable {
        let userId: UUID
        let role: String
        let users: Person?
        var id: UUID { userId }
    }

    struct Comment: Decodable, Identifiable {
        let id: UUID
        let userId: UUID
        let body: String
        let createdAt: String?
        let users: Person?
    }

    let id: UUID
    let name: String
    let owner: Bool
    let members: [Member]
    let comments: [Comment]
    let activeIds: [UUID]
}
