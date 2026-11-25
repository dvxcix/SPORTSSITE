import SwiftUI

struct MemberProfileView: View {
    private enum ProfileTab: String, CaseIterable {
        case all = "All", picks = "Picks", replies = "Replies", reposts = "Reposts", media = "Media", communities = "Communities"

        var glyph: String {
            switch self {
            case .all: "text.bubble"
            case .picks: "chart.line.uptrend.xyaxis"
            case .replies: "arrowshape.turn.up.left"
            case .reposts: "arrow.2.squarepath"
            case .media: "photo"
            case .communities: "person.2"
            }
        }
    }

    struct Page: Decodable {
        struct Profile: Decodable {
            struct Team: Decodable, Identifiable {
                let id: String
                let title: String
                let logo: URL?
                let colors: [String]?
            }

            struct Player: Decodable, Identifiable {
                let name: String
                let team: String?
                let sport: String?
                let headshot: URL?
                let teamLogo: URL?
                let mlbId: Int?
                let playerId: String?
                var id: String { [sport, playerId ?? mlbId.map(String.init), name, team].compactMap { $0 }.joined(separator: ":") }
            }

            struct Badge: Decodable, Identifiable {
                let id: String
                let name: String
                let description: String?
                let iconUrl: URL?
                let cardImageUrl: URL?
            }

            struct Social: Decodable {
                let handle: String
                let profileUrl: URL
            }

            struct PublicLink: Decodable, Identifiable {
                let id: UUID
                let name: String
                let handle: String
                let iconUrl: URL?
                let href: URL?
                let verified: Bool
            }

            struct Creator: Decodable {
                struct Offer: Decodable, Identifiable {
                    let id: UUID
                    let title: String
                    let description: String?
                    let price: Double?
                    let currency: String?
                }

                let offers: [Offer]
                let communities: [DiscoverAPI.Communities.Community]
            }

            let id: UUID
            let username: String
            let displayName: String?
            let bio: String?
            let avatarUrl: URL?
            let bannerUrl: URL?
            let avatarRingStyle: String?
            let avatarRingColor: String?
            let sportsbooks: [String]?
            let verified: Bool?
            let isPrivate: Bool?
            let allowMessages: Bool?
            let followerCount: Int?
            let followingCount: Int?
            let postCount: Int?
            let repostCount: Int?
            let location: String?
            let website: URL?
            let createdAt: String?
            let following: Bool
            let own: Bool
            let canView: Bool
            let teams: [Team]
            let players: [Player]
            let sports: [String]
            let badges: [Badge]
            let record: DiscoverAPI.Records.Record?
            let verifiedSocials: [String: Social]
            let socialLinks: [PublicLink]?
            let creator: Creator?

            var name: String { displayName ?? username }
        }

        struct Reply: Decodable, Identifiable {
            let id: UUID
            let text: String
            let createdAt: String
            let postId: UUID
            let parentAuthor: String?
            let parentExcerpt: String?
        }

        let profile: Profile
        let posts: [FeedPost]
        let replies: [Reply]
        let communities: [DiscoverAPI.Communities.Community]
        let hasMore: Bool
        let nextCursor: String?
    }

    let api: DiscoverAPI
    let target: String
    var isYouTab = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var page: Page?
    @State private var error: (any Error)?
    @State private var tab = ProfileTab.all
    @State private var loadedKey: String?
    @State private var failedKey: String?
    @State private var requestNumber = 0
    @State private var pagingError: (any Error)?
    @State private var posts: [FeedPost] = []
    @State private var cursor: String?
    @State private var retry = 0
    @State private var changing = false
    @State private var paging = false
    @State private var confirmBlock = false
    @State private var reportProfile = false
    @State private var notice: String?
    @State private var selectedPost: UUID?
    @State private var showDetails = false

    private var fetchKey: String { "\(target):\(tab.rawValue):\(retry)" }
    private var feed: FeedAPI { FeedAPI(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let profile = page?.profile {
                    MemberProfileHeader(profile: profile, api: api, changing: changing, details: { showDetails = true }) {
                        Task { await change(profile, action: "follow", enabled: !profile.following) }
                    }
                    if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                    if let creator = profile.creator {
                        DisclosureGroup {
                            creatorPanel(profile, creator).padding(.top, 10)
                        } label: {
                            Label("Creator memberships", systemImage: "storefront").font(.subheadline.weight(.semibold))
                        }.padding(.vertical, 5)
                    }
                    if profile.canView, let page {
                        SocialSectionBar(title: "Profile activity", sections: ProfileTab.allCases, selection: $tab, fillsWidth: false) { section in
                            let count = section == .all ? profile.postCount : section == .reposts ? profile.repostCount : nil
                            let name = section == .all ? "Posts" : section.rawValue
                            HStack(spacing: 4) {
                                Text(name)
                                if let count { Text(count.formatted()).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                            }
                            .accessibilityElement(children: .combine)
                        }
                        if loadedKey == fetchKey { profileActivity(page) }
                        if loadedKey != fetchKey || failedKey == fetchKey {
                            ResearchToolMessage(title: "\(tab.rawValue) couldn’t load", error: failedKey == fetchKey ? error : nil) { retry += 1 }
                        }
                    } else {
                        ContentUnavailableView("Private account", systemImage: "lock", description: Text("Follow to see this member’s posts and picks."))
                    }
                } else if let response = error as? SlipSurgeHTTP.Status, response.code == 404 {
                    ContentUnavailableView("Profile unavailable", systemImage: "person.crop.circle.badge.xmark")
                } else {
                    ResearchToolMessage(title: "Profile couldn’t load", error: error) { retry += 1 }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 14)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle(isYouTab ? "You" : page?.profile.username ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
        .socialDetail(!isYouTab)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationDestination(item: $selectedPost) { id in FeedThreadView(api: feed, id: id) }
        .toolbar {
            if let profile = page?.profile {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Profile actions", systemImage: "ellipsis.circle") {
                        if let link = URL(string: "https://\(SlipSurgeHTTP.site)/profile/\(profile.username)") {
                            ShareLink(item: link) { Label("Share profile", systemImage: "square.and.arrow.up") }
                        }
                        if !profile.own, api.userID != nil {
                            Button("Block @\(profile.username)", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
                            Button("Report account", systemImage: "flag", role: .destructive) { reportProfile = true }
                        }
                    }
                }
            }
        }
        .confirmationDialog("Block this account?", isPresented: $confirmBlock, titleVisibility: .visible) {
            if let profile = page?.profile { Button("Block @\(profile.username)", role: .destructive) { Task { await change(profile, action: "block", enabled: true) } } }
        }
        .sheet(isPresented: $showDetails) {
            if let profile = page?.profile {
                MemberProfileDetails(profile: profile)
            }
        }
        .sheet(isPresented: $reportProfile) {
            if let profile = page?.profile {
                NativeReportView(title: "Report account") { reason, text in
                    struct Report: Encodable { let id: String; let action = "report"; let reason: String; let text: String }
                    struct Confirmation: Decodable { let ok: Bool }
                    let vote = try await api.write(Confirmation.self, path: "/api/mobile/profiles",
                        body: Report(id: profile.id.uuidString.lowercased(), reason: reason, text: text))
                    guard vote.ok else { throw URLError(.cannotParseResponse) }
                    notice = "Report submitted."
                }
            }
        }
        .task(id: fetchKey) { await load() }
        .refreshable { await load() }
    }

    private func creatorPanel(_ profile: Page.Profile, _ creator: Page.Profile.Creator) -> some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("Join \(profile.name)", systemImage: "storefront").font(.headline)
        } content: {
            VStack(alignment: .leading, spacing: 10) {
                NavigationLink {
                    CreatorDetailView(api: api, username: profile.username)
                } label: {
                    Label("View storefront", systemImage: "arrow.right")
                }.buttonStyle(SlipSurgePrimaryButtonStyle())
                if profile.own, let userID = api.userID {
                    NavigationLink {
                        AccountWorkspaceView(account: api.account, userID: userID, workspace: .studio)
                    } label: {
                        Label("Creator Studio", systemImage: "sparkles").frame(minHeight: 36)
                    }.buttonStyle(.bordered)
                }
                ForEach(creator.offers) { offer in
                    NavigationLink {
                        LinkedCreatorOfferView(api: .init(client: api), id: offer.id)
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "ticket").foregroundStyle(Brand.accent(for: scheme)).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(offer.title).font(.subheadline.weight(.semibold))
                                Text(offer.description ?? "Premium creator access on SlipSurge.")
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            if let price = offer.price {
                                Text(price.formatted(.currency(code: (offer.currency ?? "USD").uppercased())))
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                            }
                        }
                        .padding(10).frame(minHeight: 44)
                        .background(Brand.background(for: scheme), in: .rect(cornerRadius: 10))
                    }.buttonStyle(SlipSurgePressStyle())
                }
                ForEach(creator.communities) { group in
                    communityLink(group, subtitle: group.accessType == "paid" ? "Member access" : "Open community",
                        initialMember: profile.own)
                }
                if creator.offers.isEmpty && creator.communities.isEmpty {
                    Text("This creator is setting up their first community and membership.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func profileActivity(_ page: Page) -> some View {
        if tab == .replies {
            ForEach(page.replies) { reply in
                Button { selectedPost = reply.postId } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Label("Replied to \(reply.parentAuthor ?? "a post")", systemImage: "bubble.left.and.bubble.right")
                            .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    } content: {
                        VStack(alignment: .leading, spacing: 8) {
                            NativeInlineEmojiText(source: reply.text, linkify: { AttributedString($0) }).font(.subheadline)
                            if let excerpt = reply.parentExcerpt, !excerpt.isEmpty {
                                NativeInlineEmojiText(source: excerpt, linkify: { AttributedString($0) })
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                    .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Brand.background(for: scheme), in: .rect(cornerRadius: 7))
                            }
                            if let date = SidelineBoard.timestamp(reply.createdAt) {
                                Text(date, style: .relative).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }.buttonStyle(SlipSurgePressStyle())
            }
            if page.replies.isEmpty { ContentUnavailableView("No replies", systemImage: "bubble") }
        } else if tab == .communities {
            ForEach(page.communities) { group in
                communityLink(group, subtitle: group.memberRole?.capitalized ?? group.sport.map(LeagueArtwork.label) ?? "Community",
                    initialMember: page.profile.own)
            }
            if page.communities.isEmpty { ContentUnavailableView("No visible communities", systemImage: "person.2") }
        } else {
            ForEach(posts) { post in
                FeedPostCard(post: post, discussion: { selectedPost = post.postID }, actionsAPI: feed, postChanged: { removed in
                    if removed { posts.removeAll { $0.postID == post.postID } }
                    else { Task { await load() } }
                })
                    .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 15))
            }
            if posts.isEmpty { ContentUnavailableView("No \(tab == .all ? "posts" : tab.rawValue.lowercased())", systemImage: tab.glyph) }
            if let cursor {
                if pagingError != nil {
                    ResearchToolMessage(title: "More activity couldn’t load", error: pagingError) { Task { await load(cursor: cursor) } }
                } else {
                    Button(paging ? "Loading…" : "Load more") { Task { await load(cursor: cursor) } }
                        .disabled(paging)
                }
            }
        }
    }

    private func communityLink(_ group: DiscoverAPI.Communities.Community, subtitle: String, initialMember: Bool) -> some View {
        NavigationLink {
            CommunityDetailView(api: api, group: group, initialMember: initialMember)
        } label: {
            DiscoverIdentityCard(title: group.name, subtitle: subtitle,
                detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl, symbol: "person.2",
                count: group.memberCount.map { "\($0.formatted()) members" })
        }.buttonStyle(SlipSurgePressStyle())
    }

    private func load(cursor: String? = nil) async {
        let key = fetchKey
        if cursor != nil {
            guard !paging, loadedKey == key else { return }
        }
        paging = cursor != nil
        pagingError = nil
        failedKey = nil
        if cursor == nil { error = nil }
        requestNumber += 1
        let sequence = requestNumber
        defer { if sequence == requestNumber { paging = false } }
        do {
            var query = [URLQueryItem(name: "user", value: target), .init(name: "tab", value: tab.rawValue.lowercased())]
            if let cursor { query.append(.init(name: "cursor", value: cursor)) }
            let result = try await api.readPublic(Page.self, path: "/api/mobile/profiles", query: query)
            guard !Task.isCancelled, key == fetchKey, sequence == requestNumber else { return }
            if let id = UUID(uuidString: target), result.profile.id != id { throw URLError(.cannotParseResponse) }
            let replacePage = cursor == nil || !result.profile.canView
            let prior = replacePage ? [] : posts
            var ids = Set(prior.map(\.id))
            if replacePage { page = result }
            posts = prior + result.posts.filter { ids.insert($0.id).inserted }
            self.cursor = result.hasMore && cursor != result.nextCursor ? result.nextCursor : nil
            loadedKey = key
            error = nil
        } catch {
            guard !Task.isCancelled, key == fetchKey, sequence == requestNumber else { return }
            let status = (error as? SlipSurgeHTTP.Status)?.code
            if status == 401 || status == 403 || status == 404 {
                page = nil
                loadedKey = nil
            } else if cursor != nil {
                pagingError = error
                return
            }
            failedKey = key
            self.error = error
        }
    }

    private func change(_ profile: Page.Profile, action: String, enabled: Bool) async {
        struct Edit: Encodable { let id: String; let action: String; let enabled: Bool }
        struct Result: Decodable { let ok: Bool }
        guard !changing else { return }
        changing = true
        notice = nil
        defer { changing = false }
        do {
            let result = try await api.write(Result.self, path: "/api/mobile/profiles", body: Edit(id: profile.id.uuidString.lowercased(), action: action, enabled: enabled))
            guard result.ok else { throw URLError(.cannotParseResponse) }
            if action == "block" { dismiss() } else { await load() }
        } catch { notice = "The account change couldn’t be confirmed." }
    }
}
