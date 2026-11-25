import SwiftUI

struct CommunityPagesView: View {
    let api: CommunityPagesAPI
    var initialCategory = ""
    var startsCreating = false
    @Environment(\.colorScheme) private var scheme
    @State private var category = ""
    @State private var mine = false
    @State private var pages: [CommunityPagesAPI.Page]?
    @State private var issue: (any Error)?
    @State private var creating = false
    @State private var routed: String?
    @State private var revision = 0

    private let categories = ["", "Team", "Athlete", "Media", "Brand", "Community", "Podcast", "Other"]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let pages {
                    ResearchArtworkPicker(title: "Category", options: categories.map { category in
                        .init(id: category, title: category.isEmpty ? "All categories" : category, icon: Self.icon(category))
                    }, selection: $category)
                    if pages.isEmpty {
                        ContentUnavailableView {
                            Label(mine ? "You haven’t created a page" : "No pages here yet", systemImage: "rectangle.grid.2x2")
                        } actions: { Button("Create page", systemImage: "plus") { creating = true }.buttonStyle(.borderedProminent) }
                    }
                    ForEach(pages) { page in
                        NavigationLink { CommunityPageDetail(api: api, slug: page.slug) } label: { pageCard(page) }
                            .buttonStyle(SlipSurgePressStyle())
                    }
                } else if let gate = CommunityMembershipNotice.Requirement(issue) {
                    CommunityMembershipNotice(requirement: gate, subject: "Pages", account: api.viewer.account)
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Pages are currently unavailable", systemImage: "rectangle.grid.2x2")
                } else {
                    ResearchToolMessage(title: "Pages couldn’t load", error: issue) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(mine ? "My pages" : "Pages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if pages != nil {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button(mine ? "All pages" : "My pages", systemImage: mine ? "rectangle.grid.2x2" : "person.crop.rectangle") { mine.toggle() }
                    Button("Create page", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(isPresented: $creating) {
            NavigationStack {
                CommunityPageEditor(api: api, draft: .init(), saved: { page in
                    creating = false
                    routed = page.slug
                    revision += 1
                }, deleted: {})
            }
        }
        .navigationDestination(item: $routed) { CommunityPageDetail(api: api, slug: $0) }
        .task(id: "\(category):\(mine):\(revision)") { await load() }
        .refreshable { await load() }
        .onAppear {
            if !initialCategory.isEmpty, categories.contains(initialCategory) { category = initialCategory }
        }
        .onChange(of: pages != nil) { _, ready in if ready && startsCreating { creating = true } }
    }

    private func load() async {
        do {
            let result = try await api.pages(category: category, mine: mine)
            try Task.checkCancellation()
            pages = result
            issue = nil
        } catch { if !Task.isCancelled { pages = nil; issue = error } }
    }

    private func pageCard(_ page: CommunityPagesAPI.Page) -> some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            HStack(spacing: 10) {
                CommunityPageAvatar(page: page, size: 49)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 5) {
                        Text(page.name).font(.headline).foregroundStyle(.primary)
                        if page.isVerified == true { Image(systemName: "checkmark.seal.fill").foregroundStyle(.blue).accessibilityLabel("Verified") }
                        if mine, page.isPublished == false { Image(systemName: "lock.fill").foregroundStyle(.secondary).accessibilityLabel("Unpublished") }
                    }
                    if let description = page.description ?? page.category {
                        Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Label("\((page.followerCount ?? 0).formatted()) followers", systemImage: "person.2")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 2)
                if let sport = page.sport, let logo = LeagueArtwork.logo(sport) {
                    ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 26, height: 26)
                }
            }
        } content: {}
    }

    static func icon(_ category: String) -> String {
        switch category {
        case "Team": "shield"
        case "Athlete": "figure.run"
        case "Media": "newspaper"
        case "Brand": "tag"
        case "Community": "person.3"
        case "Podcast": "mic"
        default: "star"
        }
    }
}

struct CommunityPageAvatar: View {
    let page: CommunityPagesAPI.Page
    let size: CGFloat
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Group {
            if let url = page.avatarArtwork {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() }
                    else { fallback }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: size * 0.22))
        .clipShape(.rect(cornerRadius: size * 0.22))
        .accessibilityHidden(true)
    }

    private var fallback: some View {
        Text(page.emoji ?? "⭐").font(.system(size: size * 0.44)).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct CommunityPageDetail: View {
    let api: CommunityPagesAPI
    let slug: String
    var startsManaging = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var detail: CommunityPagesAPI.Detail?
    @State private var posts: [FeedPost] = []
    @State private var next: String?
    @State private var member: String?
    @State private var thread: FeedPost?
    @State private var issue: (any Error)?
    @State private var actionIssue = false
    @State private var managing = false
    @State private var composing = false
    @State private var loadingMore = false
    @State private var followState: CommunityPagesAPI.Follow?
    @State private var savingFollow = false
    @State private var pending = Set<UUID>()
    @State private var revision = 0
    @State private var generation = 0

    private var feed: FeedAPI { .init(account: api.viewer.account, userID: api.viewer.userID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                if let detail {
                    header(detail)
                    if detail.owner {
                        Button("Create post", systemImage: "square.and.pencil") { composing = true }.buttonStyle(.borderedProminent)
                    }
                    if posts.isEmpty && next == nil { ContentUnavailableView("No posts yet", systemImage: "text.bubble") }
                    ForEach(posts) { post in
                        FeedPostCard(post: post, operation: { action in Task { await update(post, action: action) } },
                            discussion: { thread = post }, showAuthor: post.author.map { author in { member = author.username } },
                            actionsAPI: feed, postChanged: { removed in
                                if removed { posts.removeAll { $0.postID == post.postID } }
                                Task { await load() }
                            })
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
                            .disabled(pending.contains(post.postID))
                    }
                    if let next {
                        Button("More posts") { Task { await load(after: next) } }.buttonStyle(.bordered).disabled(loadingMore)
                    }
                } else if let gate = CommunityMembershipNotice.Requirement(issue) {
                    CommunityMembershipNotice(requirement: gate, subject: "Page", account: api.viewer.account)
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 404 {
                    ContentUnavailableView("Page unavailable", systemImage: "rectangle.slash")
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Pages are currently unavailable", systemImage: "rectangle.grid.2x2")
                } else {
                    ResearchToolMessage(title: "Page couldn’t load", error: issue) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(detail?.page.name ?? "Page")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let detail {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if detail.owner { Button("Manage page", systemImage: "gearshape") { managing = true } }
                    if detail.page.isPublished == true, let url = URL(string: "https://\(SlipSurgeHTTP.site)/pages/\(slug)") {
                        ShareLink(item: url).accessibilityLabel("Share page")
                    }
                }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .onChange(of: detail?.owner) { _, owner in if owner == true && startsManaging { managing = true } }
        .navigationDestination(item: $member) { MemberProfileView(api: api.viewer, target: $0) }
        .sheet(item: $thread) { post in NavigationStack { FeedThreadView(api: feed, id: post.postID, original: post) } }
        .sheet(isPresented: $managing) {
            if let page = detail?.page {
                NavigationStack {
                    CommunityPageEditor(api: api, draft: .init(page: page), saved: { _ in
                        managing = false
                        revision += 1
                    }, deleted: { managing = false; dismiss() })
                }
            }
        }
        .sheet(isPresented: $composing) {
            if let detail, detail.owner, let userID = api.viewer.userID {
                FeedComposerView(account: api.viewer.account, userID: userID, allowMLB: detail.allowMlb,
                    page: .init(id: detail.page.id, name: detail.page.name, preferredSport: detail.page.sport, artwork: detail.page.avatarArtwork)) {
                        composing = false
                        revision += 1
                    }
            }
        }
        .alert("Change couldn’t be confirmed", isPresented: $actionIssue) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private func header(_ detail: CommunityPagesAPI.Detail) -> some View {
        let page = detail.page
        let following = followState?.following ?? detail.following
        return VStack(alignment: .leading, spacing: 0) {
            if let url = page.bannerArtwork {
                ArticleCover(url: url, height: 136)
            }
            VStack(alignment: .leading, spacing: 9) {
                HStack(alignment: .center, spacing: 8) {
                    CommunityPageAvatar(page: page, size: 58)
                    Spacer()
                    if !detail.owner {
                        Button(following ? "Following" : "Follow", systemImage: following ? "checkmark" : "person.badge.plus") {
                            Task { await follow(!following, id: page.id) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(savingFollow)
                        .accessibilityAddTraits(following ? .isSelected : [])
                    }
                }
                HStack(spacing: 6) {
                    Text(page.name).font(.title2.bold())
                    if page.isVerified == true { Image(systemName: "checkmark.seal.fill").foregroundStyle(.blue).accessibilityLabel("Verified") }
                }
                HStack(spacing: 6) {
                    if let sport = page.sport, let logo = LeagueArtwork.logo(sport) {
                        ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 22, height: 22)
                    }
                    if let category = page.category { Text(category).foregroundStyle(Brand.accent(for: scheme)) }
                    if page.isPublished == false { Label("Unpublished", systemImage: "lock") }
                }
                .font(.subheadline.weight(.semibold))
                if let description = page.description { Text(description).font(.subheadline) }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { metadata(page) }
                    VStack(alignment: .leading, spacing: 5) { metadata(page) }
                }
            }
            .padding(14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 18))
        .clipShape(.rect(cornerRadius: 18))
    }

    @ViewBuilder private func metadata(_ page: CommunityPagesAPI.Page) -> some View {
        let followers = followState?.followerCount ?? page.followerCount ?? 0
        Label("\(followers.formatted()) followers", systemImage: "person.2").contentTransition(.numericText())
            .font(.footnote).foregroundStyle(.secondary)
        if let created = page.createdAt.flatMap(SidelineBoard.timestamp) {
            Label(created.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func load(after cursor: String? = nil) async {
        if cursor != nil {
            guard !loadingMore else { return }
            loadingMore = true
        } else {
            generation += 1
        }
        let current = generation
        defer { if cursor != nil { loadingMore = false } }
        do {
            let result = try await api.detail(slug, after: cursor)
            guard !Task.isCancelled, current == generation, cursor == nil || cursor == next else { return }
            if cursor == nil {
                posts = result.posts
                if !savingFollow { followState = nil }
            } else {
                let seen = Set(posts.map(\.postID))
                posts += result.posts.filter { !seen.contains($0.postID) }
            }
            detail = result
            next = result.next
            issue = nil
        } catch {
            guard !Task.isCancelled, current == generation else { return }
            if cursor != nil { actionIssue = true }
            else { detail = nil; issue = error }
        }
    }

    private func update(_ post: FeedPost, action: FeedAPI.Mutation) async {
        guard pending.insert(post.postID).inserted else { return }
        defer { pending.remove(post.postID) }
        do {
            try await feed.mutate(post.postID, action: action)
            let latest = try await feed.thread(post.postID)
            if let index = posts.firstIndex(where: { $0.postID == post.postID }) {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { posts[index] = latest.post }
            }
        } catch { actionIssue = true }
    }

    private func follow(_ selection: Bool, id: UUID) async {
        guard !savingFollow else { return }
        savingFollow = true
        defer { savingFollow = false }
        do {
            let result = try await api.follow(selection, page: id)
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { followState = result }
        } catch { actionIssue = true }
    }
}
