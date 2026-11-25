import SwiftUI

struct ForumIndexView: View {
    let api: ForumAPI
    @Environment(\.colorScheme) private var scheme
    @State private var categories: [ForumAPI.Category]?
    @State private var issue: (any Error)?
    @State private var creating = false
    @State private var routed: UUID?
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                if let categories {
                    if categories.isEmpty {
                        ContentUnavailableView("No discussion categories", systemImage: "bubble.left.and.bubble.right")
                    }
                    ForEach(categories) { board in
                        NavigationLink {
                            ForumCategoryView(api: api, slug: board.slug)
                        } label: { ForumCategoryRow(category: board) }
                            .buttonStyle(SlipSurgePressStyle())
                    }
                } else if let requirement = CommunityMembershipNotice.Requirement(issue) {
                    CommunityMembershipNotice(requirement: requirement, subject: "Discussions", account: api.viewer.account)
                } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Discussions are currently unavailable", systemImage: "bubble.left")
                } else {
                    ResearchToolMessage(title: "Discussions couldn’t load", error: issue) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Discussions")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $routed) { topic in ForumThreadView(api: api, id: topic) }
        .toolbar {
            if let categories, !categories.isEmpty, api.viewer.userID != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New thread", systemImage: "square.and.pencil") { creating = true }
                        .labelStyle(.iconOnly)
                }
            }
        }
        .sheet(isPresented: $creating) {
            if let categories {
                NavigationStack {
                    ForumComposer(api: api, categories: categories, defaultCategory: nil) { receipt in
                        creating = false
                        routed = receipt.id
                        revision += 1
                    }
                }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let result = try await api.categories()
            try Task.checkCancellation()
            categories = result
            issue = nil
        } catch { if !Task.isCancelled { issue = error } }
    }
}

struct ForumCategoryView: View {
    let api: ForumAPI
    let slug: String
    @Environment(\.colorScheme) private var scheme
    @State private var board: ForumAPI.Board?
    @State private var failure: (any Error)?
    @State private var creating = false
    @State private var routed: UUID?
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 9) {
                if let board {
                    ForumCategoryRow(category: board.category, showCount: false)
                    if board.threads.isEmpty {
                        ContentUnavailableView("No threads yet", systemImage: "bubble.left.and.bubble.right")
                    }
                    ForEach(board.threads) { topic in
                        NavigationLink {
                            ForumThreadView(api: api, id: topic.id)
                        } label: { ForumTopicRow(topic: topic) }
                            .buttonStyle(SlipSurgePressStyle())
                    }
                } else if let requirement = CommunityMembershipNotice.Requirement(failure) {
                    CommunityMembershipNotice(requirement: requirement, subject: "Discussions", account: api.viewer.account)
                } else if (failure as? SlipSurgeHTTP.Status)?.code == 404 {
                    ContentUnavailableView("Category unavailable", systemImage: "bubble.left")
                } else {
                    ResearchToolMessage(title: "Category couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(board?.category.name ?? "Discussions")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $routed) { id in ForumThreadView(api: api, id: id) }
        .toolbar {
            if board != nil, api.viewer.userID != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New thread", systemImage: "square.and.pencil") { creating = true }.labelStyle(.iconOnly)
                }
            }
        }
        .sheet(isPresented: $creating) {
            if let board {
                NavigationStack {
                    ForumComposer(api: api, categories: [board.category], defaultCategory: board.category.id) { receipt in
                        creating = false
                        routed = receipt.id
                        revision += 1
                    }
                }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let value = try await api.board(slug)
            try Task.checkCancellation()
            guard value.category.slug == slug else { throw URLError(.badServerResponse) }
            board = value
            failure = nil
        } catch { if !Task.isCancelled { failure = error } }
    }
}

struct ForumCategoryRow: View {
    let category: ForumAPI.Category
    var showCount = true
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            HStack(spacing: 10) {
                Group {
                    if let sport = category.sport, let artwork = LeagueArtwork.logo(sport) {
                        ResearchArtwork(urls: [artwork], fallback: "sportscourt")
                    } else if let icon = category.icon, !icon.isEmpty {
                        Text(icon).font(.title2)
                    } else {
                        Image(systemName: "bubble.left.and.bubble.right").foregroundStyle(Brand.accent(for: scheme))
                    }
                }
                .frame(width: 39, height: 39)
                .background(Brand.accent(for: scheme).opacity(0.11), in: .rect(cornerRadius: 10))
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(category.name).font(.headline).foregroundStyle(.primary)
                    if let description = category.description { Text(description).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 4)
                if showCount {
                    VStack(spacing: 3) {
                        Text((category.threadCount ?? 0).formatted()).font(.subheadline.bold().monospacedDigit())
                        Text("Threads").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        } content: {}
        .accessibilityElement(children: .combine)
    }
}

struct ForumTopicRow: View {
    let topic: ForumAPI.Topic
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ResearchToolCard(color: topic.isPinned == true ? Brand.accent(for: scheme) : .secondary) {
            HStack(alignment: .top, spacing: 8) {
                ForumAvatar(author: topic.author, size: 37)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        if topic.isPinned == true {
                            Image(systemName: "pin.fill").foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Pinned")
                        }
                        if topic.isLocked == true { Image(systemName: "lock").accessibilityLabel("Locked") }
                        Text(topic.title).font(.headline).foregroundStyle(.primary)
                    }
                    let name = topic.author.map { "@\($0.username)" }
                    let date = topic.createdAt.flatMap(SidelineBoard.timestamp)?.formatted(date: .abbreviated, time: .omitted)
                    Text([name, date].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Label((topic.replyCount ?? 0).formatted(), systemImage: "bubble.left").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    .accessibilityLabel("\(topic.replyCount ?? 0) replies")
            }
        } content: {}
    }
}

struct ForumAvatar: View {
    let author: ForumAPI.Author?
    let size: CGFloat
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let ring = Color(hex: author?.avatarRingColor) ?? Brand.accent(for: scheme)
        let decorated = !(author?.avatarRingStyle.map { ["", "none", "default"].contains($0) } ?? true)
        let avatar = author?.avatarUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        ResearchArtwork(urls: [avatar].compactMap { $0 }, fallback: "person.crop.circle.fill")
            .frame(width: size, height: size)
            .background(Brand.surface(for: scheme))
            .clipShape(.circle)
            .overlay {
                if decorated { Circle().strokeBorder(ring, lineWidth: 2) }
            }
            .accessibilityHidden(true)
    }
}

struct ForumComposer: View {
    let api: ForumAPI
    let categories: [ForumAPI.Category]
    let defaultCategory: UUID?
    var thread: UUID?
    var parent: ForumAPI.Reply?
    var editing: ForumAPI.Reply?
    let saved: (ForumAPI.Receipt) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draftID = UUID()
    @State private var categorySelection = ""
    @State private var title = ""
    @State private var content = ""
    @State private var saving = false
    @State private var issue: String?
    @State private var mentions: [ForumAPI.Mention] = []
    @State private var capturedMention: String?

    private var canSave: Bool {
        guard !saving, content.utf16.count <= 5_000 else { return false }
        if thread == nil {
            return title.utf16.count <= 120 && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chosenCategory != nil
        }
        return !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var chosenCategory: UUID? { UUID(uuidString: categorySelection) ?? defaultCategory ?? categories.first?.id }

    var body: some View {
        Form {
            if thread == nil {
                Section("Discussion") {
                    ResearchArtworkPicker(title: "Category", options: categories.map { category in
                        .init(id: category.id.uuidString, title: category.name, url: category.sport.flatMap(LeagueArtwork.logo),
                            icon: "bubble.left.and.bubble.right")
                    }, selection: $categorySelection)
                    TextField("Title", text: $title)
                }
            }
            if let parent, let author = parent.author {
                Section { Text("Replying to @\(author.username)").font(.subheadline).foregroundStyle(.secondary) }
            }
            Section {
                TextEditor(text: $content).frame(minHeight: 135).accessibilityLabel(thread == nil ? "Discussion post" : "Reply")
                HStack {
                    Menu("Add emoji", systemImage: "face.smiling") {
                        ForEach(["🔥", "👍", "💡", "👀", "😂", "⚡", "🏆", "❤️"], id: \.self) { emoji in
                            Button(emoji) { append(emoji) }
                        }
                    }
                    if let userID = api.viewer.userID {
                        NativeGIFPickerButton(account: api.viewer.account, userID: userID, uploadKind: .posts,
                            compact: true, placement: .forum) {
                            append($0.absoluteString)
                        }
                    }
                    Spacer()
                    Text("\(content.utf16.count) / 5,000").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            if capturedMention == mention, !mentions.isEmpty {
                Section("Mention a member") {
                    ForEach(mentions) { candidate in
                        Button {
                            completeMention(candidate.username)
                        } label: {
                            DugoutOpponentArtwork(name: candidate.displayName ?? candidate.username, subtitle: "@\(candidate.username)",
                                headshot: candidate.avatarUrl)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                    }
                }
            }
            if let issue { Section { Text(issue).font(.subheadline).foregroundStyle(.red) } }
        }
        .navigationTitle(editing != nil ? "Edit Reply" : thread == nil ? "New Thread" : "Reply")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button(editing != nil ? "Save" : "Post") { Task { await post() } }.disabled(!canSave)
            }
        }
        .interactiveDismissDisabled(saving)
        .onAppear {
            if categorySelection.isEmpty { categorySelection = (defaultCategory ?? categories.first?.id)?.uuidString ?? "" }
            if let editing, content.isEmpty { content = editing.content ?? "" }
        }
        .task(id: mention) {
            let lookup = mention
            capturedMention = nil
            guard let lookup else { return }
            do {
                try await Task.sleep(for: .milliseconds(140))
                let results = try await api.mentions(lookup)
                try Task.checkCancellation()
                guard mention == lookup else { return }
                mentions = results
                capturedMention = lookup
            } catch { if !Task.isCancelled { mentions = [] } }
        }
    }

    private var mention: String? {
        guard let range = content.range(of: #"(^|\s)@[A-Za-z0-9_.]{0,30}$"#, options: .regularExpression),
              let at = content[range].firstIndex(of: "@") else { return nil }
        return String(content[content.index(after: at)...])
    }

    private func completeMention(_ name: String) {
        guard let start = content.lastIndex(of: "@"), mention != nil else { return }
        content.replaceSubrange(start..., with: "@\(name) ")
    }

    private func append(_ addition: String) {
        let combined = content.isEmpty ? addition : content + " " + addition
        if combined.utf16.count <= 5_000 { content = combined }
    }

    private func post() async {
        guard canSave else { return }
        saving = true
        issue = nil
        defer { saving = false }
        let action = ForumAPI.Change(kind: editing != nil ? .edit : thread == nil ? .thread : .reply, id: editing?.id ?? draftID,
            thread: thread, category: chosenCategory, parent: parent?.id, title: title, content: content,
            expectedEditedAt: editing?.editedAt)
        do {
            let receipt = try await api.change(action)
            dismiss()
            saved(receipt)
        } catch let status as SlipSurgeHTTP.Status {
            struct Message: Decodable { let error: String }
            issue = (try? JSONDecoder().decode(Message.self, from: status.data))?.error ?? "The discussion action couldn’t be confirmed."
        } catch { issue = "The discussion action couldn’t be confirmed. Your draft is still here." }
    }
}
