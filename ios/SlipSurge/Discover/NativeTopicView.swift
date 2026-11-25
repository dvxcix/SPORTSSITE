import SwiftUI

struct NativeTopicView: View {
    private struct Result: Decodable {
        let tag: String
        let posts: [FeedPost]
    }

    let api: DiscoverAPI
    let tag: String
    @Environment(\.colorScheme) private var scheme
    @State private var result: Result?
    @State private var error: (any Error)?
    @State private var pending = Set<UUID>()
    @State private var selected: UUID?
    @State private var author: String?
    @State private var revision = 0
    @State private var actionProblem = false

    private var feed: FeedAPI { .init(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 11) {
                if let result {
                    if result.posts.isEmpty {
                        ContentUnavailableView("No recent posts", systemImage: "number")
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(result.posts) { post in
                                FeedPostCard(post: post, operation: { action in Task { await apply(action, to: post) } },
                                    discussion: { selected = post.postID }, showAuthor: post.author.map { identity in { author = identity.username } },
                                    actionsAPI: feed, postChanged: { _ in revision += 1 })
                                    .padding(13)
                                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
                                    .disabled(pending.contains(post.postID))
                            }
                        }
                    }
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView {
                        Label("Basic membership required", systemImage: "lock")
                    } actions: {
                        NavigationLink("Compare memberships") { NativeMembershipOverview(account: api.account) }
                            .buttonStyle(.borderedProminent)
                    }
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 404 {
                    ContentUnavailableView("Topic unavailable", systemImage: "number")
                } else {
                    ResearchToolMessage(title: "Topic couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle("#\(tag)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $author) { username in MemberProfileView(api: api, target: username) }
        .navigationDestination(item: $selected) { id in
            FeedThreadView(api: feed, id: id, original: result?.posts.first(where: { $0.postID == id }))
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .alert("Post action couldn’t be confirmed", isPresented: $actionProblem) {
            Button("OK", role: .cancel) {}
        }
    }

    private func load() async {
        do {
            let latest = try await api.readPublic(Result.self, path: "/api/mobile/topics", query: [.init(name: "tag", value: tag)])
            guard !Task.isCancelled, latest.tag == tag else { return }
            result = latest
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func apply(_ action: FeedAPI.Mutation, to post: FeedPost) async {
        guard pending.insert(post.postID).inserted else { return }
        defer { pending.remove(post.postID) }
        do { try await feed.mutate(post.postID, action: action) }
        catch { if !Task.isCancelled { actionProblem = true } }
        revision += 1
    }
}
