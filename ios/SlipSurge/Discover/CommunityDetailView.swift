import SwiftUI

struct CommunityDetailView: View {
    private struct Page: Decodable {
        let canView: Bool
        let canJoin: Bool
        let canLeave: Bool
        let canManage: Bool?
        let allowMlb: Bool?
        let publicAudience: Bool?
        let role: String?
        let posts: [FeedPost]
        let nextCursor: String?
        let hasMore: Bool
    }

    private enum Feed: String, CaseIterable { case posts = "Posts", picks = "Picks" }
    private struct Membership: Decodable { let member: Bool }
    private struct InviteResult: Decodable { let status: String? }

    let api: DiscoverAPI
    let group: DiscoverAPI.Communities.Community
    let initialMember: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page: Page?
    @State private var feed = Feed.posts
    @State private var posts: [FeedPost] = []
    @State private var error: (any Error)?
    @State private var feedback: String?
    @State private var mutation = false
    @State private var confirmLeave = false
    @State private var responseComplete = false
    @State private var selected: FeedPost?
    @State private var memberPreferences = false
    @State private var composing = false
    @State private var memberProfile: String?
    @State private var discordAccess: CommunityDiscordAPI.Membership?
    @State private var pending = Set<UUID>()

    private var path: String { "/api/mobile/communities/\(group.id.uuidString.lowercased())" }
    private var feedAPI: FeedAPI { FeedAPI(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                DiscoverIdentityCard(title: group.name, subtitle: group.sport.map(LeagueArtwork.label) ?? "Community",
                    detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl, symbol: "person.2",
                    count: group.memberCount.map { "\($0.formatted()) members" })
                if let feedback { Text(feedback).font(.footnote).foregroundStyle(.secondary) }
                if api.userID == nil {
                    if group.creatorProductId != nil { paidMembership }
                    else { Label("Sign in to join the conversation.", systemImage: "person.crop.circle").font(.subheadline).foregroundStyle(.secondary) }
                } else if let invitation = group.invitationId, !responseComplete {
                    invitationActions(invitation)
                } else if let page {
                    membershipActions(page)
                    if page.canView, page.role != nil, let userID = api.userID {
                        HStack(spacing: 7) {
                            NavigationLink {
                                ChannelDirectoryView(api: .init(account: api.account, userID: userID), group: group.id)
                            } label: { Label("Channels", systemImage: "number") }
                            .buttonStyle(.bordered)
                            Button("Preferences", systemImage: "slider.horizontal.3") { memberPreferences = true }
                                .buttonStyle(.bordered)
                        }
                        if let discordAccess {
                            NavigationLink {
                                CommunityDiscordView(api: .init(account: api.account, userID: userID, groupID: group.id))
                            } label: {
                                CommunityDiscordIdentity(title: discordAccess.guildName, detail: "Discord access")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(10)
                                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
                            }
                            .buttonStyle(SlipSurgePressStyle())
                        }
                        Button(feed == .picks ? "Share a pick" : "Write a post", systemImage: "square.and.pencil") { composing = true }
                            .buttonStyle(SlipSurgePrimaryButtonStyle())
                    }
                    if page.canView {
                        ResearchToolRail(title: "Community", choices: Feed.allCases, selection: $feed, label: \.rawValue) {
                            $0 == .posts ? "text.bubble" : "chart.line.uptrend.xyaxis"
                        }
                        if posts.isEmpty {
                            ContentUnavailableView("No \(feed.rawValue.lowercased()) yet", systemImage: "bubble.left")
                        }
                        LazyVStack(spacing: 9) {
                            ForEach(posts) { post in
                                FeedPostCard(post: post, operation: { action in Task { await apply(action, post: post) } },
                                    discussion: { selected = post }, showAuthor: post.author.map { author in { memberProfile = author.username } },
                                    actionsAPI: feedAPI, postChanged: { _ in Task { await load(feed) } })
                                    .padding(13).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 15))
                                    .disabled(pending.contains(post.postID))
                            }
                        }
                        if page.hasMore, let cursor = page.nextCursor {
                            Button("Load more") { Task { await load(feed, cursor: cursor) } }.frame(minHeight: 44)
                        }
                    } else {
                        Label("Members-only community", systemImage: "lock").foregroundStyle(.secondary)
                        paidMembership
                    }
                } else if group.accessType == "paid", !initialMember, (error as? SlipSurgeHTTP.Status)?.code == 404 {
                    Label("Membership required", systemImage: "lock").foregroundStyle(.secondary)
                    paidMembership
                } else {
                    ResearchToolMessage(title: "Community couldn’t load", error: error) { Task { await load(feed) } }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(group.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if page?.canManage == true, let userID = api.userID {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        CommunitySettingsView(api: .init(account: api.account, userID: userID, groupID: group.id))
                    } label: { Label("Community settings", systemImage: "gearshape") }
                }
            }
        }
        .task(id: feed) { await load(feed) }
        .task(id: page?.role) {
            guard let userID = api.userID, page?.role != nil else { discordAccess = nil; return }
            let membership = try? await CommunityDiscordAPI(account: api.account, userID: userID, groupID: group.id).membership()
            if !Task.isCancelled, page?.role != nil { discordAccess = membership }
        }
        .refreshable { await load(feed) }
        .sheet(item: $selected) { post in
            NavigationStack {
                FeedThreadView(api: feedAPI, id: post.postID, original: post)
            }
        }
        .sheet(isPresented: $memberPreferences) {
            CommunityMemberPreferences(api: api, group: group) { feedback = "Preferences saved." }
        }
        .sheet(isPresented: $composing) {
            if let userID = api.userID, let page, page.role != nil {
                FeedComposerView(account: api.account, userID: userID, allowMLB: page.allowMlb == true, startWithPick: feed == .picks,
                    community: .init(id: group.id, name: group.name, preferredSport: group.sport, artwork: group.avatarUrl, memberOnly: page.publicAudience != true)) {
                    Task { await load(feed) }
                }
            }
        }
        .navigationDestination(item: $memberProfile) { MemberProfileView(api: api, target: $0) }
        .confirmationDialog("Leave \(group.name)?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave community", role: .destructive) { Task { await changeMembership(false) } }
        } message: {
            if group.accessType == "paid" { Text("Leaving the community keeps your paid membership active.") }
        }
    }

    @ViewBuilder
    private var paidMembership: some View {
        if let offer = group.creatorProductId {
            NavigationLink {
                CreatorMembershipView(account: api.account, offer: .init(id: offer, title: group.name,
                    description: group.description, price: group.price, currency: "USD", productType: group.productType,
                    status: group.price != nil ? "active" : "paused", billingPeriodDays: group.billingPeriodDays),
                    creatorID: nil, artwork: group.avatarUrl)
            } label: { Label("View membership", systemImage: "lock.open") }
            .buttonStyle(.borderedProminent)
        }
    }

    private func invitationActions(_ invitation: UUID) -> some View {
        HStack(spacing: 12) {
            Button("Accept invitation", systemImage: "checkmark") { Task { await respond(invitation, accept: true) } }
                .buttonStyle(.borderedProminent)
            Button("Decline", role: .destructive) { Task { await respond(invitation, accept: false) } }
                .buttonStyle(.bordered)
        }
        .disabled(mutation)
    }

    @ViewBuilder
    private func membershipActions(_ page: Page) -> some View {
        if page.canJoin {
            Button("Join community", systemImage: "person.badge.plus") {
                Task { await changeMembership(true) }
            }.buttonStyle(.borderedProminent).disabled(mutation)
        } else if page.canLeave {
            Button("Leave community", systemImage: "person.badge.minus") { confirmLeave = true }
                .buttonStyle(.bordered).disabled(mutation)
        }
    }

    private func load(_ requested: Feed, cursor: String? = nil) async {
        guard api.userID != nil, group.invitationId == nil || responseComplete else { return }
        var query = [URLQueryItem(name: "view", value: requested.rawValue.lowercased())]
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        do {
            let data = try await api.memberRead(Page.self, path: path, query: query)
            guard !Task.isCancelled, feed == requested else { return }
            var seen = Set(cursor == nil ? [] : posts.map(\.id))
            let next = data.posts.filter { seen.insert($0.id).inserted }
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.22)) {
                page = data
                posts = cursor == nil ? next : posts + next
                error = nil
            }
        } catch {
            if !Task.isCancelled, feed == requested {
                self.error = error
                page = nil
                posts = []
            }
        }
    }

    private func changeMembership(_ join: Bool) async {
        guard !mutation else { return }
        mutation = true
        feedback = nil
        defer { mutation = false }
        do {
            let reply = try await api.write(Membership.self, path: path, body: ["join": join])
            feedback = reply.member ? "You joined \(group.name)." : "You left \(group.name)."
            if join && reply.member { memberPreferences = true }
        } catch {
            feedback = "The membership change couldn’t be confirmed."
        }
        await load(feed)
    }

    private func respond(_ invite: UUID, accept: Bool) async {
        struct Request: Encodable { let inviteId: String; let accept: Bool }
        guard !mutation else { return }
        mutation = true
        feedback = nil
        defer { mutation = false }
        do {
            _ = try await api.write(InviteResult.self, path: "/api/mobile/communities/invitation",
                body: Request(inviteId: invite.uuidString.lowercased(), accept: accept))
            responseComplete = true
            feedback = accept ? "Invitation accepted." : "Invitation declined."
            if accept { await load(feed); if page?.role != nil { memberPreferences = true } }
        } catch {
            feedback = "The response couldn’t be confirmed."
        }
    }

    private func apply(_ action: FeedAPI.Mutation, post: FeedPost) async {
        guard pending.insert(post.postID).inserted else { return }
        defer { pending.remove(post.postID) }
        do { try await feedAPI.mutate(post.postID, action: action) }
        catch { feedback = "The post change couldn’t be confirmed." }
        if let latest = try? await feedAPI.thread(post.postID), let position = posts.firstIndex(where: { $0.id == post.id }) {
            posts[position] = latest.post
        }
    }
}
