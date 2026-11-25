import Charts
import SwiftUI

struct NflDirectoryEntityView: View {
    enum Kind: String, Hashable { case player = "players", team = "teams" }

    private struct Entity: Decodable {
        struct Team: Decodable {
            let teamAbbr: String
            let teamName: String
            let teamConf: String?
            let teamDivision: String?
            let teamColor: String?
            let teamColor2: String?
            let teamLogoEspn: URL?
        }

        struct Player: Decodable, Identifiable {
            let gsisId: String
            let displayName: String
            let position: String?
            let positionGroup: String?
            let jerseyNumber: Int?
            let height: Int?
            let weight: Int?
            let collegeName: String?
            let latestTeam: String?
            let yearsOfExperience: Int?
            let draftYear: Int?
            let draftRound: Int?
            let draftPick: Int?
            let status: String?
            let headshot: URL?
            var id: String { gsisId }
        }

        struct Game: Decodable, Identifiable {
            let season: Int
            let week: Int
            let seasonType: String?
            let opponentTeam: String?
            let passingYards: Double?
            let passingTds: Double?
            let interceptions: Double?
            let rushingYards: Double?
            let rushingTds: Double?
            let carries: Double?
            let receivingYards: Double?
            let receivingTds: Double?
            let receptions: Double?
            let targets: Double?
            let fantasyPointsPpr: Double?

            var id: String { "\(season):\(seasonType ?? ""):\(week)" }
        }

        struct Tracking: Decodable, Identifiable {
            let season: Int
            let week: Int
            let seasonType: String?
            let avgTimeToThrow: Double?
            let completionPercentageAboveExpectation: Double?
            let passerRating: Double?
            let avgSeparation: Double?
            let avgCushion: Double?
            let avgYacAboveExpectation: Double?
            let avgTimeToLos: Double?
            let rushYardsOverExpected: Double?
            let avgRushYards: Double?

            var id: String { "\(season):\(seasonType ?? ""):\(week)" }
        }

        let player: Player?
        let team: Team?
        let roster: [Player]?
        let gameLog: [Game]?
        let ngsPassing: [Tracking]?
        let ngsReceiving: [Tracking]?
        let ngsRushing: [Tracking]?
    }

    private enum Metric: String, CaseIterable, Identifiable {
        case passing = "Pass yards", passTouchdowns = "Pass TDs", interceptions = "Interceptions"
        case rushing = "Rush yards", rushTouchdowns = "Rush TDs", carries = "Carries"
        case receiving = "Receiving yards", receivingTouchdowns = "Receiving TDs", receptions = "Receptions", targets = "Targets"
        case fantasy = "Fantasy points"

        var id: String { rawValue }
        func value(in game: Entity.Game) -> Double? {
            switch self {
            case .passing: game.passingYards
            case .passTouchdowns: game.passingTds
            case .interceptions: game.interceptions
            case .rushing: game.rushingYards
            case .rushTouchdowns: game.rushingTds
            case .carries: game.carries
            case .receiving: game.receivingYards
            case .receivingTouchdowns: game.receivingTds
            case .receptions: game.receptions
            case .targets: game.targets
            case .fantasy: game.fantasyPointsPpr
            }
        }
    }

    private enum Form: Int, CaseIterable { case l3 = 3, l5 = 5, l10 = 10 }
    private enum Section: String, CaseIterable { case games = "Game log", tracking = "Next Gen Stats", profile = "Profile" }

    let api: DiscoverAPI
    let kind: Kind
    let id: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @State private var entity: Entity?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var season: Int?
    @State private var metric = Metric.receiving
    @State private var form = Form.l10
    @State private var section = Section.games
    @State private var rosterQuery = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if let entity, let player = entity.player {
                    playerContent(player, entity: entity)
                } else if let entity, let team = entity.team {
                    teamContent(team, roster: entity.roster ?? [])
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 404 {
                    ContentUnavailableView("NFL profile unavailable", systemImage: "football")
                } else {
                    ResearchToolMessage(title: "NFL profile couldn’t load", error: error) { revision += 1 }
                }
            }.padding(16)
        }
        .navigationTitle(entity?.player?.displayName ?? entity?.team?.teamName ?? "NFL")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func playerContent(_ player: Entity.Player, entity: Entity) -> some View {
        let palette = colors(entity.team)
        let facts = [player.position, player.jerseyNumber.map { "#\($0)" }, entity.team?.teamName, player.status].compactMap { $0 }
        banner(title: player.displayName, detail: facts.joined(separator: " · "), portrait: player.headshot, logo: entity.team?.teamLogoEspn, colors: palette)
        HStack {
            if let team = entity.team, let url = siteURL("/nfl/teams/\(team.teamAbbr)") {
                Button("View team", systemImage: "shield") { openURL(url) }.buttonStyle(.bordered)
            }
            if let member = api.userID {
                NativeEntityFavorite(account: api.account, userID: member, target: .player(.init(mlb_id: nil,
                    player_id: player.id, name: player.displayName, team: player.latestTeam ?? "", sport: "nfl",
                    headshot: player.headshot?.absoluteString, team_logo: entity.team?.teamLogoEspn?.absoluteString)))
            }
        }
        Picker("Player profile", selection: $section) {
            ForEach(Section.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        switch section {
        case .games: formAndGames(entity.gameLog ?? [], color: palette.primary)
        case .tracking: tracking(entity)
        case .profile: playerFacts(player)
        }
    }

    @ViewBuilder private func formAndGames(_ history: [Entity.Game], color: Color) -> some View {
        let seasons = Set(history.map(\.season)).sorted(by: >)
        let games = history.filter { $0.season == season }
        let metrics = Metric.allCases.filter { option in games.contains { option.value(in: $0) != nil } }
        let displayedMetric = metrics.contains(metric) ? metric : metrics.first
        if let displayedMetric, let season {
            let recent = Array(games.filter { displayedMetric.value(in: $0) != nil }.prefix(form.rawValue).reversed())
            let values = recent.compactMap { displayedMetric.value(in: $0) }
            let average = values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
            ResearchToolCard(color: color) {
                VStack(alignment: .leading, spacing: 9) {
                    ViewThatFits(in: .horizontal) {
                        HStack { yearPicker(season, seasons: seasons); Spacer(); metricPicker(displayedMetric, metrics: metrics) }
                        VStack(alignment: .leading) { yearPicker(season, seasons: seasons); metricPicker(displayedMetric, metrics: metrics) }
                    }
                    ResearchToolRail(title: "Recent games", choices: Form.allCases, selection: $form, label: { "L\($0.rawValue)" })
                }
            } content: {
                VStack(alignment: .leading, spacing: 8) {
                    if let average {
                        Text("Average \(ResearchFormat.decimal(average))").font(.subheadline.weight(.semibold))
                        Chart {
                            ForEach(recent) { game in
                                if let result = displayedMetric.value(in: game) {
                                    let difference = (result - average) * (displayedMetric == .interceptions ? -1 : 1)
                                    BarMark(x: .value("Week", "W\(game.week)"), y: .value(displayedMetric.rawValue, result))
                                        .foregroundStyle(Brand.signal(difference, for: scheme))
                                }
                            }
                            RuleMark(y: .value("Average", average)).lineStyle(.init(lineWidth: 1, dash: [4, 3])).foregroundStyle(.secondary)
                        }.frame(height: 148)
                    }
                }
            }
            Text("Recent games").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            LazyVStack(spacing: 8) {
                ForEach(games) { game in
                    ResearchToolCard(color: color) {
                        HStack(spacing: 10) {
                            let logo = game.opponentTeam.flatMap(nflLogo)
                            ResearchArtwork(urls: logo.map { [$0] } ?? [], fallback: "football").frame(width: 31, height: 31)
                            Text("Week \(game.week) · \(game.opponentTeam ?? "NFL")").font(.headline)
                            Spacer()
                            if let type = game.seasonType, type != "REG" { Text(type).font(.caption).foregroundStyle(.secondary) }
                        }
                    } content: {
                        ResearchToolValues(items: metrics.prefix(5).map { option in
                            .init(label: option.rawValue, text: ResearchFormat.decimal(option.value(in: game)))
                        })
                    }
                }
            }
        } else {
            ContentUnavailableView("No game logs available", systemImage: "chart.bar")
        }
    }

    private func yearPicker(_ selected: Int, seasons: [Int]) -> some View {
        Picker("Season", selection: Binding(get: { selected }, set: { season = $0 })) {
            ForEach(seasons, id: \.self) { Text(String($0)).tag($0) }
        }
    }

    private func metricPicker(_ selected: Metric, metrics: [Metric]) -> some View {
        Picker("Stat", selection: Binding(get: { selected }, set: { metric = $0 })) {
            ForEach(metrics) { option in Text(option.rawValue).tag(option) }
        }
    }

    @ViewBuilder private func tracking(_ entity: Entity) -> some View {
        let passing = (entity.ngsPassing ?? []).filter { $0.week > 0 }
        let receiving = (entity.ngsReceiving ?? []).filter { $0.week > 0 }
        let rushing = (entity.ngsRushing ?? []).filter { $0.week > 0 }
        if passing.isEmpty && receiving.isEmpty && rushing.isEmpty {
            ContentUnavailableView("No tracking observations", systemImage: "waveform")
        }
        trackingRows("Passing", rows: passing) { [
            .init(label: "Time to throw", text: ResearchFormat.decimal($0.avgTimeToThrow, suffix: " s")),
            .init(label: "Completion over expected", text: ResearchFormat.signedDecimal($0.completionPercentageAboveExpectation, suffix: "%")),
            .init(label: "Passer rating", text: ResearchFormat.decimal($0.passerRating)),
        ] }
        trackingRows("Receiving", rows: receiving) { [
            .init(label: "Separation", text: ResearchFormat.decimal($0.avgSeparation, suffix: " yd")),
            .init(label: "Cushion", text: ResearchFormat.decimal($0.avgCushion, suffix: " yd")),
            .init(label: "YAC over expected", text: ResearchFormat.signedDecimal($0.avgYacAboveExpectation)),
        ] }
        trackingRows("Rushing", rows: rushing) { [
            .init(label: "Time to line of scrimmage", text: ResearchFormat.decimal($0.avgTimeToLos, suffix: " s")),
            .init(label: "Yards over expected", text: ResearchFormat.signedDecimal($0.rushYardsOverExpected)),
            .init(label: "Yards per rush", text: ResearchFormat.decimal($0.avgRushYards)),
        ] }
    }

    @ViewBuilder private func trackingRows(_ title: String, rows: [Entity.Tracking],
        metrics: @escaping (Entity.Tracking) -> [ResearchToolValues.Value]) -> some View {
        if !rows.isEmpty {
            Text(title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            ForEach(rows.prefix(10)) { row in
                ResearchToolCard(color: Brand.accent(for: scheme)) {
                    Text("Week \(row.week) · \(String(row.season))").font(.headline)
                } content: { ResearchToolValues(items: metrics(row)) }
            }
        }
    }

    @ViewBuilder private func playerFacts(_ player: Entity.Player) -> some View {
        let height = player.height.map { "\($0 / 12)′ \($0 % 12)″" }
        let draft = [player.draftYear.map(String.init), player.draftRound.map { "Round \($0)" },
            player.draftPick.map { "Pick \($0)" }].compactMap { $0 }.joined(separator: " · ")
        let rows: [(String, String?)] = [
            ("Height", height), ("Weight", player.weight.map { "\($0) lb" }), ("College", player.collegeName),
            ("Experience", player.yearsOfExperience.map { "\($0) years" }), ("Draft", draft),
        ]
        ForEach(rows, id: \.0) { title, value in
            if let value, !value.isEmpty {
                LabeledContent(title, value: value).padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
            }
        }
    }

    @ViewBuilder private func teamContent(_ team: Entity.Team, roster: [Entity.Player]) -> some View {
        let palette = colors(team)
        banner(title: team.teamName, detail: [team.teamConf, team.teamDivision].compactMap { $0 }.joined(separator: " · "),
            portrait: nil, logo: team.teamLogoEspn, colors: palette)
        if let member = api.userID {
            NativeEntityFavorite(account: api.account, userID: member, target: .team("NFL:\(team.teamAbbr)"))
        }
        Text("Roster").font(.title2.bold()).accessibilityAddTraits(.isHeader)
        TextField("Find a player", text: $rosterQuery)
            .textInputAutocapitalization(.never)
            .padding(.horizontal, 12).frame(minHeight: 44)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
        let players = roster.filter { rosterQuery.isEmpty || $0.displayName.localizedStandardContains(rosterQuery) || $0.position?.localizedStandardContains(rosterQuery) == true }
        let groups = Dictionary(grouping: players) { $0.positionGroup ?? $0.position ?? "Players" }
        if players.isEmpty { ContentUnavailableView("No matching players", systemImage: "person.2") }
        ForEach(groups.keys.sorted(), id: \.self) { group in
            Text(group).font(.headline).foregroundStyle(.secondary)
            LazyVStack(spacing: 8) {
                ForEach(groups[group] ?? []) { player in
                    if let url = siteURL("/nfl/players/\(player.id)") {
                        Button { openURL(url) } label: {
                            HStack(spacing: 10) {
                                PlayerArtwork(portraits: player.headshot.map { [$0] } ?? [], logo: team.teamLogoEspn,
                                    primary: palette.primary, secondary: palette.secondary)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(verbatim: player.displayName).font(.headline)
                                    Text([player.position, player.jerseyNumber.map { "#\($0)" }].compactMap { $0 }.joined(separator: " · "))
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            }.padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
                        }.buttonStyle(SlipSurgePressStyle())
                    }
                }
            }
        }
    }

    private func banner(title: String, detail: String, portrait: URL?, logo: URL?, colors: (primary: Color, secondary: Color)) -> some View {
        HStack(spacing: 14) {
            ResearchArtwork(urls: [portrait, logo].compactMap { $0 }, fallback: "football")
                .frame(width: 78, height: 78).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: title).font(.title.bold()).accessibilityAddTraits(.isHeader).foregroundStyle(.white)
                if !detail.isEmpty { Text(verbatim: detail).font(.subheadline).foregroundStyle(.white.opacity(0.88)) }
            }
            Spacer(minLength: 0)
        }.padding(15)
            .background(.linearGradient(colors: [colors.primary.opacity(0.88), colors.secondary.opacity(0.72), .black],
                startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 21))
    }

    private func colors(_ team: Entity.Team?) -> (primary: Color, secondary: Color) {
        func color(_ key: String?) -> Color? {
            guard let key else { return nil }
            return Color(hex: key.hasPrefix("#") ? key : "#" + key)
        }
        return (color(team?.teamColor) ?? Brand.accent(for: scheme), color(team?.teamColor2) ?? Brand.surface(for: scheme))
    }

    private func nflLogo(_ code: String) -> URL? {
        guard code.range(of: #"^[A-Z]{2,3}$"#, options: .regularExpression) != nil else { return nil }
        let aliases = ["JAC": "jax", "LA": "lar", "WSH": "wsh"]
        return URL(string: "https://a.espncdn.com/i/teamlogos/nfl/500/\(aliases[code] ?? code.lowercased()).png")
    }

    private func siteURL(_ path: String) -> URL? { URL(string: "https://" + SlipSurgeHTTP.site + path) }

    private func load() async {
        error = nil
        do {
            let value = try await api.readPublic(Entity.self, path: "/api/nfl/\(kind.rawValue)/\(id)")
            guard !Task.isCancelled else { return }
            entity = value
            if season == nil {
                season = value.gameLog?.map(\.season).max()
                switch value.player?.position {
                case "QB": metric = .passing
                case "RB", "FB": metric = .rushing
                default: metric = .receiving
                }
            }
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
