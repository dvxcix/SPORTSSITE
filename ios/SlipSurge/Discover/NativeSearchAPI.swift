import Foundation

struct NativeSearchAPI {
    enum Tab: String, CaseIterable, Identifiable, Hashable, Codable {
        case all, mlb, nfl, nba, community, users, posts, picks

        var id: String { rawValue }
        var title: String {
            switch self {
            case .mlb, .nfl, .nba: rawValue.uppercased()
            case .users: "Members"
            default: rawValue.capitalized
            }
        }

        var symbol: String {
            switch self {
            case .all: "magnifyingglass"
            case .mlb: "baseball"
            case .nfl: "football"
            case .nba: "basketball"
            case .community: "person.2"
            case .users: "person.crop.circle"
            case .posts: "text.bubble"
            case .picks: "scope"
            }
        }
    }

    struct Community: Decodable, Identifiable {
        let id: UUID
        let path: String
        let name: String
        let description: String?
        let avatarUrl: URL?
        let emoji: String?
        let count: Int?
        let time: String?
    }

    struct Member: Decodable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingColor: String?
        let isVerified: Bool?
        let followerCount: Int?
        let record: DiscoverAPI.Records.Record?
    }

    struct Results: Decodable {
        let users: [Member]
        let posts: [FeedPost]
        let groups: [Community]
        let pages: [Community]
        let rooms: [Community]
        let events: [Community]

        var isEmpty: Bool { users.isEmpty && posts.isEmpty && groups.isEmpty && pages.isEmpty && rooms.isEmpty && events.isEmpty }
    }

    struct Saved: Decodable, Identifiable {
        let id: UUID
        let query: String
        let resultTab: Tab
    }

    struct SavedSearches: Decodable {
        let searches: [Saved]
        let allowMlb: Bool
    }

    struct SportHit: Identifiable {
        let path: String
        let league: Tab
        let name: String
        let detail: String?
        let headshot: URL?
        let logo: URL?
        let team: String?
        var pitcherPath: String? = nil
        var gamePath: String? = nil
        var id: String { "\(league.rawValue):\(path):\(name)" }
    }

    let viewer: DiscoverAPI
    private static let root = "/api/mobile/search"

    func saved() async throws -> SavedSearches {
        try await viewer.readPublic(SavedSearches.self, path: Self.root, query: [.init(name: "view", value: "saved")])
    }

    func search(_ query: String, tab: Tab) async throws -> Results {
        try await viewer.readPublic(Results.self, path: Self.root,
            query: [.init(name: "q", value: query), .init(name: "tab", value: tab.rawValue)])
    }

    func save(_ query: String, tab: Tab) async throws {
        struct Edit: Encodable { let query: String; let tab: Tab }
        try await change("POST", body: JSONEncoder().encode(Edit(query: query, tab: tab)))
    }

    func choose(_ id: UUID) async throws { try await change("PATCH", id: id) }
    func remove(_ id: UUID) async throws { try await change("DELETE", id: id) }

    func hasNBA() async -> Bool {
        struct Access: Decodable { let allowed: Bool }
        return (try? await viewer.memberRead(Access.self, path: "/api/account/nba-access").allowed) == true
    }

    func sports(_ tab: Tab, query: String) async -> [SportHit] {
        guard query.count >= 2 else { return [] }
        let parameters = [URLQueryItem(name: "q", value: query)]
        switch tab {
        case .nba: return await nba(parameters)
        case .nfl: return await nfl(parameters)
        case .mlb: return await mlb(parameters)
        default: return []
        }
    }

    private func nba(_ query: [URLQueryItem]) async -> [SportHit] {
        struct Matches: Decodable {
            struct Player: Decodable { let id: Int; let name: String; let position: String?; let teamName: String?; let teamAbbr: String?; let headshot: URL?; let teamLogo: URL? }
            struct Team: Decodable { let id: Int; let name: String; let abbr: String; let logo: URL? }
            let players: [Player]
            let teams: [Team]
        }
        guard let matches = try? await viewer.readPublic(Matches.self, path: "/api/search/nba", query: query) else { return [] }
        return matches.teams.map {
            .init(path: "/nba/teams/\($0.id)", league: .nba, name: $0.name, detail: $0.abbr, headshot: nil, logo: $0.logo, team: $0.abbr)
        } + matches.players.map {
            .init(path: "/nba/players/\($0.id)", league: .nba, name: $0.name,
                detail: [$0.position, $0.teamName].compactMap { $0 }.joined(separator: " · "), headshot: $0.headshot, logo: $0.teamLogo, team: $0.teamAbbr)
        }
    }

    private func nfl(_ query: [URLQueryItem]) async -> [SportHit] {
        struct Matches: Decodable {
            struct Player: Decodable { let gsisId: String; let displayName: String; let position: String?; let latestTeam: String?; let headshot: URL?; let teamLogoEspn: URL? }
            struct Team: Decodable { let teamAbbr: String; let teamName: String; let teamLogoEspn: URL? }
            let players: [Player]
            let teams: [Team]
        }
        guard let matches = try? await viewer.readPublic(Matches.self, path: "/api/search/nfl", query: query) else { return [] }
        return matches.teams.map {
            .init(path: "/nfl/teams/\($0.teamAbbr)", league: .nfl, name: $0.teamName, detail: $0.teamAbbr,
                headshot: nil, logo: $0.teamLogoEspn, team: $0.teamAbbr)
        } + matches.players.map {
            .init(path: "/nfl/players/\($0.gsisId)", league: .nfl, name: $0.displayName,
                detail: [$0.position, $0.latestTeam].compactMap { $0 }.joined(separator: " · "), headshot: $0.headshot, logo: $0.teamLogoEspn, team: $0.latestTeam)
        }
    }

    private func mlb(_ query: [URLQueryItem]) async -> [SportHit] {
        struct Matches: Decodable {
            struct Player: Decodable { let mlbId: Int; let name: String; let position: String?; let teamId: Int?; let teamName: String?; let gamePk: Int?; let isProbableStarter: Bool }
            struct Team: Decodable { let id: Int; let name: String; let abbr: String; let gamePk: Int? }
            let players: [Player]
            let teams: [Team]
            let date: String?
        }
        guard let matches = try? await viewer.readPublic(Matches.self, path: "/api/search/sports", query: query) else { return [] }
        return matches.teams.map {
            .init(path: "/mlb/teams/\($0.id)", league: .mlb, name: $0.name, detail: $0.abbr, headshot: nil,
                logo: mlbLogo($0.id, abbreviation: $0.abbr), team: $0.abbr, gamePath: $0.gamePk.map { "/sports/mlb/\($0)" })
        } + matches.players.map { player in
            let image = URL(string: "https://img.mlbstatic.com/mlb-photos/image/upload/w_213,d_people:generic:headshot:67:current.png,q_auto:best,f_auto/v1/people/\(player.mlbId)/headshot/67/current")
            let pitcher = player.isProbableStarter ? matches.date.map { "/pitcher-report?date=\($0)&pitcherId=\(player.mlbId)" } : nil
            return .init(path: "/players/\(player.mlbId)", league: .mlb, name: player.name,
                detail: [player.position, player.teamName].compactMap { $0 }.joined(separator: " · "),
                headshot: image, logo: player.teamId.flatMap { mlbLogo($0) }, team: nil, pitcherPath: pitcher)
        }
    }

    private func mlbLogo(_ id: Int, abbreviation: String? = nil) -> URL? {
        if let abbreviation, abbreviation.range(of: #"^[A-Za-z]{2,3}$"#, options: .regularExpression) != nil {
            let code = abbreviation.uppercased() == "AZ" ? "ari" : abbreviation.lowercased()
            return URL(string: "https://a.espncdn.com/i/teamlogos/mlb/500/\(code).png")
        }
        return URL(string: "https://www.mlbstatic.com/team-logos/\(id).svg")
    }

    private func change(_ method: String, id: UUID? = nil, body: Data? = nil) async throws {
        guard let userID = viewer.userID else { throw URLError(.userAuthenticationRequired) }
        let query = id.map { [URLQueryItem(name: "id", value: $0.uuidString.lowercased())] } ?? []
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.root, query: query)
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let token = try await viewer.account.accessToken(for: userID)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
    }
}
