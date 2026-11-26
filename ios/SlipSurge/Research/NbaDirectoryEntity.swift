import SwiftUI

struct NbaDirectoryEntityView: View {
    enum Kind: String, Hashable { case player, team }

    private struct Entity: Decodable {
        struct Team: Decodable, Identifiable {
            let id: Int
            let name: String
            let abbreviation: String
            let logo: URL?
            let conference: String?
            let division: String?
        }

        struct Player: Decodable {
            let id: Int
            let name: String
            let position: String?
            let jersey: String?
            let height: String?
            let weight: String?
            let college: String?
            let draftYear: Int?
            let draftPick: Int?
            let headshot: URL?
            let team: Team
        }

        struct Game: Decodable, Identifiable {
            let id: Int
            let date: String
            let at: String?
            let state: String
            let away: Team
            let home: Team
            let awayScore: Int?
            let homeScore: Int?
        }

        struct Season: Decodable, Identifiable {
            let season: Int
            let games: Int
            let pts: Double?
            let reb: Double?
            let ast: Double?
            let fg3m: Double?
            let min: Double?
            var id: Int { season }
            var title: String { "\(season)–\(String(format: "%02d", (season + 1) % 100))" }
        }

        struct GameLog: Decodable, Identifiable {
            let id: Int
            let gameId: Int
            let date: String
            let season: Int?
            let opponentId: Int
            let home: Bool
            let minutes: String?
            let pts: Double?
            let reb: Double?
            let ast: Double?
            let fg3m: Double?
            let steals: Double?
            let blocks: Double?
        }

        struct Record: Decodable {
            let wins: Int
            let losses: Int
            let points: Double?
            let allowed: Double?
        }

        struct RosterMember: Decodable, Identifiable {
            let id: Int
            let name: String
            let position: String?
            let headshot: URL?
        }

        let team: Team?
        let player: Player?
        let roster: [RosterMember]?
        let teams: [Team]?
        let upcoming: [Game]?
        let recent: [Game]?
        let matchup: Game?
        let seasons: [Season]?
        let logs: [GameLog]?
        let record: Record?
    }

    let api: DiscoverAPI
    let kind: Kind
    let id: Int
    var game: Int?
    var mode = CourtResearchMode.pregame
    @Environment(\.openURL) private var openURL
    @Environment(\.slipPalette) private var slipPalette
    @State private var entity: Entity?
    @State private var board: CourtBoard?
    @State private var observedAt: Date?
    @State private var season: Int?
    @State private var error: (any Error)?
    @State private var revision = 0

    var body: some View {
        Group {
            if let board, let observedAt, let userID = api.userID, kind == .player,
               let player = board.players.first(where: { $0.id == id }) {
                CourtPlayerView(player: player, game: board.game, mode: mode, frozen: board.isFrozen,
                    tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                    researchScope: .member(api.account, userID))
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 13) {
                        if let board, let observedAt, let userID = api.userID {
                            frozenMatchup(board, observedAt: observedAt, userID: userID)
                        } else if let entity, let player = entity.player {
                            playerProfile(player, entity: entity)
                        } else if let entity, let team = entity.team {
                            teamProfile(team, entity: entity)
                        } else if let status = error as? SlipSurgeHTTP.Status, status.code == 404 {
                            ContentUnavailableView(game == nil ? "NBA profile unavailable" : "Matchup research unavailable", systemImage: "basketball")
                        } else {
                            ResearchToolMessage(title: "NBA profile couldn’t load", error: error) { revision += 1 }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(entity?.player?.name ?? entity?.team?.name ?? "NBA")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func frozenMatchup(_ board: CourtBoard, observedAt: Date, userID: UUID) -> some View {
        if kind == .team, let team = [board.game.visitorTeam, board.game.homeTeam].first(where: { $0.id == id }) {
            let colors = CourtTeamColors.colors(for: team.abbreviation)
            DiscoverIdentityCard(title: team.fullName, subtitle: mode == .live ? "Live" : "Pregame",
                detail: nil, avatar: team.logo, banner: nil, symbol: "shield", count: nil)
            ForEach(board.players.filter { $0.team.id == team.id }) { player in
                NavigationLink {
                    CourtPlayerView(player: player, game: board.game, mode: mode, frozen: board.isFrozen,
                        tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                        researchScope: .member(api.account, userID))
                } label: {
                    ResearchToolCard(color: colors.primary) { CourtPlayerIdentity(player: player) } content: { EmptyView() }
                }.buttonStyle(SlipSurgePressStyle())
            }
        } else {
            ContentUnavailableView("Player unavailable in this matchup", systemImage: "person.crop.circle.badge.questionmark")
        }
    }

    @ViewBuilder private func playerProfile(_ player: Entity.Player, entity: Entity) -> some View {
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        hero(title: player.name, subtitle: [player.position, player.jersey.map { "#\($0)" }, player.team.name]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
            logo: player.team.logo, portrait: player.headshot, color: colors.primary, secondary: colors.secondary)
        HStack {
            entityButton("View team", path: "/nba/teams/\(player.team.id)", icon: "shield")
            if let userID = api.userID {
                NativeEntityFavorite(account: api.account, userID: userID, target: .player(.init(mlb_id: nil,
                    player_id: String(player.id), name: player.name, team: player.team.abbreviation, sport: "nba",
                    headshot: player.headshot?.absoluteString, team_logo: player.team.logo?.absoluteString)))
            }
        }
        if let seasons = entity.seasons, !seasons.isEmpty {
            let current = seasons.first { $0.season == season } ?? seasons[0]
            ResearchToolCard(color: colors.primary) {
                HStack {
                    Picker("Season", selection: Binding(get: { current.season }, set: { season = $0 })) {
                        ForEach(seasons) { item in Text(item.title).tag(item.season) }
                    }
                    Spacer()
                    Text("\(current.games.formatted()) games").font(.subheadline).foregroundStyle(.secondary)
                }
            } content: {
                ResearchToolValues(items: [
                    .init(label: "Points", text: ResearchFormat.decimal(current.pts)),
                    .init(label: "Rebounds", text: ResearchFormat.decimal(current.reb)),
                    .init(label: "Assists", text: ResearchFormat.decimal(current.ast)),
                    .init(label: "Threes", text: ResearchFormat.decimal(current.fg3m)),
                    .init(label: "Minutes", text: ResearchFormat.decimal(current.min)),
                ])
            }
        }
        if let games = entity.upcoming, !games.isEmpty { gameSection("Upcoming games", games: games, playerID: player.id) }
        if let logs = entity.logs {
            let visible = logs.filter { season == nil || $0.season == season }
            Text("Game log").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            LazyVStack(spacing: 8) {
                ForEach(visible) { log in
                    let opponent = entity.teams?.first(where: { $0.id == log.opponentId })
                    entityLink("/nba/players/\(player.id)?game=\(log.gameId)&mode=\(mode.rawValue)") {
                        ResearchToolCard(color: colors.primary) {
                            HStack {
                                ResearchArtwork(urls: opponent?.logo.map { [$0] } ?? [], fallback: "basketball")
                                    .frame(width: 29, height: 29)
                                Text([log.home ? "vs." : "at", opponent?.abbreviation ?? ""].joined(separator: " ")).font(.headline)
                                Spacer()
                                Text(log.date).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }
                        } content: {
                            ResearchToolValues(items: [
                                .init(label: "PTS", text: ResearchFormat.decimal(log.pts)),
                                .init(label: "REB", text: ResearchFormat.decimal(log.reb)),
                                .init(label: "AST", text: ResearchFormat.decimal(log.ast)),
                                .init(label: "3PM", text: ResearchFormat.decimal(log.fg3m)),
                            ])
                        }
                    }
                }
            }
        }
        let facts: [(String, String?)] = [
            ("Height", player.height), ("Weight", player.weight.map { "\($0) lb" }), ("College", player.college),
            ("Draft", player.draftYear.map { year in player.draftPick.map { "\(year) · #\($0)" } ?? String(year) }),
        ]
        if facts.contains(where: { $0.1?.isEmpty == false }) {
            Text("Player profile").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            ForEach(facts, id: \.0) { label, value in
                if let value, !value.isEmpty {
                    LabeledContent(label, value: value).padding(12).background(slipPalette.surface, in: .rect(cornerRadius: 12))
                }
            }
        }
    }

    @ViewBuilder private func teamProfile(_ team: Entity.Team, entity: Entity) -> some View {
        let colors = CourtTeamColors.colors(for: team.abbreviation)
        hero(title: team.name, subtitle: [team.conference, team.division].compactMap { $0 }.joined(separator: " · "),
            logo: team.logo, portrait: nil, color: colors.primary, secondary: colors.secondary)
        if let userID = api.userID { NativeEntityFavorite(account: api.account, userID: userID, target: .team("NBA:\(team.id)")) }
        if let record = entity.record {
            ResearchToolCard(color: colors.primary) { Text("Season record").font(.headline) } content: {
                ResearchToolValues(items: [
                    .init(label: "W–L", text: "\(record.wins)–\(record.losses)"),
                    .init(label: "Points", text: ResearchFormat.decimal(record.points)),
                    .init(label: "Allowed", text: ResearchFormat.decimal(record.allowed)),
                    .init(label: "Differential", text: ResearchFormat.signedDecimal(record.points.flatMap { points in record.allowed.map { points - $0 } })),
                ])
            }
        }
        if let games = entity.upcoming { gameSection("Upcoming games", games: games, playerID: nil) }
        if let roster = entity.roster, !roster.isEmpty {
            Text("Roster").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            LazyVStack(spacing: 8) {
                ForEach(roster) { player in
                    entityLink("/nba/players/\(player.id)") {
                        HStack(spacing: 10) {
                            PlayerArtwork(portraits: player.headshot.map { [$0] } ?? [], logo: team.logo,
                                primary: colors.primary, secondary: colors.secondary)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(verbatim: player.name).font(.headline)
                                if let position = player.position { Text(position).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                        }.padding(11).background(slipPalette.surface, in: .rect(cornerRadius: 13))
                    }
                }
            }
        }
        if let games = entity.recent { gameSection("Recent results", games: games, playerID: nil) }
    }

    private func hero(title: String, subtitle: String, logo: URL?, portrait: URL?, color: Color, secondary: Color) -> some View {
        HStack(spacing: 14) {
            ResearchArtwork(urls: [portrait, logo].compactMap { $0 }, fallback: "basketball",
                            pointSize: 108, playerPortrait: portrait != nil)
                .frame(width: 78, height: 78).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: title).font(.title.bold()).accessibilityAddTraits(.isHeader).foregroundStyle(.white)
                if !subtitle.isEmpty { Text(verbatim: subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.86)) }
            }
            Spacer(minLength: 0)
        }.padding(15)
            .background(.linearGradient(colors: [color.opacity(0.84), secondary.opacity(0.6), .black],
                startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 21))
    }

    @ViewBuilder private func gameSection(_ title: String, games: [Entity.Game], playerID: Int?) -> some View {
        if !games.isEmpty {
            Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            ForEach(games) { game in
                let path = playerID.map { "/nba/players/\($0)?game=\(game.id)&mode=\(mode.rawValue)" } ??
                    "/the-paint?date=\(game.date)&game=\(game.id)&mode=\(mode.rawValue)"
                entityLink(path) {
                    ResearchMatchup(away: cardTeam(game.away), home: cardTeam(game.home),
                        subtitle: gameCaption(game), fullWidth: true)
                }
            }
        }
    }

    private func cardTeam(_ team: Entity.Team) -> ResearchMatchup.Team {
        let colors = CourtTeamColors.colors(for: team.abbreviation)
        return .init(name: team.abbreviation, logo: team.logo, color: colors.primary, secondary: colors.secondary)
    }

    private func gameCaption(_ game: Entity.Game) -> String {
        if let away = game.awayScore, let home = game.homeScore {
            return "\(away)–\(home) · \(game.state == "final" ? "Final" : "Live")"
        }
        return game.at.flatMap(SidelineBoard.timestamp)?.formatted(date: .abbreviated, time: .shortened) ?? game.date
    }

    private func entityButton(_ label: String, path: String, icon: String) -> some View {
        entityLink(path) { Label(label, systemImage: icon) }.buttonStyle(.bordered)
    }

    @ViewBuilder private func entityLink<Label: View>(_ path: String, @ViewBuilder label: () -> Label) -> some View {
        if let url = URL(string: "https://" + SlipSurgeHTTP.site + path) {
            Button { openURL(url) } label: { label().contentShape(.rect) }.buttonStyle(SlipSurgePressStyle())
        }
    }

    private func load() async {
        error = nil
        do {
            var query = [URLQueryItem(name: "kind", value: kind.rawValue), .init(name: "id", value: String(id))]
            if let game { query.append(.init(name: "game", value: String(game))) }
            let value = try await api.readPublic(Entity.self, path: "/api/mobile/court/entities", query: query)
            if let game, let userID = api.userID {
                guard let match = value.matchup, match.id == game else { throw URLError(.cannotParseResponse) }
                let court = CourtAPI()
                let games = try await court.slate(date: match.date, account: api.account, userID: userID)
                guard let exact = games.first(where: { $0.id == game }) else {
                    throw SlipSurgeHTTP.Status(code: 404, data: Data())
                }
                let research = try await court.memberBoard(game: exact, mode: mode, account: api.account, userID: userID)
                guard !Task.isCancelled, research.hasUsableResearch else {
                    throw SlipSurgeHTTP.Status(code: 404, data: Data())
                }
                board = research
                observedAt = research.observationID.flatMap(SidelineBoard.timestamp) ?? .now
            }
            guard !Task.isCancelled else { return }
            entity = value
            if season == nil { season = value.seasons?.first?.season }
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
