import Foundation

struct TrackedPickAPI {
    struct Slate: Decodable {
        let date: String
        let sport: String
        let games: [Game]
    }

    struct Game: Decodable, Identifiable {
        let gameKey: String
        let gamePk: String
        let gameDate: String
        let gameTime: String?
        let awayAbbr: String
        let homeAbbr: String
        let awayTeam: String
        let homeTeam: String
        let awayLogo: URL?
        let homeLogo: URL?
        let status: String
        let players: [Player]
        var id: String { gameKey }
    }

    struct Player: Decodable, Identifiable {
        let playerId: String
        let mlbId: Int?
        let name: String
        let team: String
        let position: String?
        let headshotUrl: URL?
        let teamLogo: URL?
        let colors: [String]?
        let markets: [Market]
        var id: String { playerId }
    }

    struct Market: Decodable, Identifiable {
        let key: String
        let propType: String
        let label: String
        let line: Double?
        let offers: [Offer]
        var id: String { key + ":" + (line.map { String($0) } ?? "") }

        func title(_ side: Offer.Side) -> String {
            if propType == "double_double" || propType == "triple_double" { return "\(side == .under ? "No" : "Yes") \(label)" }
            if key.hasSuffix(":milestone"), let line { return "\(line.formatted())+ \(label)" }
            if side == .milestone || line == nil { return label }
            return "\(side.label) \(line?.formatted() ?? "") \(label)"
        }
    }

    struct Offer: Decodable {
        enum Side: String, Decodable, CaseIterable {
            case milestone, over, under
            var label: String { self == .milestone ? "Milestone" : rawValue.capitalized }
        }
        let vendor: String
        let side: Side
        let odds: Int
    }

    struct Leg: Identifiable, Codable {
        let sport: String
        let player_id: String
        let mlb_id: Int?
        let player_name: String
        let team: String
        let headshot_url: URL?
        let game_pk: String
        let game_date: String
        let prop_key: String
        let prop_label: String
        let line: String
        let numeric_line: Double?
        let market_side: String
        let book: String
        let odds: Int

        var id: String { "\(game_pk):\(player_id):\(prop_key):\(numeric_line ?? 0):\(market_side):\(book)" }

        init(sport: String, game: Game, player: Player, market: Market, offer: Offer) {
            self.sport = sport
            player_id = player.playerId
            mlb_id = player.mlbId
            player_name = player.name
            team = player.team
            headshot_url = player.headshotUrl
            game_pk = game.gamePk
            game_date = game.gameDate
            prop_key = market.propType
            prop_label = market.label
            line = market.title(offer.side)
            numeric_line = market.line
            market_side = offer.side.rawValue
            book = offer.vendor
            odds = offer.odds
        }
    }

    struct Draft: Encodable {
        let draftId: UUID
        let sport: String
        let content: String
        let legs: [Leg]
        let visibility: String
        let isSpoiler: Bool
        let wager: Double?
        let imageUrl: URL?
        var groupId: String? = nil
    }

    let account: AccountStore
    let userID: UUID

    func games(sport: String, date: Date?) async throws -> Slate {
        var query = [URLQueryItem(name: "sport", value: sport)]
        if let date { query.append(.init(name: "date", value: SlateDate.key(date))) }
        let data = try await SlipSurgeHTTP.memberData("/api/mobile/picks/games", query: query, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let slate = try decoder.decode(Slate.self, from: data)
        guard slate.sport == sport, slate.games.count <= 32 else { throw URLError(.cannotParseResponse) }
        return slate
    }

    func post(_ draft: Draft) async throws -> UUID {
        let token = try await account.accessToken(for: userID)
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/posts/pick", timeout: 120)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(draft)
        let data = try await SlipSurgeHTTP.send(request)
        struct Result: Decodable { let id: UUID; let picksTracked: Bool }
        let response = try JSONDecoder().decode(Result.self, from: data)
        guard response.picksTracked, await account.memberID == userID else { throw URLError(.cannotParseResponse) }
        return response.id
    }
}
