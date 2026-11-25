import SwiftUI

struct FeedBookmarksView: View {
    private struct Bookmarks: Decodable { let posts: [FeedPost] }

    let api: FeedAPI
    @Environment(\.colorScheme) private var scheme
    @State private var bookmarks: Bookmarks?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var selected: UUID?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let bookmarks {
                    if bookmarks.posts.isEmpty {
                        ContentUnavailableView("No bookmarks", systemImage: "bookmark", description: Text("Save a post from Feed to find it here."))
                    }
                    ForEach(bookmarks.posts) { post in
                        FeedPostCard(post: post, discussion: { selected = post.postID }, actionsAPI: api, postChanged: { _ in revision += 1 })
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 18))
                        .contextMenu {
                            Button("Remove bookmark", systemImage: "bookmark.slash", role: .destructive) {
                                Task {
                                    do { try await api.mutate(post.postID, action: .init(kind: "bookmark", enabled: false)) }
                                    catch { self.error = error }
                                    await load()
                                }
                            }
                        }
                    }
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView("Membership required", systemImage: "lock", description: Text("Bookmarks are available with Basic access and above."))
                } else {
                    ResearchToolMessage(title: "Bookmarks couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle("Bookmarks")
        .navigationDestination(item: $selected) { id in FeedThreadView(api: api, id: id, original: bookmarks?.posts.first { $0.postID == id }) }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let value = try await DiscoverAPI(account: api.account, userID: api.userID)
                .memberRead(Bookmarks.self, path: "/api/mobile/bookmarks")
            try Task.checkCancellation()
            bookmarks = value
            error = nil
        } catch {
            if !Task.isCancelled { bookmarks = nil; self.error = error }
        }
    }
}
