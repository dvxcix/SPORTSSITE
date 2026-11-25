import SwiftUI

struct FeedThreadView: View {
    private enum Attachment: Hashable, Identifiable {
        case gif, emoji
        var id: Self { self }
    }

    let api: FeedAPI
    let id: UUID
    var original: FeedPost?
    var onPostChange: (FeedPost) -> Void = { _ in }
    var onPostRemoved: () -> Void = {}

    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var thread: FeedThread?
    @State private var unavailable = false
    @State private var pending = false
    @State private var notice: String?
    @State private var deleted: FeedThread.Comment?
    @State private var replyTo: FeedThread.Comment?
    @State private var editing: FeedThread.Comment?
    @State private var member: String?
    @State private var comment = ""
    @State private var draft = UUID()
    @State private var attachment: Attachment?
    @FocusState private var composerFocused: Bool

    private var post: FeedPost? { thread?.post ?? (unavailable ? nil : original) }

    var body: some View {
        ScrollView(.vertical, content: { conversation })
        .safeAreaInset(edge: .bottom) {
            if api.userID != nil, thread != nil { composer }
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.always, axes: .vertical)
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .socialDetail()
        .presentationContentInteraction(.scrolls)
        .interactiveDismissDisabled(composerFocused || !comment.isEmpty)
        .navigationDestination(item: $member) { name in
            MemberProfileView(api: DiscoverAPI(account: api.account, userID: api.userID), target: name)
        }
        .sheet(item: $attachment) { kind in
            switch kind {
            case .gif:
                if let userID = api.userID {
                    NativeGIFPickerSheet(account: api.account, userID: userID, uploadKind: .posts) { url in
                        appendToDraft(url.absoluteString)
                        attachment = nil
                    }
                }
            case .emoji:
                NavigationStack { NativeEmojiPicker(select: appendToDraft) }
                    .presentationDetents([.medium, .large])
            }
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: id) { await load() }
        .refreshable { await load() }
        .confirmationDialog("Delete comment?", isPresented: Binding(get: { deleted != nil }, set: { if !$0 { deleted = nil } }), titleVisibility: .visible) {
            if let item = deleted {
                Button("Delete", role: .destructive) {
                    deleted = nil
                    action(.init(kind: "comment-delete", id: item.id.uuidString.lowercased()))
                }
            }
        }
    }

    private var conversation: some View {
        VStack(alignment: .leading, spacing: 13) {
            if let post {
                let operation: ((FeedAPI.Mutation) -> Void)? = api.userID == nil ? nil : { value in action(value) }
                FeedPostCard(post: post, operation: operation, showDiscussionButton: false,
                    showAuthor: post.author.map { author in { member = author.username } }, actionsAPI: api,
                    postChanged: { removed in
                        if removed { onPostRemoved(); dismiss() } else { Task { await load() } }
                    })
                    .padding(14).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
            }
            if let notice {
                Label(notice, systemImage: "exclamationmark.circle").font(.footnote)
            }
            if let thread {
                commentList(thread.comments)
            } else if unavailable {
                ContentUnavailableView {
                    Label("Post couldn’t load", systemImage: "bubble")
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else {
                ProgressView("Loading conversation").frame(maxWidth: .infinity)
            }
        }
        .padding(16)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let target = replyTo ?? editing {
                HStack {
                    Text(editing == nil ? "Replying to \(target.author?.displayName ?? target.author?.username ?? "a member")" : "Editing your comment")
                        .font(.caption.weight(.medium))
                    Spacer()
                    Button("Cancel", systemImage: "xmark") {
                        replyTo = nil
                        editing = nil
                        comment = ""
                        draft = UUID()
                    }
                    .labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                Menu {
                    Button("GIF", systemImage: "play.rectangle") {
                        composerFocused = false
                        attachment = .gif
                    }
                    Button("Emoji", systemImage: "face.smiling") {
                        composerFocused = false
                        attachment = .emoji
                    }
                } label: {
                    Image(systemName: "plus").font(.body.weight(.semibold))
                        .frame(width: 44, height: 46)
                        .background(Brand.surface(for: scheme), in: .circle)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Add to reply")
                .disabled(pending)
                HStack(alignment: .bottom, spacing: 0) {
                    TextField("Write a reply", text: $comment, axis: .vertical)
                        .focused($composerFocused)
                        .lineLimit(1...4)
                        .padding(.vertical, 11)
                        .padding(.leading, 13)
                        .padding(.trailing, composerFocused ? 0 : 13)
                        .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                        .accessibilityIdentifier("post-reply-input")
                    if composerFocused {
                        Button {
                            composerFocused = false
                        } label: {
                            Image(systemName: "keyboard.chevron.compact.down")
                                .foregroundStyle(.secondary).frame(width: 44, height: 46).contentShape(.rect)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityLabel("Hide keyboard")
                    }
                }
                .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 23))
                .overlay {
                    RoundedRectangle(cornerRadius: 23).strokeBorder(.secondary.opacity(0.18)).allowsHitTesting(false)
                }
                Button {
                    submit()
                } label: {
                    Image(systemName: editing == nil ? "arrow.up" : "checkmark").font(.body.weight(.bold))
                        .foregroundStyle(commentIsSendable ? (scheme == .dark ? .black : .white) : .secondary)
                        .frame(width: 46, height: 46)
                        .background(commentIsSendable ? Brand.accent(for: scheme) : Brand.surface(for: scheme), in: .circle)
                        .contentShape(.circle)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityLabel(editing == nil ? "Send reply" : "Save reply")
                .disabled(!commentIsSendable)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background { Brand.background(for: scheme).ignoresSafeArea(.container, edges: .bottom) }
        .overlay(alignment: .top) { Divider().allowsHitTesting(false) }
    }

    private var commentIsSendable: Bool {
        !pending && !comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && comment.utf16.count <= 1_000
    }

    private func appendToDraft(_ text: String) {
        let next = comment.isEmpty ? text : comment + " " + text
        guard next.utf16.count <= 1_000 else {
            notice = "Shorten the reply before adding more."
            return
        }
        comment = next
    }

    @ViewBuilder
    private func commentList(_ items: [FeedThread.Comment]) -> some View {
        Text("Comments").font(.headline).accessibilityAddTraits(.isHeader)
        if items.isEmpty { Text("Start the conversation.").font(.subheadline).foregroundStyle(.secondary) }
        let ordered = orderedComments(items)
        LazyVStack(alignment: .leading, spacing: 8) {
            ForEach(ordered, id: \.0.id) { item, depth in
                row(item).padding(.leading, CGFloat(min(depth, 3)) * 13)
            }
        }
    }

    private func orderedComments(_ items: [FeedThread.Comment]) -> [(FeedThread.Comment, Int)] {
        let children = Dictionary(grouping: items, by: \.parentId)
        var ordered: [(FeedThread.Comment, Int)] = []
        var seen = Set<UUID>()
        func add(_ row: FeedThread.Comment, depth: Int) {
            guard seen.insert(row.id).inserted else { return }
            ordered.append((row, depth))
            for child in children[row.id] ?? [] { add(child, depth: depth + 1) }
        }
        for row in children[nil] ?? [] { add(row, depth: 0) }
        for row in items where !seen.contains(row.id) { add(row, depth: 0) }
        return ordered
    }

    private func row(_ item: FeedThread.Comment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                let avatar = item.author?.avatarUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
                ResearchArtwork(urls: avatar.map { [$0] } ?? [], fallback: "person.crop.circle", pointSize: 30)
                    .frame(width: 30, height: 30).clipShape(.circle)
                Text(item.author?.displayName ?? item.author?.username ?? "SlipSurge member").font(.subheadline.weight(.semibold))
                Spacer()
                if let date = SidelineBoard.timestamp(item.createdAt) {
                    Text(date, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
            }
            NativeSocialBody(content: item.text).font(.subheadline)
            if api.userID != nil {
                HStack(spacing: 15) {
                    Button {
                        action(.init(kind: "comment-reaction", enabled: !item.liked, id: item.id.uuidString.lowercased()))
                    } label: {
                        Label((item.reactionCount ?? 0).formatted(), systemImage: item.liked ? "heart.fill" : "heart")
                    }
                    .accessibilityLabel(item.liked ? "Remove like" : "Like comment")
                    Button("Reply") {
                        editing = nil
                        replyTo = item
                        composerFocused = true
                    }
                    Spacer()
                    if api.userID == item.authorId {
                        Menu("Comment options", systemImage: "ellipsis") {
                            Button("Edit", systemImage: "pencil") {
                                replyTo = nil
                                editing = item
                                comment = item.text
                                composerFocused = true
                            }
                            Button("Delete", systemImage: "trash", role: .destructive) { deleted = item }
                        }
                        .labelStyle(.iconOnly)
                    }
                }
                .buttonStyle(.borderless)
                .font(.caption.weight(.semibold))
                .disabled(pending)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
    }

    private func action(_ action: FeedAPI.Mutation) {
        guard !pending else { return }
        pending = true
        notice = nil
        Task {
            defer { pending = false }
            do {
                try await api.mutate(id, action: action)
                await load()
            } catch {
                notice = "That change couldn’t be confirmed. The post was refreshed."
                await load()
            }
        }
    }

    private func submit() {
        guard !pending else { return }
        let text = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        let command = FeedAPI.Mutation(kind: editing == nil ? "comment" : "comment-edit",
            id: (editing?.id ?? draft).uuidString.lowercased(), text: text, parent: replyTo?.id.uuidString.lowercased())
        pending = true
        notice = nil
        Task {
            defer { pending = false }
            do {
                try await api.mutate(id, action: command)
                if comment.trimmingCharacters(in: .whitespacesAndNewlines) == text { comment = "" }
                draft = UUID()
                replyTo = nil
                editing = nil
                await load()
            } catch {
                notice = "Your comment couldn’t be confirmed. Your text is still here."
                await load()
            }
        }
    }

    private func load() async {
        do {
            let value = try await api.thread(id)
            guard !Task.isCancelled else { return }
            onPostChange(value.post)
            thread = value
            unavailable = false
        } catch {
            guard !Task.isCancelled else { return }
            // A revoked entitlement must remove any previously displayed content.
            if let status = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(status.code) { thread = nil }
            unavailable = true
        }
    }
}
