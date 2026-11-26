import SwiftUI

struct ArticlesView: View {
    let api: ArticlesAPI
    var mine = false
    @Environment(\.slipPalette) private var slipPalette
    @State private var entries: [ArticlesAPI.Article]?
    @State private var next: String?
    @State private var loadingMore = false
    @State private var issue: (any Error)?
    @State private var editor = false
    @State private var published: String?
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if let entries {
                    if entries.isEmpty {
                        ContentUnavailableView {
                            Label(mine ? "Your library is empty" : "No articles yet", systemImage: "book.closed")
                        } actions: {
                            Button("Write an article", systemImage: "square.and.pencil") { editor = true }
                                .buttonStyle(.borderedProminent)
                        }
                    }
                    ForEach(entries) { entry in
                        NavigationLink {
                            if mine && entry.status != "published" { ArticleEditorLoader(api: api, id: entry.id) { finish($0) } }
                            else { ArticleReader(api: api, slug: entry.slug) }
                        } label: {
                            ArticleCoverCard(value: entry, lead: !mine && entry.id == entries.first?.id, showStatus: mine)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                    }
                    if let next {
                        Button("More articles") { Task { await load(after: next) } }.buttonStyle(.bordered).disabled(loadingMore)
                    }
                    if let issue {
                        Text(issue.localizedDescription).font(.footnote).foregroundStyle(.secondary)
                    }
                } else if let gate = CommunityMembershipNotice.Requirement(issue) {
                    CommunityMembershipNotice(requirement: gate, subject: "Articles", account: api.viewer.account)
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Articles are currently unavailable", systemImage: "book.closed")
                } else {
                    ResearchToolMessage(title: "Articles couldn’t load", error: issue) { revision += 1 }
                }
            }
            .padding(16)
            .frame(maxWidth: 650)
            .frame(maxWidth: .infinity)
        }
        .background(slipPalette.background)
        .navigationTitle(mine ? "My articles" : "Articles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if entries != nil {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if !mine {
                        NavigationLink { ArticlesView(api: api, mine: true) } label: {
                            Label("My articles", systemImage: "text.document")
                        }
                    }
                    Button("Write an article", systemImage: "square.and.pencil") { editor = true }
                }
            }
        }
        .navigationDestination(item: $published) { ArticleReader(api: api, slug: $0) }
        .sheet(isPresented: $editor) {
            NavigationStack { ArticleEditor(api: api, draft: .init()) { finish($0) } }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func finish(_ result: ArticlesAPI.Receipt) {
        editor = false
        revision += 1
        if result.status == "published" { published = result.slug }
    }

    private func load(after cursor: String? = nil) async {
        guard cursor == nil || !loadingMore else { return }
        if cursor != nil { loadingMore = true }
        defer { if cursor != nil { loadingMore = false } }
        do {
            let page = try await api.articles(mine: mine, after: cursor)
            try Task.checkCancellation()
            if let cursor, cursor != next { return }
            let prior = cursor == nil ? [] : entries ?? []
            let seen = Set(prior.map(\.id))
            entries = prior + page.articles.filter { !seen.contains($0.id) }
            next = page.next
            issue = nil
        } catch {
            if !Task.isCancelled { issue = error }
        }
    }
}

struct ArticleReader: View {
    let api: ArticlesAPI
    let slug: String
    @Environment(\.slipPalette) private var slipPalette
    @State private var result: ArticlesAPI.Detail?
    @State private var liked: Bool?
    @State private var likes: Int?
    @State private var views: Int?
    @State private var recordedView = false
    @State private var editing = false
    @State private var savingLike = false
    @State private var issue: (any Error)?
    @State private var actionError = false
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if let result {
                    let article = result.article
                    ArticleCoverCard(value: article, lead: true, views: views)
                    HStack(spacing: 10) {
                        if let name = article.author?.username {
                            NavigationLink {
                                MemberProfileView(api: api.viewer, target: name)
                            } label: { Label("Author profile", systemImage: "person.crop.circle") }
                                .buttonStyle(.bordered)
                        }
                        Spacer()
                        Button {
                            Task { await changeLike(article) }
                        } label: {
                            Label((likes ?? article.likeCount ?? 0).formatted(), systemImage: isLiked(result) ? "heart.fill" : "heart")
                                .contentTransition(.numericText())
                        }
                        .buttonStyle(.bordered)
                        .disabled(savingLike)
                        .accessibilityLabel(isLiked(result) ? "Remove like" : "Like article")
                        .accessibilityValue((likes ?? article.likeCount ?? 0).formatted())
                    }
                    ArticleParagraphs(content: article.content ?? "")
                    if let bio = article.author?.bio, !bio.isEmpty {
                        ResearchToolCard(color: slipPalette.accent) {
                            Text("About the author").font(.headline)
                        } content: { Text(bio).font(.subheadline).foregroundStyle(.secondary) }
                    }
                    if !result.related.isEmpty {
                        ResearchSectionTitle(title: "Keep reading")
                        ForEach(result.related) { entry in
                            NavigationLink { ArticleReader(api: api, slug: entry.slug) } label: { ArticleCoverCard(value: entry) }
                                .buttonStyle(SlipSurgePressStyle())
                        }
                    }
                } else if let gate = CommunityMembershipNotice.Requirement(issue) {
                    CommunityMembershipNotice(requirement: gate, subject: "Article", account: api.viewer.account)
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 404 {
                    ContentUnavailableView("Article unavailable", systemImage: "book.closed")
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Articles are currently unavailable", systemImage: "book.closed")
                } else {
                    ResearchToolMessage(title: "Article couldn’t load", error: issue) { revision += 1 }
                }
            }
            .padding(16)
            .frame(maxWidth: 650)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(slipPalette.background)
        .navigationTitle("Article")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let article = result?.article {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if article.authorId == api.viewer.userID {
                        Button("Edit article", systemImage: "pencil") { editing = true }
                    }
                    if let url = URL(string: "https://\(SlipSurgeHTTP.site)/blog/\(article.slug)") {
                        ShareLink(item: url).accessibilityLabel("Share article")
                    }
                }
            }
        }
        .sheet(isPresented: $editing) {
            if let article = result?.article {
                NavigationStack {
                    ArticleEditor(api: api, draft: .init(article: article)) { _ in
                        editing = false
                        revision += 1
                    }
                }
            }
        }
        .alert("Like couldn’t be confirmed", isPresented: $actionError) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func isLiked(_ detail: ArticlesAPI.Detail) -> Bool { liked ?? detail.liked }

    private func load() async {
        do {
            let detail = try await api.detail(slug)
            try Task.checkCancellation()
            result = detail
            issue = nil
            if !savingLike { liked = detail.liked; likes = detail.article.likeCount }
            if !recordedView {
                recordedView = true
                views = try? await api.view(detail.article.id)
            }
        } catch {
            if !Task.isCancelled { result = nil; issue = error }
        }
    }

    private func changeLike(_ article: ArticlesAPI.Article) async {
        guard !savingLike, let result else { return }
        savingLike = true
        defer { savingLike = false }
        do {
            let confirmed = try await api.like(!isLiked(result), article: article.id)
            liked = confirmed.liked
            likes = confirmed.count
        } catch { actionError = true }
    }
}

private struct ArticleCoverCard: View {
    let value: ArticlesAPI.Article
    var lead = false
    var showStatus = false
    var views: Int?
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let cover = value.coverImage, cover.scheme == "https" {
                ArticleCover(url: cover, height: lead ? 210 : 128)
            }
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    if let sport = value.sport, let logo = LeagueArtwork.logo(sport) {
                        ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 23, height: 23)
                        Text(LeagueArtwork.label(sport)).font(.caption.weight(.semibold))
                    }
                    if let category = value.category { Text(category).font(.caption.weight(.semibold)).foregroundStyle(slipPalette.accent) }
                    if showStatus, let status = value.status { Text(status.capitalized).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                }
                Text(value.title).font(lead ? .largeTitle.weight(.bold) : .title3.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                if let excerpt = value.excerpt, !excerpt.isEmpty {
                    Text(excerpt).font(.subheadline).foregroundStyle(.secondary).lineLimit(lead ? nil : 3)
                }
                authorLine
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.primary)
        .background(slipPalette.surface, in: .rect(cornerRadius: 18))
        .clipShape(.rect(cornerRadius: 18))
    }

    private var authorLine: some View {
        let author = value.author
        let photo = author?.avatarUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        let ring = Color(hex: author?.avatarRingColor) ?? slipPalette.accent
        let hasRing = author?.avatarRingStyle.map { !["", "none", "default"].contains($0) } ?? false
        return HStack(spacing: 6) {
            if let author {
                ResearchArtwork(urls: [photo].compactMap { $0 }, fallback: "person.crop.circle.fill")
                    .frame(width: 29, height: 29).clipShape(.circle)
                    .overlay { if hasRing { Circle().strokeBorder(ring, lineWidth: 2) } }
                if let name = author.displayName ?? author.username { Text(name).lineLimit(1) }
                if author.isVerified == true { Image(systemName: "checkmark.seal.fill").foregroundStyle(slipPalette.accent).accessibilityLabel("Verified") }
                Spacer(minLength: 0)
            }
            if let date = value.createdAt.flatMap(SidelineBoard.timestamp) {
                Text(date.formatted(date: .abbreviated, time: .omitted))
            }
            if let count = views ?? value.viewCount, count > 0 { Label(count.formatted(), systemImage: "eye").accessibilityLabel("\(count) views") }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

struct ArticleCover: View {
    let url: URL
    let height: CGFloat

    var body: some View {
        GeometryReader { space in
            AsyncImage(url: url) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { Image(systemName: "photo").foregroundStyle(.secondary) }
            }
            .frame(width: space.size.width, height: space.size.height)
            .clipped()
        }
        .frame(height: height)
        .background(.secondary.opacity(0.12))
        .accessibilityHidden(true)
    }
}

struct ArticleParagraphs: View {
    let content: String

    var body: some View {
        let lines = content.split(separator: "\n", omittingEmptySubsequences: false)
        LazyVStack(alignment: .leading, spacing: 5) {
            ForEach(lines.indices, id: \.self) { index in
                let text = lines[index]
                if text.hasPrefix("### ") { heading(String(text.dropFirst(4)), .headline) }
                else if text.hasPrefix("## ") { heading(String(text.dropFirst(3)), .title2.bold()) }
                else if text.hasPrefix("# ") { heading(String(text.dropFirst(2)), .title.bold()) }
                else if text.trimmingCharacters(in: .whitespaces).isEmpty { Color.clear.frame(height: 6).accessibilityHidden(true) }
                else { Text(SiteAnnouncements.linkedText(String(text))).font(.body).lineSpacing(5).textSelection(.enabled) }
            }
        }
    }

    private func heading(_ title: String, _ font: Font) -> some View {
        Text(title).font(font).padding(.top, 6).accessibilityAddTraits(.isHeader)
    }
}
