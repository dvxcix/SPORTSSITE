import SwiftUI

struct FeedView: View {
    let api: FeedAPI

    @Environment(\.colorScheme) private var scheme
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
                Picker("Feed", selection: $filter) {
                    ForEach(FeedFilter.allCases.filter { $0 != .following || api.userID != nil }, id: \.self) { value in
                        Text(value.rawValue.capitalized).tag(value)
                    }
                }
                Picker("Sport", selection: $sport) {
                    Text("All sports").tag("")
                    ForEach(availableSports, id: \.self) { Text($0).tag($0) }
                }
            }
            .listRowBackground(Brand.surface(for: scheme))

            switch load {
            case .loading:
                ProgressView("Loading feed")
                    .listRowBackground(Brand.surface(for: scheme))
            case .unavailable:
                ContentUnavailableView {
                    Label("Feed unavailable", systemImage: "bubble.left")
                } actions: {
                    Button("Retry") { revision += 1 }
                    SiteLink("Open web feed", path: "/feed")
                }
                .listRowBackground(Brand.surface(for: scheme))
            case .ready:
                feedRows
            }
        }
        .navigationTitle("Feed")
        .toolbar {
            if api.userID != nil, load == .ready {
                ToolbarItem(placement: .primaryAction) {
                    Button("Compose", systemImage: "square.and.pencil") { composing = true }
                }
            }
        }
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
                FeedPostCard(post: post)
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
            posts = page.posts.filter { seen.insert($0.id).inserted }
            cursor = page.hasMore ? page.nextCursor : nil
            load = .ready
        } catch {
            if !Task.isCancelled, requested == selection, current == generation { load = .unavailable }
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
            posts += page.posts.filter { seen.insert($0.id).inserted }
            cursor = page.hasMore ? page.nextCursor : nil
        } catch {
            if !Task.isCancelled, requested == selection, current == generation, cursor == expectedCursor { paginationError = true }
        }
    }
}
