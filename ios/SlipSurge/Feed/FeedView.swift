import SwiftUI

struct NativeFeedSelection: Hashable {
    let filter: FeedFilter
    let sport: String
    var refreshStories = false
}

struct FeedView: View {
    let api: FeedAPI
    @Binding var opensSelection: NativeFeedSelection?

    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @State private var filter = FeedFilter.latest
    @State private var sport = ""
    @State private var posts: [FeedPost] = []
    @State private var cursor: String?
    @State private var load = State.loading
    @State private var isLoadingMore = false
    @State private var paginationError = false
    @State private var revision = 0
    @State private var generation = 0
    @State private var availableSports = ["NBA", "NFL"]
    @State private var composing = false
    @State private var discussion: FeedPost?
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

    init(api: FeedAPI, opensSelection: Binding<NativeFeedSelection?> = .constant(nil)) {
        self.api = api
        _opensSelection = opensSelection
    }

    var body: some View {
        feedScroll(timeline)
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
            if let userID = api.userID {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    NavigationLink {
                        MessagesView(api: MessagesAPI(account: api.account, userID: userID))
                    } label: { Label("Messages", systemImage: "bubble.left.and.bubble.right") }
                    if load == .ready {
                        Button("Compose", systemImage: "square.and.pencil") { composing = true }
                    }
                }
            }
        }
        .sheet(item: $discussion) { post in
            NavigationStack {
                FeedThreadView(api: api, id: post.postID, original: post)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close", systemImage: "xmark") { discussion = nil }.labelStyle(.iconOnly)
                        }
                    }
            }
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
        .task(id: selection) { await firstPage() }
        .refreshable { await firstPage() }
    }

    private var timeline: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    StoriesRail(api: .init(account: api.account, userID: api.userID), sports: availableSports, revision: revision) { member = $0 }
                    ResearchToolRail(title: "Feed", choices: FeedFilter.allCases.filter { $0 != .following || api.userID != nil },
                        selection: Binding(get: { filter }, set: { value in
                            guard filter != value else { return }
                            filter = value
                            recordPosition(0)
                        }), label: { $0.rawValue.capitalized }) {
                        switch $0 {
                        case .latest: "clock"
                        case .top: "flame"
                        case .picks: "bolt"
                        case .following: "person.2"
                        }
                    }
                    if !availableSports.isEmpty {
                        ResearchArtworkPicker(title: "Sport", options: [.init(id: "", title: "All sports", icon: "sportscourt")]
                            + availableSports.map { .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt") },
                            selection: Binding(get: { sport }, set: { value in
                                guard sport != value else { return }
                                sport = value
                                recordPosition(0)
                            }))
                    }
                }
                .padding(.vertical, 4)

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
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
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
        guard resumeActive, api.userID != nil else { return }
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
            }, discussion: { discussion = postUpdates[post.postID] ?? post },
            showAuthor: post.author.map { author in { member = author.username } }, actionsAPI: api,
            postChanged: { removed in
                if removed { posts.removeAll { $0.postID == post.postID } }
                Task { await firstPage() }
            })
            .padding(.horizontal, 13).padding(.vertical, 7)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 19))
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
