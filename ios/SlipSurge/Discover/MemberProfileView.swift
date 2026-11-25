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

    private struct Page: Decodable {
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

            let id: UUID
            let username: String
            let displayName: String?
            let bio: String?
            let avatarUrl: URL?
            let bannerUrl: URL?
            let verified: Bool?
            let isPrivate: Bool?
            let allowMessages: Bool?
            let followerCount: Int?
            let followingCount: Int?
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

            var name: String { displayName ?? username }
        }

        struct Reply: Decodable, Identifiable {
            let id: UUID
            let text: String
            let createdAt: String
            let postId: UUID
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
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var page: Page?
    @State private var error: (any Error)?
    @State private var tab = ProfileTab.all
    @State private var posts: [FeedPost] = []
    @State private var cursor: String?
    @State private var retry = 0
    @State private var changing = false
    @State private var paging = false
    @State private var confirmBlock = false
    @State private var reportProfile = false
    @State private var notice: String?
    @State private var selectedPost: UUID?
    @State private var selectedBadge: Page.Profile.Badge?

    private var fetchKey: String { "\(target):\(tab.rawValue):\(retry)" }
    private var feed: FeedAPI { FeedAPI(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let profile = page?.profile {
                    header(profile)
                    if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                    favorites(profile)
                    if profile.canView, let page {
                        ResearchToolRail(title: "Profile activity", choices: ProfileTab.allCases, selection: $tab, label: \.rawValue, glyph: \.glyph)
                        profileActivity(page)
                    } else {
                        ContentUnavailableView("Private account", systemImage: "lock", description: Text("Follow to see this member’s posts and picks."))
                    }
                } else if let response = error as? SlipSurgeHTTP.Status, response.code == 404 {
                    ContentUnavailableView("Profile unavailable", systemImage: "person.crop.circle.badge.xmark")
                } else {
                    ResearchToolMessage(title: "Profile couldn’t load", error: error) { retry += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle(page?.profile.username ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
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
        .sheet(item: $selectedBadge) { badge in
            VStack(spacing: 12) {
                ResearchArtwork(urls: [badge.cardImageUrl, badge.iconUrl].compactMap { $0 }, fallback: "rosette")
                    .frame(maxWidth: 190, maxHeight: 145)
                Text(badge.name).font(.title3.bold())
                if let description = badge.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
            }
            .padding(22).presentationDetents([.medium])
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

    private func header(_ profile: Page.Profile) -> some View {
        let colors = profile.teams.first?.colors?.compactMap { Color(hex: $0) } ?? []
        let primary = colors.first ?? Brand.accent(for: scheme), secondary = colors.dropFirst().first ?? Brand.surface(for: scheme)
        return VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let url = profile.bannerUrl, FeedPostCard.allowedMedia(url) {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                        .frame(height: 122).clipped()
                }
                ResearchArtwork(urls: [profile.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle.fill")
                    .frame(width: 64, height: 64)
                    .background(Brand.surface(for: scheme), in: .circle)
                    .clipShape(.circle)
                    .overlay { Circle().strokeBorder(Brand.surface(for: scheme), lineWidth: 3) }
                    .padding(11)
            }
            .frame(height: 122)
            .clipShape(.rect(cornerRadius: 15))
            HStack(spacing: 6) {
                Text(profile.name).font(.title2.weight(.bold))
                if profile.verified == true { Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified member") }
            }
            Text("@\(profile.username)").font(.subheadline).foregroundStyle(.secondary)
            if let bio = profile.bio, !bio.isEmpty { Text(verbatim: bio).font(.subheadline) }
            if let location = profile.location, !location.isEmpty { Label(location, systemImage: "mappin").font(.caption).foregroundStyle(.secondary) }
            if let website = profile.website, website.scheme == "https", website.user == nil, website.password == nil, let host = website.host {
                Link(destination: website) { Label(host, systemImage: "link").font(.caption) }
            }
            HStack(spacing: 8) {
                if let count = profile.followerCount { Text("\(count.formatted()) followers").font(.caption) }
                if let count = profile.followingCount { Text("\(count.formatted()) following").font(.caption) }
                if let record = profile.record { Label(record.line, systemImage: "trophy").font(.caption.weight(.semibold)) }
            }
            if let viewer = api.userID {
                HStack {
                    if profile.own {
                        NavigationLink("Edit profile", destination: NativeSettings(account: api.account, userID: viewer, section: .profile))
                            .buttonStyle(.bordered)
                    } else {
                        Button(profile.following ? "Following" : "Follow", systemImage: profile.following ? "person.fill.checkmark" : "person.badge.plus") {
                            Task { await change(profile, action: "follow", enabled: !profile.following) }
                        }
                        .buttonStyle(.borderedProminent).disabled(changing)
                        if profile.allowMessages != false {
                            NavigationLink {
                                MessageThreadView(api: MessagesAPI(account: api.account, userID: viewer), destination: .init(kind: .direct, id: profile.id))
                            } label: { Label("Message", systemImage: "bubble") }
                                .buttonStyle(.bordered)
                        }
                    }
                }
            }
            if let links = profile.socialLinks {
                ForEach(links) { link in
                    if let destination = link.href {
                        Link(destination: destination) { socialBadge(link) }
                    } else {
                        socialBadge(link)
                    }
                }
            } else {
                ForEach(profile.verifiedSocials.keys.sorted(), id: \.self) { provider in
                    if let identity = profile.verifiedSocials[provider] {
                        Link(destination: identity.profileUrl) {
                            HStack(spacing: 7) {
                                Image("sign-in-\(provider)").resizable().scaledToFit().frame(width: 18, height: 18)
                                Text(identity.handle).font(.caption)
                                Image(systemName: "checkmark.seal.fill").font(.caption2).accessibilityLabel("Verified")
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 18))
    }

    private func socialBadge(_ link: Page.Profile.PublicLink) -> some View {
        HStack(spacing: 7) {
            ResearchArtwork(urls: link.iconUrl.map { [$0] } ?? [], fallback: "at")
                .frame(width: 20, height: 20).accessibilityHidden(true)
            Text(link.handle).font(.subheadline.weight(.medium))
            if link.verified {
                Image(systemName: "checkmark.seal.fill").font(.caption2)
                    .foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Verified")
            }
        }.padding(.horizontal, 9).frame(minHeight: 44)
            .background(Brand.background(for: scheme), in: .capsule)
            .accessibilityElement(children: .combine)
            .accessibilityHint(link.name)
    }

    @ViewBuilder
    private func favorites(_ profile: Page.Profile) -> some View {
        if !profile.badges.isEmpty || !profile.teams.isEmpty || !profile.players.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(profile.badges) { badge in
                        Button { selectedBadge = badge } label: {
                            profileMark(badge.name, url: badge.iconUrl ?? badge.cardImageUrl, symbol: "rosette")
                        }.buttonStyle(.plain)
                    }
                    ForEach(profile.teams) { team in profileMark(team.title, url: team.logo, symbol: "shield") }
                    ForEach(profile.players) { player in profileMark(player.name, url: player.headshot ?? player.teamLogo, symbol: "person.fill") }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private func profileMark(_ name: String, url: URL?, symbol: String) -> some View {
        VStack(spacing: 4) {
            ResearchArtwork(urls: [url].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: symbol)
                .frame(width: 30, height: 30)
            Text(name).font(.caption2).lineLimit(2)
        }
        .frame(width: 73, height: 62)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func profileActivity(_ page: Page) -> some View {
        if tab == .replies {
            ForEach(page.replies) { reply in
                Button { selectedPost = reply.postId } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(verbatim: reply.text).font(.subheadline)
                    } content: {
                        if let date = SidelineBoard.timestamp(reply.createdAt) { Text(date, style: .relative).font(.caption).foregroundStyle(.secondary) }
                    }
                }.buttonStyle(SlipSurgePressStyle())
            }
            if page.replies.isEmpty { ContentUnavailableView("No replies", systemImage: "bubble") }
        } else if tab == .communities {
            ForEach(page.communities) { group in
                NavigationLink {
                    CommunityDetailView(api: api, group: group, initialMember: page.profile.own)
                } label: {
                    DiscoverIdentityCard(title: group.name, subtitle: group.sport.map(LeagueArtwork.label) ?? "Community",
                        detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl, symbol: "person.2",
                        count: group.memberCount.map { "\($0.formatted()) members" })
                }.buttonStyle(SlipSurgePressStyle())
            }
            if page.communities.isEmpty { ContentUnavailableView("No visible communities", systemImage: "person.2") }
        } else {
            ForEach(posts) { post in
                FeedPostCard(post: post, discussion: { selectedPost = post.postID })
                    .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 15))
            }
            if posts.isEmpty { ContentUnavailableView("No \(tab == .all ? "posts" : tab.rawValue.lowercased())", systemImage: tab.glyph) }
            if let cursor {
                Button(paging ? "Loading…" : "Load more") { Task { await load(cursor: cursor) } }
                    .disabled(paging)
            }
        }
    }

    private func load(cursor: String? = nil) async {
        let key = fetchKey
        if cursor != nil {
            guard !paging else { return }
            paging = true
        }
        defer { if key == fetchKey { paging = false } }
        do {
            var query = [URLQueryItem(name: "user", value: target), .init(name: "tab", value: tab.rawValue.lowercased())]
            if let cursor { query.append(.init(name: "cursor", value: cursor)) }
            let result = try await api.readPublic(Page.self, path: "/api/mobile/profiles", query: query)
            guard !Task.isCancelled, key == fetchKey else { return }
            if let id = UUID(uuidString: target), result.profile.id != id { throw URLError(.cannotParseResponse) }
            let prior = cursor == nil ? [] : posts
            var ids = Set(prior.map(\.id))
            page = result
            posts = prior + result.posts.filter { ids.insert($0.id).inserted }
            self.cursor = result.hasMore && cursor != result.nextCursor ? result.nextCursor : nil
            error = nil
        } catch {
            if !Task.isCancelled, key == fetchKey { self.error = error; if cursor == nil { page = nil } }
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
