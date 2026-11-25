import SwiftUI

struct ResearchDeepLink: Hashable {
    enum Tool: String {
        case dugout
        case spray = "spray-charts"
        case weather = "weather-lab"
        case pitcher = "pitcher-report"
        case publicPicks = "the-public"
        case costs = "batter-cost"
        case oddsMovement = "odds-terminal"
        case synergy
        case mlbPlayer = "mlb-player"
        case slateBreakdown = "slate-breakdown"
        case workspace = "research"
        case sideline = "the-sideline"
        case court = "the-paint"
    }

    let tool: Tool
    let date: Date?
    let gameID: Int?
    let nflGameID: String?
    let synergyGame: String?
    let synergyRank: DugoutSynergy.Ranking?
    let pitcherID: Int?
    let playerID: Int?
    let players: Set<Int>?
    let result: DugoutSpraySlate.Result
    let heat: Bool
    let courtEntry: CourtView.Entry?
    let courtMode: CourtResearchMode?
    let sidelineEntry: SidelineView.Entry?
    let book: String?
    let workspaceGame: String?
    let workspacePanel: DugoutWorkspaceGame.Panel?
    let workspacePlayer: Int?

    init?(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil, components.port == nil, components.fragment == nil else { return nil }
        let isWebsite = components.scheme == "https" && [SlipSurgeHTTP.site, "slipsurge.com"].contains(components.host ?? "")
        let isNative = components.scheme == "slipsurge-research" && components.host == "research"
        let isSiteScheme = components.scheme == "slipsurge-app" && components.host == "site"
        guard isWebsite || isNative || isSiteScheme else { return nil }
        let encodedPath = components.percentEncodedPath
        let profilePrefix = "/players/"
        let profilePathID = (isWebsite || isSiteScheme) && encodedPath.hasPrefix(profilePrefix) ? String(encodedPath.dropFirst(profilePrefix.count)) : nil
        let tool: Tool
        if profilePathID != nil {
            tool = .mlbPlayer
        } else {
            guard let matched = Tool(rawValue: String(encodedPath.dropFirst())), encodedPath == "/" + matched.rawValue,
                  matched != .mlbPlayer || isNative else { return nil }
            tool = matched
        }
        let items = components.queryItems ?? []
        guard items.count <= 6 else { return nil }
        var values: [String: String] = [:]
        for item in items {
            guard let value = item.value, value.utf8.count <= 720, values[item.name] == nil else { return nil }
            values[item.name] = value
        }

        let allowed: Set<String>
        switch tool {
        case .mlbPlayer: allowed = profilePathID == nil ? ["id"] : []
        case .spray: allowed = ["date", "game", "players", "result", "view"]
        case .pitcher: allowed = ["date", "pitcherId"]
        case .weather, .dugout, .oddsMovement, .slateBreakdown: allowed = ["date", "game"]
        case .workspace: allowed = ["date", "game", "view", "detail"]
        case .court, .sideline: allowed = ["date", "game", "view", "mode", "book"]
        case .synergy: allowed = ["game", "sort"]
        case .publicPicks, .costs: allowed = ["date"]
        }
        guard Set(values.keys).isSubset(of: allowed) else { return nil }
        let rawDate = values["date"]
        let date = rawDate.flatMap(SlateDate.fromKey)
        if let rawDate, date.map(SlateDate.key) != rawDate { return nil }
        let rawGame = values["game"]
        let gameID = tool == .sideline || tool == .synergy ? nil : rawGame.flatMap(Self.positiveID)
        let nflGameID = tool == .sideline ? rawGame : nil
        let synergyGame = tool == .synergy ? rawGame : nil
        let workspaceGame = tool == .workspace && gameID == nil ? rawGame : nil
        let synergyRank = values["sort"].flatMap(DugoutSynergy.Ranking.init(rawValue:))
        if values["sort"] != nil, synergyRank == nil { return nil }
        if let nflGameID {
            guard nflGameID.range(of: #"^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$"#, options: .regularExpression) != nil else { return nil }
        } else if let synergyGame {
            guard synergyGame.range(of: #"^[A-Z0-9]{2,3}@[A-Z0-9]{2,3}(-G[1-9])?$"#, options: .regularExpression) != nil else { return nil }
        } else if let workspaceGame {
            guard workspaceGame.range(of: #"^[A-Z0-9]{2,3}@[A-Z0-9]{2,3}(-G[1-9])?$"#, options: .regularExpression) != nil else { return nil }
        } else if rawGame != nil, gameID == nil { return nil }
        let pitcherID = values["pitcherId"].flatMap(Self.positiveID)
        if values["pitcherId"] != nil, pitcherID == nil { return nil }
        let playerID = (profilePathID ?? values["id"]).flatMap(Self.positiveID)
        if tool == .mlbPlayer {
            guard let playerID, playerID < 10_000_000 else { return nil }
        }
        var players: Set<Int>?
        if let filter = values["players"] {
            let ids = filter.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
            let parsed = ids.compactMap(Self.positiveID)
            guard !parsed.isEmpty, parsed.count == ids.count, parsed.count <= 60 else { return nil }
            players = Set(parsed)
        }
        guard let result = DugoutSpraySlate.Result(rawValue: values["result"] ?? "all") else { return nil }
        let rawView = values["view"]
        let rawMode = values["mode"]
        let courtEntry = tool == .court ? rawView.flatMap(CourtView.Entry.init(rawValue:)) : nil
        let courtMode = tool == .court ? rawMode.flatMap(CourtResearchMode.init(rawValue:)) : nil
        let sidelineEntry = tool == .sideline ? (rawMode ?? rawView).flatMap(SidelineView.Entry.init(rawValue:)) : nil
        switch tool {
        case .court:
            guard rawView == nil || courtEntry != nil, rawMode == nil || courtMode != nil else { return nil }
        case .sideline:
            guard rawMode == nil || rawView == nil, rawMode == nil && rawView == nil || sidelineEntry != nil else { return nil }
        case .spray:
            guard rawView == nil || rawView == "points" || rawView == "heat" else { return nil }
        default: break
        }
        let book = values["book"]
        if let book, book != "all" {
            guard book.range(of: #"^[a-z0-9_]{1,30}$"#, options: .regularExpression) != nil, Sportsbook.isKnown(book) else { return nil }
        }

        self.tool = tool
        self.date = date
        self.gameID = gameID
        self.nflGameID = nflGameID
        self.synergyGame = synergyGame
        self.synergyRank = synergyRank
        self.pitcherID = pitcherID
        self.playerID = playerID
        self.players = players
        self.result = result
        heat = rawView == "heat"
        self.courtEntry = courtEntry
        self.courtMode = courtMode
        self.sidelineEntry = sidelineEntry
        self.book = book
        self.workspaceGame = workspaceGame
        workspacePanel = tool == .workspace ? rawView.flatMap(DugoutWorkspaceGame.Panel.init(rawValue:)) : nil
        workspacePlayer = tool == .workspace ? values["detail"].flatMap(Self.positiveID) : nil
    }

    init?(sitePath: String) {
        guard let components = URLComponents(string: sitePath), components.scheme == nil, components.host == nil,
              components.percentEncodedPath.hasPrefix("/"), !components.percentEncodedPath.contains("\\"),
              let base = URL(string: "https://" + SlipSurgeHTTP.site),
              let absolute = URL(string: sitePath, relativeTo: base)?.absoluteURL else { return nil }
        self.init(absolute)
    }

    private static func positiveID(_ string: String) -> Int? {
        guard string.range(of: #"^[1-9][0-9]{0,9}$"#, options: .regularExpression) != nil else { return nil }
        return Int(string)
    }
}

struct LinkedResearchView: View {
    let account: AccountStore
    let link: ResearchDeepLink
    var preferredBook: String? = nil

    var body: some View {
        let date = link.date ?? .now
        switch link.tool {
        case .sideline:
            if let userID = account.memberID {
                SidelineView(api: SidelineAPI(scope: .member(account, userID)), date: link.date, linkedGame: link.nflGameID,
                    entry: link.sidelineEntry ?? .core, book: link.book ?? preferredBook)
            } else if link.date != nil || link.nflGameID != nil || link.sidelineEntry != nil {
                ContentUnavailableView("Sign in to open this matchup", systemImage: "lock")
            } else { SidelineView(api: SidelineAPI()) }
        case .court:
            if let userID = account.memberID {
                CourtView(scope: .member(account, userID), date: date, linkedGame: link.gameID,
                    entry: link.courtEntry ?? .research, startingMode: link.courtMode ?? .pregame,
                    book: link.book ?? preferredBook, comparisonBook: link.book)
            } else if link.date != nil || link.gameID != nil || link.courtEntry != nil || link.courtMode == .live {
                ContentUnavailableView("Sign in to open this matchup", systemImage: "lock")
            } else { CourtView(scope: .preview) }
        default:
            if let userID = account.memberID {
                mlb(userID, date: date)
            } else {
                ContentUnavailableView("Sign in to open this research", systemImage: "lock")
            }
        }
    }

    @ViewBuilder
    private func mlb(_ userID: UUID, date: Date) -> some View {
        let api = DugoutAPI(account: account, userID: userID)
        let tools = DugoutToolsAPI(account: account, userID: userID)
        switch link.tool {
        case .dugout: DugoutView(api: api, date: date, linkedGame: link.gameID)
        case .spray: DugoutSprayView(api: tools, date: date, game: link.gameID, players: link.players, result: link.result, heat: link.heat)
        case .weather: DugoutWeatherView(api: tools, date: date, game: link.gameID)
        case .pitcher: DugoutPitcherReport(api: api, date: date, linkedPitcher: link.pitcherID)
        case .publicPicks: DugoutMarketSlateView(api: api, date: date, mode: .publicPicks)
        case .costs: DugoutMarketSlateView(api: api, date: date, mode: .cost)
        case .oddsMovement: DugoutOddsTerminal(api: api, date: date, selectedGame: link.gameID)
        case .synergy: DugoutSynergy(api: api, game: link.synergyGame ?? "", ranking: link.synergyRank ?? .best)
        case .mlbPlayer:
            if let id = link.playerID { DugoutPlayerProfileView(api: .init(account: account, userID: userID), playerID: id) }
        case .slateBreakdown:
            DugoutSlateBreakdown(api: .init(account: account, userID: userID), date: date, selectedGame: link.gameID)
        case .workspace:
            DugoutWorkspaceView(api: api, initialGameID: link.gameID, initialGameKey: link.workspaceGame,
                initialPanel: link.workspacePanel, initialPlayer: link.workspacePlayer, date: date)
        case .sideline, .court: EmptyView()
        }
    }
}
