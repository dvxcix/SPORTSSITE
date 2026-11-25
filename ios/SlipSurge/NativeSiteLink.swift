import Foundation

enum NativeSiteLink: Hashable {
    case feed, account, discover(DiscoverDestination), information(InformationPage)
    case post(UUID), profile(String), community(String, CommunitySection)
    case notifications, bookmarks, picks, messages, newMessage, directMessage(String), groupMessage(UUID)
    case channels, channel(String), pricing, preview(Preview), registration, passwordRecovery
    case settings(Settings), creatorStudio, creatorPayouts, communityCreator, researchWorkspace, admin

    enum CommunitySection: Hashable {
        case posts, picks, settings, channels(String?)
    }

    enum Preview: String { case nba, nfl }

    enum Settings: String {
        case account, profile, connections, security, privacy, notifications, interests, membership
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
        case [], ["home"], ["feed"]: self = .feed
        case ["account"], ["settings"], ["auth", "login"]: self = .account
        case ["auth", "register"]: self = .registration
        case ["auth", "forgot-password"]: self = .passwordRecovery
        case ["pricing"]: self = .pricing
        case ["discover"], ["explore"], ["groups"], ["community"]: self = .discover(.communities)
        case ["creators"]: self = .discover(.creators)
        case ["leaderboard"]: self = .discover(.leaderboard)
        case ["scores"], ["sports"]: self = .discover(.scores)
        case ["events"]: self = .discover(.events(nil))
        case ["forum"]: self = .discover(.discussions)
        case ["blog"]: self = .discover(.articles(false))
        case ["blog", "my"]: self = .discover(.articles(true))
        case ["blog", "create"]: self = .discover(.articleEditor(nil, assistant: false))
        case ["blog", "create", "ai"]: self = .discover(.articleEditor(nil, assistant: true))
        case ["pages"]: self = .discover(.pages(category ?? "", create: false))
        case ["pages", "create"]: self = .discover(.pages(category ?? "", create: true))
        case ["notifications"]: self = .notifications
        case ["bookmarks"]: self = .bookmarks
        case ["picks"]: self = .picks
        case ["messages"]: self = .messages
        case ["messages", "new"]: self = .newMessage
        case ["channels"]: self = .channels
        case ["groups", "create"]: self = .communityCreator
        case ["creators", "studio"], ["creators", "apply"]: self = .creatorStudio
        case ["creators", "payouts"]: self = .creatorPayouts
        case ["workspace"]: self = .researchWorkspace
        case ["admin"]: self = .admin
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
                case "settings":
                    guard let section = Settings(rawValue: name) else { return nil }
                    self = .settings(section)
                case "preview":
                    guard let league = Preview(rawValue: name) else { return nil }
                    self = .preview(league)
                case "events":
                    guard let id = UUID(uuidString: name) else { return nil }
                    self = .discover(.events(id))
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
                default:
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
        case .notifications, .bookmarks, .picks, .messages, .newMessage, .directMessage, .groupMessage,
            .channels, .channel, .settings, .creatorStudio, .creatorPayouts, .communityCreator, .researchWorkspace, .admin,
            .community(_, .settings), .community(_, .channels): true
        default: false
        }
    }

    private static let slugPattern = #"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$"#

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value != "." && value != ".." && value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func queryValue(_ items: [URLQueryItem], named name: String, pattern: String) -> String? {
        let matching = items.filter { $0.name == name }
        guard matching.count == 1, let value = matching[0].value, matches(value, pattern) else { return nil }
        return value
    }
}
