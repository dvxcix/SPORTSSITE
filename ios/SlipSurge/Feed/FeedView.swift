import SwiftUI

struct FeedView: View {
    let api: FeedAPI

    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    ResearchToolRail(title: "Feed", choices: FeedFilter.allCases.filter { $0 != .following || api.userID != nil },
                        selection: $filter, label: { $0.rawValue.capitalized }) {
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
                            selection: $sport)
                    }
                }
                .listRowInsets(.init(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
            }

            switch load {
            case .loading:
                ProgressView("Loading feed")
                    .listRowBackground(Brand.surface(for: scheme))
            case .unavailable:
                ContentUnavailableView {
                    Label("Feed unavailable", systemImage: "bubble.left")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
                .listRowBackground(Brand.surface(for: scheme))
            case .ready:
                feedRows
            }
        }
        .navigationTitle("Feed")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $member) { name in
            MemberProfileView(api: DiscoverAPI(account: api.account, userID: api.userID), target: name)
        }
        .toolbar {
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
        .scrollContentBackground(.hidden)
        .listSectionSpacing(12)
        .contentMargins(.top, 8, for: .scrollContent)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: selection) { await firstPage() }
        .refreshable { await firstPage() }
    }

    @ViewBuilder
    private var feedRows: some View {
        if posts.isEmpty {
            Text(filter == .following ? "No posts from accounts you follow." : "No posts for this selection.")
                .listRowBackground(Brand.surface(for: scheme))
        }
        ForEach(posts) { post in
            Section {
                FeedPostCard(post: postUpdates[post.postID] ?? post, operation: api.userID == nil ? nil : { action in
                    Task { await apply(action, to: post.postID) }
                }, discussion: { discussion = postUpdates[post.postID] ?? post },
                showAuthor: post.author.map { author in { member = author.username } }, actionsAPI: api,
                postChanged: { removed in
                    if removed { posts.removeAll { $0.postID == post.postID } }
                    Task { await firstPage() }
                })
                .disabled(pending.contains(post.postID))
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
        if let cursor {
            Button(paginationError ? "Retry loading more" : "Load more") {
                Task { await nextPage(cursor) }
            }
            .disabled(isLoadingMore)
            .listRowBackground(Brand.surface(for: scheme))
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
