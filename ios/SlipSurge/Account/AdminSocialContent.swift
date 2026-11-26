import SwiftUI

struct AdminSocialContent: View {
    enum Kind: String { case posts, stories }

    private struct Entry: Decodable, Identifiable {
        struct Author: Decodable { let username: String?; let displayName: String?; let avatarUrl: URL? }
        let id: UUID
        let content: String?
        let caption: String?
        let author: Author?
        let sport: String?
        let visibility: String?
        let postType: String?
        let storyType: String?
        let mediaType: String?
        let mediaUrl: URL?
        let mediaUrls: [URL]?
        let reactionCount: Int?
        let commentCount: Int?
        let repostCount: Int?
        let viewCount: Int?
        let expiresAt: String?
        let createdAt: String?

        var date: Date? { createdAt.flatMap(SidelineBoard.timestamp) }
        var expiration: Date? { expiresAt.flatMap(SidelineBoard.timestamp) }
        var text: String { caption ?? content ?? "" }
    }

    private enum Sort: String, CaseIterable {
        case newest, oldest, likes = "most_liked", comments = "most_commented"
        var title: String {
            switch self {
            case .newest: "Newest first"
            case .oldest: "Oldest first"
            case .likes: "Most liked"
            case .comments: "Most commented"
            }
        }
    }

    private struct PostFilter: Equatable {
        var type = ""
        var from: Date?
        var to: Date?
        var sort = Sort.newest
    }

    private struct RequestVersion: Equatable { let filters: PostFilter; let query: String; let revision: Int }

    let viewer: DiscoverAPI
    let kind: Kind
    @Environment(\.slipPalette) private var slipPalette
    @State private var entries: [Entry]?
    @State private var query = ""
    @State private var filters = PostFilter()
    @State private var showingFilters = false
    @State private var issue: (any Error)?
    @State private var changeFailed = false
    @State private var deleting: Entry?
    @State private var selectedPost: Entry?
    @State private var selectedStory: Entry?
    @State private var author: String?
    @State private var busy = false
    @State private var revision = 0
    @State private var loadVersion = 0

    private let path = "/api/mobile/admin/content"
    private let types = ["", "text", "pick", "parlay", "poll", "analysis", "reel"]

    var body: some View {
        Group {
            if kind == .posts { content.searchable(text: $query, prompt: "Search author or content") }
            else { content }
        }
        .navigationTitle(kind == .posts ? "Manage posts" : "Manage stories")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if kind == .posts {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Filters", systemImage: filters == PostFilter() ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill") {
                        showingFilters = true
                    }
                }
            }
        }
        .sheet(isPresented: $showingFilters) { NavigationStack { postFilters } }
        .sheet(item: $selectedStory) { story in NavigationStack { storyDetail(story) } }
        .sheet(item: $selectedPost) { post in
            NavigationStack {
                FeedThreadView(api: .init(account: viewer.account, userID: viewer.userID), id: post.id, original: nil)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { selectedPost = nil } } }
            }
        }
        .navigationDestination(item: $author) { MemberProfileView(api: viewer, target: $0) }
        .task(id: RequestVersion(filters: filters, query: query, revision: revision)) {
            if !query.isEmpty { do { try await Task.sleep(for: .milliseconds(250)) } catch { return } }
            await load()
        }
        .refreshable { await load() }
        .confirmationDialog(kind == .posts ? "Delete this post?" : "Delete this story?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { entry in
                Button(kind == .posts ? "Delete post" : "Delete story", role: .destructive) { Task { await remove(entry.id) } }
            } message: { _ in Text(kind == .posts ? "Deleting a post also removes its discussion." : "The story will be permanently removed.") }
        .alert("Deletion couldn’t be confirmed", isPresented: $changeFailed) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private var content: some View {
        List {
            if let entries {
                if entries.isEmpty { ContentUnavailableView("No \(kind.rawValue) match", systemImage: "text.magnifyingglass") }
                if entries.count == 100 {
                    Section { Text("Showing the first 100 \(kind.rawValue).").font(.footnote).foregroundStyle(.secondary) }
                }
                ForEach(entries) { item in row(item).listRowBackground(slipPalette.surface) }
            } else {
                ResearchToolMessage(title: "\(kind.rawValue.capitalized) couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
    }

    private func row(_ item: Entry) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Button {
                if kind == .posts { selectedPost = item }
                else { selectedStory = item }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 7) {
                        ResearchArtwork(urls: [item.author?.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                            .frame(width: 29, height: 29).clipShape(.circle)
                        Text(item.author?.displayName ?? item.author?.username ?? "SlipSurge member").font(.subheadline.bold())
                        Spacer(minLength: 0)
                        if let sport = item.sport, let logo = LeagueArtwork.logo(sport) {
                            ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 18, height: 18)
                        }
                    }
                    if !item.text.isEmpty { NativeInlineEmojiText(source: item.text, linkify: { AttributedString($0) }).font(.subheadline).lineLimit(2) }
                    else if let media = item.mediaType ?? item.postType { Label(media.capitalized, systemImage: "photo").font(.caption) }
                    HStack(spacing: 7) {
                        Text((item.postType ?? item.storyType ?? item.mediaType ?? "Media").capitalized)
                        if kind == .posts, let visibility = item.visibility { Text(visibility.capitalized) }
                        if let date = item.date { Text(date.formatted(date: .abbreviated, time: .shortened)) }
                    }.font(.caption).foregroundStyle(.secondary)
                    if kind == .posts {
                        HStack(spacing: 9) {
                            Label((item.reactionCount ?? 0).formatted(), systemImage: "heart")
                            Label((item.commentCount ?? 0).formatted(), systemImage: "bubble.left")
                            Label((item.repostCount ?? 0).formatted(), systemImage: "arrow.2.squarepath")
                        }.font(.caption).foregroundStyle(.secondary)
                    } else {
                        HStack {
                            Label((item.viewCount ?? 0).formatted(), systemImage: "eye")
                            if let expiration = item.expiration {
                                Text(expiration < .now ? "Expired" : expiration.formatted(date: .abbreviated, time: .shortened))
                            }
                        }.font(.caption).foregroundStyle(.secondary)
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(SlipSurgePressStyle())
            Menu("Content actions", systemImage: "ellipsis") {
                if let username = item.author?.username {
                    Button("Open author profile", systemImage: "person.crop.circle") { author = username }
                }
                Button("Delete", systemImage: "trash", role: .destructive) { deleting = item }
            }.labelStyle(.iconOnly).disabled(busy)
        }
        .padding(.vertical, 4)
    }

    private var postFilters: some View {
        Form {
            Picker("Type", selection: $filters.type) {
                ForEach(types, id: \.self) { value in Text(value.isEmpty ? "All types" : value.capitalized).tag(value) }
            }
            Picker("Sort", selection: $filters.sort) {
                ForEach(Sort.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            dateFilter("From", date: $filters.from)
            dateFilter("To", date: $filters.to)
            Button("Clear filters") { filters = .init(); query = "" }
        }
        .navigationTitle("Post filters")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingFilters = false } } }
    }

    private func dateFilter(_ label: String, date: Binding<Date?>) -> some View {
        Group {
            if date.wrappedValue == nil {
                Button("Add \(label.lowercased()) date", systemImage: "calendar") { date.wrappedValue = .now }
            } else {
                DatePicker(label, selection: Binding(get: { date.wrappedValue ?? .now }, set: { date.wrappedValue = $0 }), displayedComponents: .date)
                Button("Clear \(label.lowercased()) date") { date.wrappedValue = nil }
            }
        }
        .environment(\.timeZone, TimeZone(secondsFromGMT: 0) ?? .current)
    }

    private func storyDetail(_ item: Entry) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let url = item.mediaUrl, FeedPostCard.allowedMedia(url) { FeedMedia(url: url) }
                NativeSocialBody(content: item.text)
                if let date = item.date { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.footnote).foregroundStyle(.secondary) }
            }
            .padding(16)
        }
        .navigationTitle(item.author?.displayName ?? "Story")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { selectedStory = nil } } }
    }

    private func load() async {
        struct Results: Decodable { let posts: [Entry]?; let stories: [Entry]? }
        loadVersion += 1
        let version = loadVersion
        var params = [URLQueryItem(name: "kind", value: kind.rawValue)]
        if kind == .posts {
            let dateStyle = Date.ISO8601FormatStyle(timeZone: TimeZone(secondsFromGMT: 0) ?? .current).year().month().day().dateSeparator(.dash)
            if !query.isEmpty { params.append(.init(name: "q", value: query)) }
            if !filters.type.isEmpty { params.append(.init(name: "type", value: filters.type)) }
            if let date = filters.from { params.append(.init(name: "from", value: date.formatted(dateStyle))) }
            if let date = filters.to { params.append(.init(name: "to", value: date.formatted(dateStyle))) }
            params.append(.init(name: "sort", value: filters.sort.rawValue))
        }
        do {
            let result = try await viewer.readPublic(Results.self, path: path, query: params)
            guard !Task.isCancelled, version == loadVersion else { return }
            entries = result.posts ?? result.stories ?? []
            issue = nil
        } catch {
            if !Task.isCancelled, version == loadVersion { entries = nil; issue = error }
        }
    }

    private func remove(_ id: UUID) async {
        struct Receipt: Decodable { let id: UUID }
        guard !busy, let userID = viewer.userID else { return }
        busy = true
        defer { busy = false }
        do {
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path,
                query: [.init(name: "kind", value: kind.rawValue), .init(name: "id", value: id.uuidString.lowercased())])
            request.httpMethod = "DELETE"
            request.setValue("Bearer \(try await viewer.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
            let receipt = try JSONDecoder().decode(Receipt.self, from: await SlipSurgeHTTP.send(request))
            guard receipt.id == id else { throw URLError(.badServerResponse) }
            entries?.removeAll { $0.id == id }
            await load()
        } catch { changeFailed = true }
    }
}
