import Foundation

struct AccountFavoritesData: Decodable {
    static let path = "/api/account/favorites"

    let catalog: [NativeOnboarding.Team]
    let selectedTeamKeys: Set<String>?
    let teams: Set<String>
    let players: [NativeOnboarding.Player]
    let sports: [String]

    var leagues: [String] { ["nfl", "nba", "mlb"].filter { league in catalog.contains { $0.sport == league } } }
    var teamKeys: Set<String> { selectedTeamKeys ?? teams }

    struct Edit: Encodable {
        var action: String?
        var team: String?
        var player: NativeOnboarding.Player?
        var sports: [String]?
    }

    @MainActor
    func search(_ query: String, league: String, account: AccountStore, userID: UUID) async throws -> [NativeOnboarding.Player] {
        guard leagues.contains(league) else { return [] }
        let path = switch league {
        case "nba": Self.path + "/players"
        case "nfl": "/api/search/nfl"
        default: "/api/search/sports"
        }
        let bytes = try await SlipSurgeHTTP.memberData(path, query: [.init(name: "q", value: query)], account: account, userID: userID)
        let decoder = JSONDecoder()
        switch league {
        case "nba":
            return try decoder.decode(SearchResult<NBAPlayer>.self, from: bytes).players.map { .init(mlb_id: nil,
                player_id: String($0.id), name: $0.name, team: $0.teamName ?? "", sport: league, headshot: $0.headshot, team_logo: $0.teamLogo) }
        case "nfl":
            return try decoder.decode(SearchResult<NFLPlayer>.self, from: bytes).players.map { .init(mlb_id: nil,
                player_id: $0.gsis_id, name: $0.display_name, team: $0.latest_team ?? "", sport: league, headshot: $0.headshot, team_logo: $0.team_logo_espn) }
        default:
            return try decoder.decode(SearchResult<MLBPlayer>.self, from: bytes).players.map { player in
                let team = catalog.first { $0.sport == "mlb" && $0.name == player.teamName }?.abbr ?? player.teamName ?? ""
                return .init(mlb_id: player.mlbId, player_id: nil, name: player.name, team: team, sport: nil, headshot: nil, team_logo: nil)
            }
        }
    }

    private struct SearchResult<Player: Decodable>: Decodable { let players: [Player] }
    private struct NBAPlayer: Decodable {
        let id: Int
        let name: String
        let teamName: String?
        let headshot: String?
        let teamLogo: String?
    }
    private struct NFLPlayer: Decodable {
        let gsis_id: String
        let display_name: String
        let latest_team: String?
        let headshot: String?
        let team_logo_espn: String?
    }
    private struct MLBPlayer: Decodable {
        let mlbId: Int
        let name: String
        let teamName: String?
    }
}

extension NativeOnboarding.Player {
    var favoriteSport: String { sport ?? "mlb" }
    var favoriteKey: String { "\(favoriteSport):\(player_id ?? mlb_id.map(String.init) ?? name)" }

    var favoritePortrait: URL? {
        if let mlb_id {
            return URL(string: "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_426,q_auto:best/v1/people/\(mlb_id)/headshot/silo/current")
        }
        guard let url = headshot.flatMap(URL.init(string:)), FeedPostCard.allowedMedia(url) else { return nil }
        return url
    }
}
