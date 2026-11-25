import Foundation

enum NativeSiteLink: Hashable {
    case feed(NativeFeedSelection), account, discover(DiscoverDestination), information(InformationPage)
    case post(UUID), profile(String), community(String, CommunitySection)
    case notifications, bookmarks, picks, messages, newMessage, directMessage(String), groupMessage(UUID)
    case channels, channel(String), pricing, preview(Preview), registration, passwordRecovery
    case settings(Settings), creatorStudio(AccountWorkspaceView.StudioSection), creatorPayouts, creatorStoreSetup, communityCreator(UUID?), researchWorkspace, admin
    case activityReplay, missions, launch
    case search(String), topic(String), explore
    case scoreGame(String, String)
    case marketplace(NativeMarketplaceTarget)
    case creatorStorefront(String, CreatorDetailView.Section), creatorOffer(UUID)
    case creatorAccess(UUID, CreatorAccessCompletionView.Outcome?)
    case nbaEntity(NbaDirectoryEntityView.Kind, Int, game: Int?, mode: CourtResearchMode)
    case nflEntity(NflDirectoryEntityView.Kind, String)
    case mlbTeam(Int)
    case adminMarketplace, adminCreatorBusiness, adminPipelineHealth, adminBrowserAutomation, adminSocialPlatforms, adminEmail, adminDiscord, adminDiscordComposer
    case adminWhop(AdminWhopView.Page)
    case adminPlatformSettings(AdminPlatformSettingsView.Page)
    case adminSection(AdminSection)
    case eventCreate, threadCreate(String?), storyCreate

    enum CommunitySection: Hashable {
        case posts, picks, settings, channels(String?)
    }

    enum Preview: String { case nba, nfl }

    enum AdminSection: Hashable {
        case reports, deletions, members, banned, recentSignIns, badges, nflAccess, audit, notifications
        case groups, events, forum, posts, stories, articles, pages, emoji, rollouts, banner, changelog
    }

    enum Settings: String {
        case account, profile, connections, security, privacy, notifications, interests, membership, blocked, research
    }

    init?(_ url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.user == nil, parts.password == nil, parts.port == nil,
              url.absoluteString.utf8.count <= 4096 else { return nil }
        let web = parts.scheme?.lowercased() == "https" &&
            [SlipSurgeHTTP.site, "slipsurge.com"].contains(parts.host?.lowercased() ?? "")
        let app = parts.scheme == "slipsurge-app" && parts.host == "site"
        guard web || app else { return nil }

        let path = parts.percentEncodedPath
        guard path.isEmpty || path.hasPrefix("/"),
              !path.contains("//"), !path.contains("%"), !path.contains("\\"),
              path.utf8.count <= 768 else { return nil }
        let segments = path.split(separator: "/").map(String.init)
        let query = parts.queryItems ?? []
        guard query.count <= 16 else { return nil }
        let category = Self.queryValue(query, named: "category", pattern: #"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$"#)
        let groupView = Self.queryValue(query, named: "view", pattern: #"^(chat|picks|posts)$"#)
        let groupChannel = Self.queryValue(query, named: "channel", pattern: Self.slugPattern)

        if segments.count == 1, let information = InformationPage(rawValue: segments[0]) {
            self = .information(information)
            return
        }

        switch segments {
        case [], ["home"], ["feed"]:
            let filter = Self.queryValue(query, named: "filter", pattern: #"^(latest|top|picks|following)$"#)
                .flatMap(FeedFilter.init(rawValue:)) ?? .latest
            let sport = Self.queryValue(query, named: "sport", pattern: #"^(?i:mlb|nba|nfl)$"#)?.uppercased() ?? ""
            let refresh = app && Self.queryValue(query, named: "refresh", pattern: "^stories$") == "stories"
            self = .feed(.init(filter: filter, sport: sport, refreshStories: refresh))
        case ["account"], ["settings"], ["auth", "login"], ["onboarding"]: self = .account
        case ["auth", "register"]: self = .registration
        case ["auth", "forgot-password"]: self = .passwordRecovery
        case ["pricing"]: self = .pricing
        case ["pro"]: self = .pricing
        case ["discover"], ["groups"], ["community"]: self = .discover(.communities)
        case ["explore"]: self = .explore
        case ["creators"]: self = .discover(.creators)
        case ["leaderboard"]: self = .discover(.leaderboard)
        case ["scores"], ["sports"]:
            let rawDate = Self.queryValue(query, named: "date", pattern: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#)
            let date = rawDate.flatMap(SlateDate.fromKey).flatMap { SlateDate.key($0) == rawDate ? $0 : nil }
            let league = parts.fragment?.split(separator: "-")
            let filter = league?.count == 2 && league?.first == "scores" ? String(league?[1] ?? "") : ""
            self = .discover(.scores(date: date, league: Self.scoreLeagues.contains(filter) ? filter : ""))
        case ["events"]: self = .discover(.events(nil))
        case ["events", "create"]: self = .eventCreate
        case ["forum"]: self = .discover(.discussions)
        case ["forum", "new"]: self = .threadCreate(Self.queryValue(query, named: "category", pattern: Self.slugPattern))
        case ["stories", "create"]: self = .storyCreate
        case ["blog"]: self = .discover(.articles(false))
        case ["blog", "my"]: self = .discover(.articles(true))
        case ["blog", "create"]: self = .discover(.articleEditor(nil, assistant: false))
        case ["blog", "create", "ai"]: self = .discover(.articleEditor(nil, assistant: true))
        case ["pages"]: self = .discover(.pages(category ?? "", create: false))
        case ["pages", "create"]: self = .discover(.pages(category ?? "", create: true))
        case ["notifications"]: self = .notifications
        case ["search"]:
            let values = query.filter { $0.name == "q" }
            let value = values.first?.value ?? ""
            guard values.count <= 1, value.utf8.count <= 256,
                  !value.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains) else { return nil }
            self = .search(String(value.prefix(64)))
        case ["activity"]: self = .activityReplay
        case ["missions"]: self = .missions
        case ["bookmarks"]: self = .bookmarks
        case ["picks"]: self = .picks
        case ["messages"]: self = .messages
        case ["messages", "new"]: self = .newMessage
        case ["channels"]: self = .channels
        case ["groups", "create"]:
            let offers = query.filter { $0.name == "offer" }
            guard offers.count <= 1 else { return nil }
            self = .communityCreator(offers.first?.value.flatMap(UUID.init(uuidString:)))
        case ["creators", "studio"], ["creators", "apply"]:
            let entries = query.filter { $0.name == "section" }
            guard entries.count <= 1 else { return nil }
            let section = entries.first?.value.flatMap(AccountWorkspaceView.StudioSection.init(rawValue:)) ?? .overview
            if Self.queryValue(query, named: "setup", pattern: "^1$") == "1" { self = .creatorStoreSetup }
            else if section == .communities, let offers = Self.queryValue(query, named: "offer", pattern: #"^[a-fA-F0-9-]{36}$"#),
                    let id = UUID(uuidString: offers) { self = .communityCreator(id) }
            else { self = .creatorStudio(section) }
        case ["creators", "payouts"]: self = .creatorPayouts
        case ["workspace"]: self = .researchWorkspace
        case ["marketplace"]:
            let sports = query.filter { $0.name == "sport" }
            let authors = query.filter { $0.name == "author" }
            let shares = query.filter { $0.name == "share" }
            guard sports.count <= 1, authors.count <= 1, shares.count <= 1 else { return nil }
            let league = sports.first?.value.flatMap(NativeMarketplaceTarget.League.init(rawValue:))
            let author = authors.first?.value.flatMap(UUID.init(uuidString:))
            let share = shares.first?.value
            let publication: NativeMarketplaceTarget.Publication? = share == "1" ? .chooser :
                share.flatMap(UUID.init(uuidString:)).map(NativeMarketplaceTarget.Publication.matrix)
            guard sports.isEmpty || league != nil, authors.isEmpty || author != nil,
                  shares.isEmpty || publication != nil else { return nil }
            let targetLeague = league ?? (author != nil || publication != nil ? .mlb : nil)
            self = .marketplace(.init(league: targetLeague, author: author, publication: publication))
        case ["marketplace", "sell"]: self = .marketplace(.init(league: .mlb, publication: .chooser))
        case ["launch"]: self = .launch
        case ["admin"]: self = .admin
        case ["admin", "marketplace"]: self = .adminMarketplace
        case ["admin", "creators"], ["admin", "jobs"]: self = .adminCreatorBusiness
        case ["admin", "pipeline-health"]: self = .adminPipelineHealth
        case ["admin", "browserbase"]: self = .adminBrowserAutomation
        case ["admin", "social-platforms"]: self = .adminSocialPlatforms
        case ["admin", "settings", "email"]: self = .adminEmail
        case ["admin", "settings"], ["admin", "settings", "general"]: self = .adminPlatformSettings(.general)
        case ["admin", "settings", "social-login"]: self = .adminPlatformSettings(.login)
        case ["admin", "settings", "ai"]: self = .adminPlatformSettings(.writing)
        case ["admin", "settings", "custom-code"]: self = .adminPlatformSettings(.code)
        case ["admin", "monetization"], ["admin", "ads"]: self = .adminWhop(.activity)
        case ["admin", "settings", "payments"]: self = .adminWhop(.connection)
        case ["admin", "whop-renewal-shape"]: self = .adminWhop(.verification)
        case ["admin", "discord"]: self = .adminDiscord
        case ["admin", "discord", "compose"]: self = .adminDiscordComposer
        case ["admin", "reports"], ["admin", "content", "reports"]: self = .adminSection(.reports)
        case ["admin", "users", "deletions"]: self = .adminSection(.deletions)
        case ["admin", "users"], ["admin", "users", "verify"]: self = .adminSection(.members)
        case ["admin", "users", "banned"]: self = .adminSection(.banned)
        case ["admin", "users", "online"]: self = .adminSection(.recentSignIns)
        case ["admin", "badges"]: self = .adminSection(.badges)
        case ["admin", "nfl-access"]: self = .adminSection(.nflAccess)
        case ["admin", "audit"]: self = .adminSection(.audit)
        case ["admin", "notifications"]: self = .adminSection(.notifications)
        case ["admin", "groups"], ["admin", "live"]: self = .adminSection(.groups)
        case ["admin", "events"]: self = .adminSection(.events)
        case ["admin", "forum"]: self = .adminSection(.forum)
        case ["admin", "content", "posts"]: self = .adminSection(.posts)
        case ["admin", "content", "stories"]: self = .adminSection(.stories)
        case ["admin", "content", "blogs"]: self = .adminSection(.articles)
        case ["admin", "pages"]: self = .adminSection(.pages)
        case ["admin", "emojis"]: self = .adminSection(.emoji)
        case ["admin", "settings", "features"]: self = .adminSection(.rollouts)
        case ["admin", "site-banner"]: self = .adminSection(.banner)
        case ["admin", "changelog"]: self = .adminSection(.changelog)
        default:
            if segments.count == 2 {
                let name = segments[1]
                switch segments[0] {
                case "posts":
                    guard let id = UUID(uuidString: name) else { return nil }
                    self = .post(id)
                case "profile", "messages":
                    guard Self.matches(name, #"^[A-Za-z0-9._-]{1,80}$"#) else { return nil }
                    self = segments[0] == "profile" ? .profile(name) : .directMessage(name)
                case "groups":
                    guard Self.matches(name, Self.slugPattern) else { return nil }
                    if groupView == "chat" { self = .community(name, .channels(groupChannel)) }
                    else { self = .community(name, groupView == "picks" ? .picks : .posts) }
                case "channels":
                    guard Self.matches(name, Self.slugPattern) else { return nil }
                    self = .channel(name)
                case "marketplace":
                    guard let id = UUID(uuidString: name) else { return nil }
                    self = .marketplace(.init(league: .mlb, listing: id))
                case "creators":
                    guard Self.matches(name, #"^[A-Za-z0-9._-]{1,80}$"#) else { return nil }
                    self = .creatorStorefront(name, parts.fragment.flatMap(CreatorDetailView.Section.init(rawValue:)) ?? .memberships)
                case "settings":
                    guard let section = Settings(rawValue: name) else { return nil }
                    self = .settings(section)
                case "preview":
                    guard let league = Preview(rawValue: name) else { return nil }
                    self = .preview(league)
                case "events":
                    guard let id = UUID(uuidString: name) else { return nil }
                    self = .discover(.events(id))
                case "hashtag":
                    guard Self.matches(name, #"^[a-zA-Z0-9_-]{1,50}$"#) else { return nil }
                    self = .topic(name)
                case "forum":
                    guard name != "thread", Self.matches(name, #"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$"#) else { return nil }
                    self = .discover(.discussionCategory(name))
                case "blog":
                    guard name != "edit", Self.matches(name, #"^[a-z0-9-]{1,180}$"#) else { return nil }
                    self = .discover(.article(name))
                case "pages":
                    guard Self.matches(name, #"^[a-z0-9-]{1,80}$"#) else { return nil }
                    self = .discover(.page(name, manage: false))
                default: return nil
                }
            } else if segments.count == 3 {
                let name = segments[2]
                switch Array(segments.prefix(2)) {
                case ["messages", "group"], ["forum", "thread"], ["blog", "edit"]:
                    guard let id = UUID(uuidString: name) else { return nil }
                    switch segments[0] {
                    case "messages": self = .groupMessage(id)
                    case "forum": self = .discover(.discussion(id))
                    default: self = .discover(.articleEditor(id, assistant: false))
                    }
                case ["creators", "offers"]:
                    guard let id = UUID(uuidString: name) else { return nil }
                    self = .creatorOffer(id)
                case ["creators", "access"]:
                    let products = query.filter { $0.name == "product" }
                    let states = query.filter { $0.name == "status" }
                    guard name == "complete", products.count == 1, states.count <= 1,
                          let rawID = products.first?.value, let id = UUID(uuidString: rawID) else { return nil }
                    self = .creatorAccess(id, states.first?.value.flatMap(CreatorAccessCompletionView.Outcome.init(rawValue:)))
                case ["nba", "players"], ["nba", "teams"]:
                    guard let id = Self.entityID(name) else { return nil }
                    let games = query.filter { $0.name == "game" }
                    let modes = query.filter { $0.name == "mode" }
                    let game = games.first?.value.flatMap(Self.entityID)
                    let mode = modes.first?.value.flatMap(CourtResearchMode.init(rawValue:))
                    guard games.count <= 1, games.isEmpty || game != nil,
                          modes.count <= 1, modes.isEmpty || mode != nil else { return nil }
                    self = .nbaEntity(segments[1] == "players" ? .player : .team, id, game: game, mode: mode ?? .pregame)
                case ["nfl", "players"]:
                    guard Self.matches(name, #"^00-[0-9]{7}$"#) else { return nil }
                    self = .nflEntity(.player, name)
                case ["nfl", "teams"]:
                    let team = name.uppercased()
                    guard Self.matches(team, #"^[A-Z]{2,3}$"#) else { return nil }
                    self = .nflEntity(.team, team)
                case ["mlb", "teams"]:
                    guard let id = Self.entityID(name), id <= 999_999 else { return nil }
                    self = .mlbTeam(id)
                default:
                    if segments[0] == "sports", Self.scoreLeagues.contains(segments[1]) {
                        let sport = segments[1]
                        guard Self.matches(name, #"^[0-9]{1,14}$"#) ||
                            sport == "nfl" && Self.matches(name, #"^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$"#) else { return nil }
                        self = .scoreGame(sport, name)
                        return
                    }
                    guard name == "settings" else { return nil }
                    let slug = segments[1]
                    if segments[0] == "groups", Self.matches(slug, Self.slugPattern) { self = .community(slug, .settings) }
                    else if segments[0] == "pages", Self.matches(slug, #"^[a-z0-9-]{1,80}$"#) { self = .discover(.page(slug, manage: true)) }
                    else { return nil }
                }
            } else { return nil }
        }
    }

    var needsMember: Bool {
        switch self {
        case .notifications, .activityReplay, .missions, .search, .topic, .explore, .bookmarks, .picks, .messages, .newMessage, .directMessage, .groupMessage,
            .channels, .channel, .settings, .creatorStudio, .creatorPayouts, .creatorStoreSetup, .communityCreator, .researchWorkspace, .admin,
            .marketplace, .nbaEntity, .nflEntity, .mlbTeam, .creatorAccess, .adminMarketplace, .adminCreatorBusiness, .adminPipelineHealth,
            .adminBrowserAutomation, .adminSocialPlatforms, .adminEmail, .adminDiscord, .adminDiscordComposer, .adminWhop, .adminPlatformSettings, .adminSection,
            .eventCreate, .threadCreate, .storyCreate,
            .community(_, .settings), .community(_, .channels): true
        default: false
        }
    }

    private static let slugPattern = #"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$"#
    private static let scoreLeagues: Set<String> = ["nba", "nfl", "mlb", "nhl", "soccer"]

    private static func entityID(_ value: String) -> Int? {
        guard matches(value, #"^[0-9]{1,10}$"#), let id = Int(value), id > 0 else { return nil }
        return id
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value != "." && value != ".." && value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func queryValue(_ items: [URLQueryItem], named name: String, pattern: String) -> String? {
        let matching = items.filter { $0.name == name }
        guard matching.count == 1, let value = matching[0].value, matches(value, pattern) else { return nil }
        return value
    }
}
