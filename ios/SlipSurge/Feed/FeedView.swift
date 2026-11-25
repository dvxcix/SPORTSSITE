import SwiftUI

struct NativeFeedSelection: Hashable {
    let filter: FeedFilter
    let sport: String
    var refreshStories = false
}

struct FeedView: View {
    let api: FeedAPI
    @Binding var opensSelection: NativeFeedSelection?
    let scrollToTopRequest: Int
    let resumeOffer: NativeResumeOffer?

    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @State private var filter = FeedFilter.latest
    @State private var sport = ""
    @State private var posts: [FeedPost] = []
    @State private var cursor: String?
    @State private var load = State.loading
    @State private var loadedSelection: Selection?
    @State private var isLoadingMore = false
    @State private var paginationError = false
    @State private var revision = 0
    @State private var generation = 0
    @State private var availableSports = ["NBA", "NFL"]
    @State private var composing = false
    @State private var discussion: UUID?
    @State private var member: String?
    @State private var pending = Set<UUID>()
    @State private var postUpdates: [UUID: FeedPost] = [:]
    @State private var actionError = false

    private enum State {
        case loading, ready, unavailable
    }

    private struct Selection: Equatable {
        let filter: FeedFilter
        let sport: String
        let revision: Int
    }

    private var selection: Selection { Selection(filter: filter, sport: sport, revision: revision) }
    private var canCompose: Bool { api.userID != nil && load == .ready }

    init(api: FeedAPI, opensSelection: Binding<NativeFeedSelection?> = .constant(nil), scrollToTopRequest: Int = 0,
         resumeOffer: NativeResumeOffer? = nil) {
        self.api = api
        _opensSelection = opensSelection
        self.scrollToTopRequest = scrollToTopRequest
        self.resumeOffer = resumeOffer
    }

    var body: some View {
        ScrollViewReader { proxy in
            feedScroll(timeline)
                .onChange(of: scrollToTopRequest) {
                    withAnimation(reduceMotion ? nil : .smooth(duration: 0.28)) {
                        proxy.scrollTo("feed-start", anchor: .top)
                    }
                    recordPosition(0)
                }
        }
        .safeAreaInset(edge: .top, spacing: 0) { scopes }
        .safeAreaInset(edge: .bottom, alignment: .trailing, spacing: 0) {
            if canCompose {
                Button {
                    composing = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(scheme == .dark ? .black : .white)
                        .frame(width: 52, height: 52)
                        .background(Brand.accent(for: scheme), in: .circle)
                        .contentShape(.circle)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityLabel("Compose")
                .padding(.trailing, 16)
                .padding(.bottom, 12 + (sizeClass == .compact ? SlipSurgeTabBar.minimumHeight : 0))
            }
        }
        .navigationTitle("Feed")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $member) { name in
            MemberProfileView(api: DiscoverAPI(account: api.account, userID: api.userID), target: name)
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { VoltTeaser() }
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Image("brand").resizable().scaledToFit().frame(width: 25, height: 25)
                        .clipShape(.rect(cornerRadius: 6)).accessibilityHidden(true)
                    Text("SlipSurge").font(.headline.weight(.heavy)).accessibilityAddTraits(.isHeader)
                }
            }
            if api.userID != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        NativeSearchView(api: .init(viewer: .init(account: api.account, userID: api.userID)))
                    } label: { Label("Search", systemImage: "magnifyingglass") }
                }
            }
        }
        .navigationDestination(item: $discussion) { id in
            FeedThreadView(api: api, id: id, original: postUpdates[id] ?? posts.first { $0.postID == id },
                onPostChange: { postUpdates[id] = $0 }, onPostRemoved: { posts.removeAll { $0.postID == id } })
        }
        .alert("Change couldn’t be confirmed", isPresented: $actionError) {
            Button("OK", role: .cancel) {}
        } message: { Text("The feed will show the last confirmed post state.") }
        .sheet(isPresented: $composing) {
            if let userID = api.userID {
                FeedComposerView(account: api.account, userID: userID, allowMLB: availableSports.contains("MLB")) {
                    filter = .latest
                    sport = ""
                    revision += 1
                }
            }
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .onChange(of: opensSelection, initial: true) {
            guard let entry = opensSelection else { return }
            filter = entry.filter == .following && api.userID == nil ? .latest : entry.filter
            sport = entry.sport
            if entry.refreshStories { revision += 1 }
            opensSelection = nil
        }
        .task(id: selection) {
            if loadedSelection != selection || load != .ready { await firstPage() }
        }
        .refreshable { await firstPage() }
    }

    private var timeline: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Color.clear.frame(height: 0).id("feed-start").accessibilityHidden(true)
                if !availableSports.isEmpty { sports }
                if let resumeOffer { resumeOffer }
                StoriesRail(api: .init(account: api.account, userID: api.userID), sports: availableSports, revision: revision) { member = $0 }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 4)
                Divider()

                switch load {
                case .loading:
                    ProgressView("Loading feed").frame(maxWidth: .infinity).padding(.vertical, 24)
                case .unavailable:
                    ContentUnavailableView {
                        Label("Feed unavailable", systemImage: "bubble.left")
                    } actions: {
                        Button("Retry") { revision += 1 }
                    }
                case .ready:
                    feedRows
                }
            }
            .scrollTargetLayout()
        }
        .background(Brand.surface(for: scheme))
    }

    private var scopes: some View {
        let choices: [FeedFilter] = [.latest, .following, .picks, .top]
        return SocialSectionBar(title: "Feed sections", sections: choices.filter { $0 != .following || api.userID != nil },
            selection: Binding(get: { filter }, set: { value in
                guard filter != value else { return }
                filter = value
                recordPosition(0)
            })) { Text($0.rawValue.capitalized) }
    }

    private var sports: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach([""] + availableSports, id: \.self) { league in
                    Button {
                        guard sport != league else { return }
                        sport = league
                        recordPosition(0)
                    } label: {
                        HStack(spacing: 5) {
                            if !league.isEmpty {
                                ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt")
                                    .frame(width: 17, height: 17).accessibilityHidden(true)
                            }
                            Text(league.isEmpty ? "All sports" : LeagueArtwork.label(league))
                                .font(.footnote.weight(sport == league ? .bold : .medium))
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 7)
                        .foregroundStyle(sport == league ? Brand.accent(for: scheme) : Brand.text(for: scheme))
                        .background(sport == league ? Brand.accent(for: scheme).opacity(0.13) : .clear, in: .capsule)
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityAddTraits(sport == league ? .isSelected : [])
                }
            }
            .padding(.horizontal, 13)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: sport)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Filter feed by sport")
    }

    @ViewBuilder private func feedScroll(_ content: some View) -> some View {
        let intent = resume?.feedRestore.flatMap { target in
            target.selection.filter == filter && target.selection.sport == sport && load == .ready ? target : nil
        }
        if #available(iOS 18, *) {
            content.modifier(FeedResumeScroll(intent: intent, posts: posts.map(\.id),
                record: { recordPosition($0, anchor: $1) }, consume: { resume?.restoredFeed($0) },
                findPost: { anchor in posts.first(where: { $0.postID == anchor })?.id },
                loadMore: {
                    guard let cursor else { return false }
                    await nextPage(cursor)
                    return !paginationError
                }))
        } else {
            content.onChange(of: intent) { _, target in
                if let target { resume?.restoredFeed(target) }
            }
        }
    }

    private func recordPosition(_ scroll: Int, anchor: UUID? = nil) {
        guard resumeActive, api.userID != nil, discussion == nil, member == nil else { return }
        resume?.record(.feed(filter: filter, sport: sport, scroll: scroll, anchor: anchor), account: api.account, interaction: true)
    }

    @ViewBuilder
    private var feedRows: some View {
        if posts.isEmpty {
            Text(filter == .following ? "No posts from accounts you follow." : "No posts for this selection.")
                .font(.subheadline).foregroundStyle(.secondary).padding(14)
        }
        ForEach(posts) { post in
            FeedPostCard(post: postUpdates[post.postID] ?? post, operation: api.userID == nil ? nil : { action in
                Task { await apply(action, to: post.postID) }
            }, discussion: { discussion = post.postID },
            showAuthor: post.author.map { author in { member = author.username } }, actionsAPI: api,
            postChanged: { removed in
                if removed { posts.removeAll { $0.postID == post.postID } }
                Task { await firstPage() }
            })
            .padding(.horizontal, 15)
            .padding(.vertical, 6)
            .overlay(alignment: .bottom) { Divider().allowsHitTesting(false) }
            .disabled(pending.contains(post.postID))
            .id(post.id)
        }
        if let cursor {
            Button(paginationError ? "Retry loading more" : "Load more") {
                Task { await nextPage(cursor) }
            }
            .disabled(isLoadingMore)
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    private func firstPage() async {
        let requested = selection
        generation += 1
        let current = generation
        load = .loading
        cursor = nil
        posts = []
        postUpdates = [:]
        isLoadingMore = false
        paginationError = false
        do {
            let page = try await api.page(
                filter: requested.filter, sport: requested.sport.isEmpty ? nil : requested.sport, cursor: nil
            )
            guard !Task.isCancelled, requested == selection, current == generation else { return }
            availableSports = ["NBA", "NFL", "MLB"].filter(page.sports.contains)
            if !sport.isEmpty, !availableSports.contains(sport) {
                sport = ""
                return
            }
            var seen = Set<FeedPost.ID>()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.24)) {
                posts = page.posts.filter { seen.insert($0.id).inserted }
                cursor = page.hasMore ? page.nextCursor : nil
                loadedSelection = requested
                load = .ready
            }
        } catch {
            if !Task.isCancelled, requested == selection, current == generation { load = .unavailable }
        }
    }

    private func apply(_ action: FeedAPI.Mutation, to id: UUID) async {
        guard pending.insert(id).inserted else { return }
        defer { pending.remove(id) }
        do {
            try await api.mutate(id, action: action)
        } catch {
            actionError = true
        }
        if let latest = try? await api.thread(id) {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { postUpdates[id] = latest.post }
        } else {
            await firstPage()
        }
    }

    private func nextPage(_ expectedCursor: String) async {
        guard !isLoadingMore else { return }
        let requested = selection
        let current = generation
        isLoadingMore = true
        paginationError = false
        defer { if requested == selection, current == generation { isLoadingMore = false } }
        do {
            let page = try await api.page(
                filter: requested.filter, sport: requested.sport.isEmpty ? nil : requested.sport, cursor: expectedCursor
            )
            guard !Task.isCancelled, requested == selection, current == generation, cursor == expectedCursor else { return }
            var seen = Set(posts.map(\.id))
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.23)) {
                posts += page.posts.filter { seen.insert($0.id).inserted }
                cursor = page.hasMore ? page.nextCursor : nil
            }
        } catch {
            if !Task.isCancelled, requested == selection, current == generation, cursor == expectedCursor { paginationError = true }
        }
    }
}

@available(iOS 18, *)
private struct FeedResumeScroll: ViewModifier {
    private struct Geometry: Equatable {
        var offset = 0
        var limit = 0
        var topInset: CGFloat = 0
    }

    let intent: NativeResumeStore.FeedRestore?
    let posts: [FeedPost.ID]
    let record: (Int, UUID?) -> Void
    let consume: (NativeResumeStore.FeedRestore) -> Void
    let findPost: (UUID) -> FeedPost.ID?
    let loadMore: () async -> Bool
    @State private var position = ScrollPosition(idType: FeedPost.ID.self)
    @State private var geometry = Geometry()
    @State private var visible = Set<FeedPost.ID>()

    func body(content: Content) -> some View {
        content
            .scrollPosition($position)
            .onScrollGeometryChange(for: Geometry.self, of: { value in
                let maxOffset = value.contentSize.height + value.contentInsets.top + value.contentInsets.bottom - value.containerSize.height
                return Geometry(offset: max(0, Int((value.contentOffset.y + value.contentInsets.top).rounded())),
                    limit: max(0, Int(maxOffset.rounded())), topInset: value.contentInsets.top)
            }) { _, value in
                if intent != nil { geometry = value }
            }
            .onScrollPhaseChange { old, next, context in
                if next == .idle, old == .interacting || old == .decelerating {
                    let point = context.geometry.contentOffset.y + context.geometry.contentInsets.top
                    let offset = min(10_000_000, max(0, Int(point.rounded())))
                    record(offset, offset > 0 ? posts.first(where: visible.contains)?.post : nil)
                }
            }
            .onScrollTargetVisibilityChange(idType: FeedPost.ID.self, threshold: 0.25) { visible = Set($0) }
            .task(id: intent?.id) {
                if let intent {
                    await restore(intent)
                }
            }
    }

    private func restore(_ target: NativeResumeStore.FeedRestore) async {
        do {
            if target.offset == 0 {
                position.scrollTo(edge: .top)
                consume(target)
                return
            }
            try await Task.sleep(for: .milliseconds(150))
            for _ in 0..<4 {
                if let id = target.anchor.flatMap(findPost) {
                    position.scrollTo(id: id, anchor: .top)
                    consume(target)
                    return
                }
                guard target.anchor != nil || geometry.limit < target.offset, await loadMore() else { break }
                try await Task.sleep(for: .milliseconds(150))
            }
            try Task.checkCancellation()
            if let id = target.anchor.flatMap(findPost) {
                position.scrollTo(id: id, anchor: .top)
                consume(target)
                return
            }
            let desired = min(target.offset, geometry.limit > 0 ? geometry.limit : target.offset)
            var point = CGFloat(desired) - geometry.topInset
            position.scrollTo(y: point)
            // Lazy rows can update the layout after the first jump.
            for _ in 0..<2 {
                try await Task.sleep(for: .milliseconds(200))
                let correction = desired - geometry.offset
                guard abs(correction) > 3, geometry.limit > 0 else { break }
                point += CGFloat(correction)
                position.scrollTo(y: point)
            }
            consume(target)
        } catch {}
    }
}
