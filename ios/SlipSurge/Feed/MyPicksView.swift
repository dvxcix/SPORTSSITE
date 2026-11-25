import SwiftUI

struct MyPicksView: View {
    private enum ViewType: String, CaseIterable {
        case active, history
        var label: String { self == .active ? "Active" : "All" }
    }

    private struct Page: Decodable {
        let posts: [FeedPost]
        let hasMore: Bool
    }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @State private var view = ViewType.active
    @State private var limit = 50
    @State private var sport = ""
    @State private var page: Page?
    @State private var requested: ViewType?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var focused: UUID?
    @State private var compose = false

    private var key: String { "\(view.rawValue):\(limit):\(revision)" }
    private var feed: FeedAPI { .init(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("Pick status", selection: $view) {
                    ForEach(ViewType.allCases, id: \.self) { Text($0.label).tag($0) }
                }.pickerStyle(.segmented)
                if let page, requested == view {
                    entries(page)
                } else {
                    ResearchToolMessage(title: "Picks couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle("My Picks")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationDestination(item: $focused) { id in FeedThreadView(api: feed, id: id) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button("Post a pick", systemImage: "square.and.pencil") { compose = true } }
        }
        .sheet(isPresented: $compose) {
            if let id = api.userID {
                FeedComposerView(account: api.account, userID: id, allowMLB: page?.posts.contains(where: { $0.sport == "MLB" }) == true,
                    startWithPick: true) { revision += 1 }
            }
        }
        .onChange(of: view) { _, _ in limit = 50; sport = ""; error = nil }
        .onChange(of: phase) { _, state in if state == .active { revision += 1 } }
        .task(id: key) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func entries(_ page: Page) -> some View {
        let choices = Set(page.posts.compactMap { $0.sport?.uppercased() }).sorted()
        if choices.count > 1 {
            ResearchArtworkPicker(title: "League", options: [.init(id: "", title: "All leagues", icon: "sportscourt")] + choices.map {
                .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt")
            }, selection: $sport)
        }
        let filtered = page.posts.filter { sport.isEmpty || $0.sport?.uppercased() == sport }
        if filtered.isEmpty { ContentUnavailableView(view == .active ? "No active picks" : "No picks yet", systemImage: "list.clipboard") }
        ForEach(filtered) { post in
            FeedPostCard(post: post, discussion: { focused = post.postID }, actionsAPI: feed, postChanged: { _ in revision += 1 })
                .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
        }
        if page.hasMore, limit < 500 {
            Button("Load more") { limit = min(500, limit + 50) }.buttonStyle(.bordered)
        }
    }

    private func load() async {
        let request = key, current = view
        do {
            let result = try await api.readPublic(Page.self, path: "/api/mobile/picks", query: [.init(name: "view", value: current.rawValue), .init(name: "limit", value: String(limit))])
            if !Task.isCancelled, key == request { page = result; requested = current; error = nil }
        } catch {
            if !Task.isCancelled, key == request { self.error = error }
        }
    }
}
