import SwiftUI

extension Notification.Name {
    static let didShareGameToFeed = Self("slipsurge.didShareGameToFeed")
}

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

    private let readingWidth: CGFloat = 680

    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @Environment(\.presentNativeSpotlight) private var presentSpotlight
    @AppStorage private var dismissedUltimateOffer: Bool
    @State private var filter = FeedFilter.latest
    @State private var sport = ""
    @State private var posts: [FeedPost] = []
    @State private var cursor: String?
    @State private var load = State.loading
    @State private var loadedSelection: Selection?
    @State private var firstPages: [Scope: Snapshot] = [:]
    @State private var refreshFailed = false
    @State private var refreshing = false
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
    @State private var visible = false

    private enum State {
        case loading, ready, unavailable
    }

    private struct Scope: Hashable {
        let viewer: UUID?
        let filter: FeedFilter
        let sport: String
    }

    private struct Selection: Equatable {
        let scope: Scope
        let revision: Int
    }

    private struct Snapshot {
        let posts: [FeedPost]
        let cursor: String?
        let fetchedAt: Date
    }

    private var scope: Scope { Scope(viewer: api.userID, filter: filter, sport: sport) }
    private var selection: Selection { Selection(scope: scope, revision: revision) }
    private var scoresAPI: DiscoverAPI { .init(account: api.account, userID: api.userID) }
    private var canCompose: Bool { api.userID != nil && (load == .ready || !firstPages.isEmpty) }

    init(api: FeedAPI, opensSelection: Binding<NativeFeedSelection?> = .constant(nil), scrollToTopRequest: Int = 0,
         resumeOffer: NativeResumeOffer? = nil) {
        self.api = api
        _opensSelection = opensSelection
        self.scrollToTopRequest = scrollToTopRequest
        self.resumeOffer = resumeOffer
        let viewer = api.userID?.uuidString ?? "guest"
        _dismissedUltimateOffer = AppStorage(wrappedValue: false, "nativeUltimateOfferDismissed.v1.\(viewer)")
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
                .onChange(of: scope) { proxy.scrollTo("feed-start", anchor: .top) }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            feedHeader
        }
        .safeAreaInset(edge: .bottom, alignment: .trailing, spacing: 0) {
            if canCompose {
                Button {
                    composing = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(scheme == .dark ? .black : .white)
                        .frame(width: 52, height: 52)
                        .background(slipPalette == .color ? slipPalette.actionFill : AnyShapeStyle(slipPalette.accent), in: .circle)
                        .contentShape(.circle)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityLabel("Compose")
                .padding(.trailing, 16)
                .padding(.bottom, 12 + (sizeClass == .compact ? SlipSurgeTabBar.minimumHeight : 0))
                .frame(maxWidth: readingWidth, alignment: .trailing)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $member) { name in
            MemberProfileView(api: DiscoverAPI(account: api.account, userID: api.userID), target: name)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(item: $discussion) { id in
            FeedThreadView(api: api, id: id, original: postUpdates[id] ?? posts.first { $0.postID == id },
                onPostChange: { postUpdates[id] = $0 }, onPostRemoved: { removePost(id) })
        }
        .alert("Change couldn’t be confirmed", isPresented: $actionError) {
            Button("OK", role: .cancel) {}
        } message: { Text("The feed will show the last confirmed post state.") }
        .sheet(isPresented: $composing) {
            if let userID = api.userID {
                FeedComposerView(account: api.account, userID: userID, allowMLB: availableSports.contains("MLB")) {
                    firstPages.removeAll()
                    filter = .latest
                    sport = ""
                    revision += 1
                }
            }
        }
        .background { SlipBackdrop(animatedFor: .feed) }
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
        .onChange(of: opensSelection, initial: true) {
            guard let entry = opensSelection else { return }
            filter = entry.filter == .following && api.userID == nil ? .latest : entry.filter
            sport = entry.sport
            if entry.refreshStories { revision += 1 }
            opensSelection = nil
        }
        .task(id: selection) {
            if loadedSelection != selection || load != .ready {
                let revisionChanged = loadedSelection.map { $0.revision != revision } ?? false
                await firstPage(force: revisionChanged)
            }
        }
        .refreshable { await firstPage() }
        .onReceive(NotificationCenter.default.publisher(for: .didShareGameToFeed)) { notification in
            guard let userID = api.userID, notification.object as? UUID == userID else { return }
            firstPages.removeAll()
            filter = .latest
            sport = ""
            revision += 1
        }
        .onAppear { visible = true }
        .onDisappear { visible = false }
    }

    private var feedHeader: some View {
        VStack(spacing: 1) {
            HStack {
                SlipBrandLockup(width: 114)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                if api.userID != nil { searchLink }
            }
            .frame(minHeight: 47)
            // Compact iPad windows place system window controls in the leading
            // part of the custom header. Keep the mark clear of those controls.
            .padding(.leading, sizeClass == .compact && UIDevice.current.userInterfaceIdiom == .pad ? 66 : 15)
            .padding(.trailing, 15)
            scopes
        }
        .frame(maxWidth: readingWidth)
        .frame(maxWidth: .infinity)
        .background {
            if slipPalette == .color {
                slipPalette.background.opacity(0.68)
                    .background(.ultraThinMaterial)
            } else {
                slipPalette.background
            }
        }
    }

    private var searchLink: some View {
        NavigationLink {
            NativeSearchView(api: .init(viewer: .init(account: api.account, userID: api.userID)))
        } label: {
            Image(systemName: "magnifyingglass")
                .font(.body.weight(.semibold))
                .foregroundStyle(slipPalette.text)
                .frame(width: 44, height: 44)
                .background(slipPalette.surface.opacity(0.75), in: .circle)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search")
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
                LiveGamesStrip(api: scoresAPI, active: resumeActive && visible)
                if filter == .latest, load == .ready, !dismissedUltimateOffer, api.account.showsUltimateOffer,
                   let presentSpotlight {
                    ultimateOffer { presentSpotlight(.ultimate) }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                }

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
                    if refreshFailed {
                        Button("Couldn’t refresh. Retry", systemImage: "arrow.clockwise") { Task { await firstPage() } }
                            .font(.subheadline).padding(.horizontal, 15).padding(.vertical, 8)
                    }
                    feedRows
                }
            }
            .scrollTargetLayout()
            .frame(maxWidth: readingWidth)
            .background {
                if slipPalette != .color { slipPalette.surface }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func ultimateOffer(open: @escaping () -> Void) -> some View {
        HStack(spacing: 4) {
            Button(action: open) {
                HStack(spacing: 10) {
                    Image(systemName: "bolt.fill").foregroundStyle(slipPalette.accent)
                        .frame(width: 32, height: 32)
                        .background(slipPalette.accent.opacity(0.13), in: .rect(cornerRadius: 9))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Explore Ultimate").font(.subheadline.weight(.bold))
                        Text("Full NBA and NFL research").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .padding(.leading, 10)
                .padding(.vertical, 8)
                .frame(minHeight: 48)
                .contentShape(.rect)
            }
            .buttonStyle(SlipSurgePressStyle())
            Button("Hide Ultimate offer", systemImage: "xmark") {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.17)) { dismissedUltimateOffer = true }
            }
            .labelStyle(.iconOnly)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 44, height: 44)
            .contentShape(.rect)
            .buttonStyle(.plain)
        }
        .background(slipPalette.selectionGradient, in: .rect(cornerRadius: 13))
    }

    private var scopes: some View {
        let choices: [FeedFilter] = [.latest, .following, .picks, .top]
        return SocialSectionBar(title: "Feed sections", sections: choices.filter { $0 != .following || api.userID != nil },
            selection: Binding(get: { filter }, set: { value in
                guard filter != value else { return }
                filter = value
                recordPosition(0)
            })) { item in
            VStack(spacing: 3) {
                SlipGlyph.view(item.symbol, size: 13)
                Text(item.rawValue.capitalized).font(.caption)
            }
        }
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
                                ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 17)
                                    .frame(width: 17, height: 17).accessibilityHidden(true)
                            }
                            Text(league.isEmpty ? "All sports" : LeagueArtwork.label(league))
                                .font(.footnote.weight(sport == league ? .bold : .medium))
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 7)
                        .foregroundStyle(sport == league ? slipPalette.accent : slipPalette.text)
                        .background(sport == league ? slipPalette.accent.opacity(0.13) : .clear, in: .capsule)
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
            target.selection.filter == filter && target.selection.sport == sport &&
                loadedSelection == selection && load == .ready && !refreshing ? target : nil
        }
        if #available(iOS 18, *) {
            content.modifier(FeedResumeScroll(intent: intent, posts: posts.map(\.id),
                record: { recordPosition($0, anchor: $1) }, consume: { resume?.restoredFeed($0) },
                findPost: { anchor in posts.first(where: { $0.postID == anchor })?.id },
                loadMore: {
                    guard let cursor else { return false }
                    await nextPage(cursor)
                    return !paginationError && self.cursor != cursor
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
                firstPages.removeAll()
                if removed { removePost(post.postID) }
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
            .disabled(isLoadingMore || refreshing)
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    private func firstPage(force: Bool = true) async {
        let requested = selection
        generation += 1
        let current = generation
        refreshing = true
        defer { if current == generation { refreshing = false } }
        isLoadingMore = false
        paginationError = false
        refreshFailed = false

        if loadedSelection?.scope == requested.scope, load == .ready {
            loadedSelection = requested
        } else if !force, let saved = firstPages[requested.scope], Date.now.timeIntervalSince(saved.fetchedAt) < 120 {
            show(saved, for: requested)
            if Date.now.timeIntervalSince(saved.fetchedAt) < 30 { return }
        } else {
            load = .loading
            posts = []
            cursor = nil
        }

        do {
            let page = try await api.page(
                filter: requested.scope.filter, sport: requested.scope.sport.isEmpty ? nil : requested.scope.sport, cursor: nil
            )
            guard !Task.isCancelled, requested == selection, current == generation else { return }
            availableSports = ["NBA", "NFL", "MLB"].filter(page.sports.contains)
            if !sport.isEmpty, !availableSports.contains(sport) {
                sport = ""
                return
            }
            var seen = Set<FeedPost.ID>()
            let snapshot = Snapshot(posts: page.posts.filter { seen.insert($0.id).inserted },
                cursor: page.hasMore ? page.nextCursor : nil, fetchedAt: .now)
            firstPages[requested.scope] = snapshot
            if firstPages.count > 8, let oldest = firstPages.min(by: { $0.value.fetchedAt < $1.value.fetchedAt }) {
                firstPages.removeValue(forKey: oldest.key)
            }
            for post in snapshot.posts { postUpdates.removeValue(forKey: post.postID) }
            show(snapshot, for: requested)
        } catch {
            guard !Task.isCancelled, requested == selection, current == generation else { return }
            let accessDenied = [401, 403, 404].contains((error as? SlipSurgeHTTP.Status)?.code ?? 0)
            if accessDenied {
                firstPages.removeAll()
                posts = []
                postUpdates = [:]
                cursor = nil
                load = .unavailable
            } else if load == .ready, loadedSelection == requested {
                refreshFailed = true
            } else {
                load = .unavailable
            }
        }
    }

    private func show(_ page: Snapshot, for selection: Selection) {
        posts = page.posts
        cursor = page.cursor
        loadedSelection = selection
        load = .ready
    }

    private func removePost(_ id: UUID) {
        posts.removeAll { $0.postID == id }
        postUpdates.removeValue(forKey: id)
        firstPages.removeAll()
    }

    private func apply(_ action: FeedAPI.Mutation, to id: UUID) async {
        guard pending.insert(id).inserted else { return }
        defer { pending.remove(id) }
        do {
            try await api.mutate(id, action: action)
            firstPages.removeAll()
        } catch {
            actionError = true
        }
        if let latest = try? await api.thread(id) {
            postUpdates[id] = latest.post
        } else {
            await firstPage()
        }
    }

    private func nextPage(_ expectedCursor: String) async {
        guard !refreshing, !isLoadingMore, loadedSelection == selection, cursor == expectedCursor else { return }
        let requested = selection
        let current = generation
        isLoadingMore = true
        paginationError = false
        defer { if requested == selection, current == generation { isLoadingMore = false } }
        do {
            let page = try await api.page(
                filter: requested.scope.filter, sport: requested.scope.sport.isEmpty ? nil : requested.scope.sport, cursor: expectedCursor
            )
            guard !Task.isCancelled, requested == selection, current == generation, cursor == expectedCursor else { return }
            var seen = Set(posts.map(\.id))
            posts += page.posts.filter { seen.insert($0.id).inserted }
            cursor = page.hasMore ? page.nextCursor : nil
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

    // These measurements serve resume tasks and the idle callback, not the view tree.
    @MainActor private final class Measurements {
        var geometry = Geometry()
        var visible: [FeedPost.ID] = []
        var userInterrupted: UUID?
    }

    let intent: NativeResumeStore.FeedRestore?
    let posts: [FeedPost.ID]
    let record: (Int, UUID?) -> Void
    let consume: (NativeResumeStore.FeedRestore) -> Void
    let findPost: (UUID) -> FeedPost.ID?
    let loadMore: () async -> Bool
    @State private var position = ScrollPosition(idType: FeedPost.ID.self)
    @State private var measurements = Measurements()

    func body(content: Content) -> some View {
        let restoring = intent != nil
        content
            .scrollPosition($position)
            .onScrollGeometryChange(for: Geometry.self, of: { value in
                guard restoring else { return Geometry() }
                let maxOffset = value.contentSize.height + value.contentInsets.top + value.contentInsets.bottom - value.containerSize.height
                return Geometry(offset: max(0, Int((value.contentOffset.y + value.contentInsets.top).rounded())),
                    limit: max(0, Int(maxOffset.rounded())), topInset: value.contentInsets.top)
            }) { _, value in
                if restoring { measurements.geometry = value }
            }
            .onScrollPhaseChange { old, next, context in
                if next == .interacting, let intent {
                    measurements.userInterrupted = intent.id
                    consume(intent)
                }
                if next == .idle, old == .interacting || old == .decelerating {
                    let point = context.geometry.contentOffset.y + context.geometry.contentInsets.top
                    let offset = min(10_000_000, max(0, Int(point.rounded())))
                    let visible = Set(measurements.visible)
                    record(offset, offset > 0 ? posts.first(where: visible.contains)?.post : nil)
                }
            }
            .onScrollTargetVisibilityChange(idType: FeedPost.ID.self, threshold: 0.25) { measurements.visible = $0 }
            .task(id: intent?.id) {
                if let intent {
                    await restore(intent)
                }
            }
    }

    private func restore(_ target: NativeResumeStore.FeedRestore) async {
        do {
            guard measurements.userInterrupted != target.id else { return }
            if target.offset == 0 {
                position.scrollTo(edge: .top)
                consume(target)
                return
            }
            try await Task.sleep(for: .milliseconds(150))
            for _ in 0..<4 {
                guard measurements.userInterrupted != target.id, !Task.isCancelled else { return }
                if let id = target.anchor.flatMap(findPost) {
                    position.scrollTo(id: id, anchor: .top)
                    consume(target)
                    return
                }
                guard target.anchor != nil || measurements.geometry.limit < target.offset, await loadMore() else { break }
                try await Task.sleep(for: .milliseconds(150))
            }
            try Task.checkCancellation()
            guard measurements.userInterrupted != target.id else { return }
            if let id = target.anchor.flatMap(findPost) {
                position.scrollTo(id: id, anchor: .top)
                consume(target)
                return
            }
            let geometry = measurements.geometry
            let desired = min(target.offset, geometry.limit > 0 ? geometry.limit : target.offset)
            var point = CGFloat(desired) - geometry.topInset
            position.scrollTo(y: point)
            // Lazy rows can update the layout after the first jump.
            for _ in 0..<2 {
                try await Task.sleep(for: .milliseconds(200))
                guard measurements.userInterrupted != target.id else { return }
                let measured = measurements.geometry
                let correction = desired - measured.offset
                guard abs(correction) > 3, measured.limit > 0 else { break }
                point += CGFloat(correction)
                position.scrollTo(y: point)
            }
            consume(target)
        } catch {}
    }
}
