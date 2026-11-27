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
        let memberCount: Int?
        let posts: [FeedPost]
        let nextCursor: String?
        let hasMore: Bool
    }

    enum Feed: String, CaseIterable {
        case posts = "Posts", picks = "Picks", rooms = "Rooms"

        var glyph: String {
            switch self {
            case .posts: SlipGlyph.feed.rawValue
            case .picks: "ticket"
            case .rooms: "number"
            }
        }
    }
    private struct Membership: Decodable { let member: Bool }
    private struct InviteResult: Decodable { let status: String? }

    let api: DiscoverAPI
    let group: DiscoverAPI.Communities.Community
    let initialMember: Bool
    let onMembershipChange: () -> Void
    @Environment(\.slipPalette) private var slipPalette
    @State private var page: Page?
    @State private var feed: Feed
    @State private var loadedFeed: Feed?
    @State private var roomRevision = 0
    @State private var posts: [FeedPost] = []
    @State private var error: (any Error)?
    @State private var requestID: UUID?
    @State private var loadingMore = false
    @State private var retryCursor: String?
    @State private var feedback: String?
    @State private var mutation = false
    @State private var confirmLeave = false
    @State private var responseComplete = false
    @State private var selectedPost: UUID?
    @State private var memberPreferences = false
    @State private var composing = false
    @State private var memberProfile: String?
    @State private var discordAccess: CommunityDiscordAPI.Membership?
    @State private var pending = Set<UUID>()

    init(api: DiscoverAPI, group: DiscoverAPI.Communities.Community, initialMember: Bool, feed: Feed = .posts,
         onMembershipChange: @escaping () -> Void = {}) {
        self.api = api
        self.group = group
        self.initialMember = initialMember
        self.onMembershipChange = onMembershipChange
        _feed = State(initialValue: feed)
    }

    private var path: String { "/api/mobile/communities/\(group.id.uuidString.lowercased())" }
    private var feedAPI: FeedAPI { FeedAPI(account: api.account, userID: api.userID) }
    private var postFeed: Feed { feed == .rooms ? .posts : feed }
    private var memberCountLabel: String? {
        (page?.memberCount ?? group.memberCount).map { $0 == 1 ? "1 member" : "\($0.formatted()) members" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if feed == .rooms, page?.role != nil || page == nil && initialMember {
                    roomIdentity
                } else {
                    DiscoverIdentityCard(title: group.name, subtitle: group.sport.map(LeagueArtwork.label) ?? "Community",
                        detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl, symbol: "person.2",
                        count: memberCountLabel)
                }
                if let feedback { Text(feedback).font(.footnote).foregroundStyle(.secondary) }
                if api.userID == nil {
                    if group.creatorProductId != nil { paidMembership }
                    else { Label("Sign in to join the conversation.", systemImage: "person.crop.circle").font(.subheadline).foregroundStyle(.secondary) }
                } else if let invitation = group.invitationId, !responseComplete {
                    invitationActions(invitation)
                } else if let page {
                    membershipActions(page)
                    if page.canView {
                        if let userID = api.userID, page.role != nil {
                            if feed == .rooms {
                                RoomDirectory(api: .init(account: api.account, userID: userID), group: group.id,
                                    groupName: group.name, revision: roomRevision)
                            } else {
                                Button(feed == .picks ? "Share a pick" : "Write a post", systemImage: "square.and.pencil") { composing = true }
                                    .buttonStyle(SlipSurgePrimaryButtonStyle())
                            }
                        }
                        if feed != .rooms { postsContent(page) }
                        else if error != nil { reloadButton }
                    } else {
                        Label("Members-only community", systemImage: "lock").foregroundStyle(.secondary)
                        paidMembership
                    }
                } else if group.accessType == "paid", !initialMember, (error as? SlipSurgeHTTP.Status)?.code == 404 {
                    Label("Membership required", systemImage: "lock").foregroundStyle(.secondary)
                    paidMembership
                } else {
                    ResearchToolMessage(title: "Community couldn’t load", error: error, loadingLabel: "Loading community") { Task { await load(postFeed) } }
                }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let page, page.canView {
                SocialSectionBar(title: "Community section", sections: Feed.allCases.filter { $0 != .rooms || page.role != nil },
                    selection: $feed) { section in
                    Label(section.rawValue, glyph: section.glyph, filled: slipPalette == .color)
                }
            }
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle(group.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if page?.canView == true, page?.role != nil, let userID = api.userID {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Community options", systemImage: "ellipsis") {
                        Button("Preferences", systemImage: "slider.horizontal.3") { memberPreferences = true }
                        if let discordAccess {
                            NavigationLink {
                                CommunityDiscordView(api: .init(account: api.account, userID: userID, groupID: group.id))
                            } label: { Label("Discord access · \(discordAccess.guildName)", systemImage: "link") }
                        }
                        if page?.canLeave == true {
                            Button("Leave community", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                                confirmLeave = true
                            }.disabled(mutation)
                        }
                    }
                }
            }
            if page?.canManage == true, let userID = api.userID {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        CommunitySettingsView(api: .init(account: api.account, userID: userID, groupID: group.id))
                    } label: { Label("Community settings", systemImage: "gearshape") }
                }
            }
        }
        .task(id: postFeed) { await load(postFeed) }
        .task(id: page?.role) {
            guard let userID = api.userID, page?.role != nil else { discordAccess = nil; return }
            let membership = try? await CommunityDiscordAPI(account: api.account, userID: userID, groupID: group.id).membership()
            if !Task.isCancelled, page?.role != nil { discordAccess = membership }
        }
        .refreshable {
            if feed == .rooms { roomRevision += 1 }
            await load(postFeed)
        }
        .navigationDestination(item: $selectedPost) { id in
            FeedThreadView(api: feedAPI, id: id, original: posts.first { $0.postID == id },
                onPostChange: { post in
                    if let index = posts.firstIndex(where: { $0.id == post.id }) { posts[index] = post }
                },
                onPostRemoved: { posts.removeAll { $0.postID == id } })
        }
        .sheet(isPresented: $memberPreferences) {
            CommunityMemberPreferences(api: api, group: group) { feedback = "Preferences saved." }
        }
        .sheet(isPresented: $composing) {
            if let userID = api.userID, let page, page.role != nil {
                FeedComposerView(account: api.account, userID: userID, allowMLB: page.allowMlb == true, startWithPick: feed == .picks,
                    community: .init(id: group.id, name: group.name, preferredSport: group.sport, artwork: group.avatarUrl, memberOnly: page.publicAudience != true)) {
                    Task { await load(postFeed) }
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

    private var roomIdentity: some View {
        HStack(spacing: 12) {
            ResearchArtwork(urls: group.avatarUrl.map { [$0] } ?? [], fallback: "person.2.fill")
                .frame(width: 42, height: 42)
                .clipShape(.rect(cornerRadius: 12))
            if let description = group.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            } else if let memberCountLabel {
                Text(memberCountLabel).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func postsContent(_ page: Page) -> some View {
        if error != nil, retryCursor == nil { reloadButton }
        if loadedFeed != postFeed {
            if error == nil { ProgressView().frame(maxWidth: .infinity, minHeight: 80) }
        } else if posts.isEmpty {
            ContentUnavailableView("No \(feed.rawValue.lowercased()) yet", systemImage: "bubble.left")
        } else {
            LazyVStack(spacing: 9) {
                ForEach(posts) { post in
                    FeedPostCard(post: post, operation: { action in Task { await apply(action, post: post) } },
                        discussion: { selectedPost = post.postID }, showAuthor: post.author.map { author in { memberProfile = author.username } },
                        actionsAPI: feedAPI, postChanged: { _ in Task { await load(postFeed) } })
                        .padding(13).background(slipPalette.surface, in: .rect(cornerRadius: 15))
                        .disabled(pending.contains(post.postID))
                }
            }
            if page.hasMore, let cursor = page.nextCursor {
                Button(retryCursor == cursor ? "Retry loading more" : "Load more") {
                    Task { await load(postFeed, cursor: cursor) }
                }
                .frame(minHeight: 44)
                .disabled(requestID != nil)
                .overlay(alignment: .trailing) {
                    if loadingMore { ProgressView().offset(x: 25).accessibilityHidden(true) }
                }
            }
        }
    }

    private var reloadButton: some View {
        Button("Couldn’t refresh community. Retry", systemImage: "arrow.clockwise") {
            Task { await load(postFeed) }
        }
        .font(.subheadline)
        .frame(minHeight: 44)
        .disabled(requestID != nil)
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
        } else if page.canLeave, page.role == nil {
            Button("Leave community", systemImage: "person.badge.minus") { confirmLeave = true }
                .buttonStyle(.bordered).disabled(mutation)
        }
    }

    private func load(_ requested: Feed, cursor: String? = nil) async {
        guard api.userID != nil, group.invitationId == nil || responseComplete else { return }
        if let cursor {
            guard requestID == nil, loadedFeed == requested, page?.nextCursor == cursor else { return }
        }
        let request = UUID()
        requestID = request
        loadingMore = cursor != nil
        error = nil
        retryCursor = nil
        defer {
            if requestID == request { requestID = nil; loadingMore = false }
        }
        var query = [URLQueryItem(name: "view", value: requested.rawValue.lowercased())]
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        do {
            let data = try await api.memberRead(Page.self, path: path, query: query)
            guard !Task.isCancelled, requestID == request, postFeed == requested else { return }
            page = data
            loadedFeed = requested
            if feed == .rooms, data.role == nil || !data.canView { feed = .posts }
            if data.canView {
                var seen = Set(cursor == nil ? [] : posts.map(\.id))
                let next = data.posts.filter { seen.insert($0.id).inserted }
                posts = cursor == nil ? next : posts + next
            } else {
                posts = []
            }
        } catch {
            guard !Task.isCancelled, requestID == request, postFeed == requested else { return }
            self.error = error
            retryCursor = cursor
            if let status = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(status.code) {
                page = nil
                posts = []
                loadedFeed = nil
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
            onMembershipChange()
            feedback = reply.member ? "You joined \(group.name)." : "You left \(group.name)."
            if join && reply.member { memberPreferences = true }
        } catch {
            feedback = "The membership change couldn’t be confirmed."
        }
        await load(postFeed)
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
            onMembershipChange()
            responseComplete = true
            feedback = accept ? "Invitation accepted." : "Invitation declined."
            if accept { await load(postFeed); if page?.role != nil { memberPreferences = true } }
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
