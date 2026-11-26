import SwiftUI

struct ForumThreadView: View {
    private struct Editor: Identifiable {
        let id = UUID()
        var parent: ForumAPI.Reply?
        var existing: ForumAPI.Reply?
    }

    let api: ForumAPI
    let id: UUID
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @AppStorage("appearance") private var appearance = Appearance.color
    @State private var topic: ForumAPI.Topic?
    @State private var replies: [ForumAPI.Reply] = []
    @State private var reactions: [String: [ForumAPI.Reaction]] = [:]
    @State private var mentions = Set<String>()
    @State private var next: String?
    @State private var paging = false
    @State private var issue: (any Error)?
    @State private var message: String?
    @State private var target: Editor?
    @State private var deleting: ForumAPI.Reply?
    @State private var signIn = false
    @State private var pending: Set<UUID> = []
    @State private var member: String?
    @State private var scrollTo: UUID?
    @State private var revision = 0

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 11) {
                    if let topic { discussion(topic) }
                    else if let requirement = CommunityMembershipNotice.Requirement(issue) {
                        CommunityMembershipNotice(requirement: requirement, subject: "Discussion", account: api.viewer.account)
                    } else if (issue as? SlipSurgeHTTP.Status)?.code == 404 {
                        ContentUnavailableView("Discussion unavailable", systemImage: "bubble.left")
                    } else if (issue as? SlipSurgeHTTP.Status)?.code == 403 {
                        ContentUnavailableView("Discussions are currently unavailable", systemImage: "bubble.left")
                    } else {
                        ResearchToolMessage(title: "Discussion couldn’t load", error: issue) { revision += 1 }
                    }
                }
                .padding(16)
            }
            .onChange(of: scrollTo) { _, replyID in
                guard let replyID else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.24)) { proxy.scrollTo(replyID, anchor: .bottom) }
                scrollTo = nil
            }
        }
        .background(slipPalette.background)
        .navigationTitle("Discussion")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $member) { target in MemberProfileView(api: api.viewer, target: target) }
        .toolbar {
            if let topic, let url = URL(string: "https://\(SlipSurgeHTTP.site)/forum/thread/\(topic.id.uuidString.lowercased())") {
                ToolbarItem(placement: .topBarTrailing) { ShareLink(item: url).accessibilityLabel("Share discussion") }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $target) { editor in
            NavigationStack {
                ForumComposer(api: api, categories: [], defaultCategory: nil, thread: id,
                    parent: editor.parent, editing: editor.existing) { receipt in
                    if let reply = receipt.reply {
                        accept(reply)
                        if editor.existing == nil { scrollTo = reply.id }
                    }
                }
            }
        }
        .sheet(isPresented: $signIn) {
            NavigationStack {
                AccountSignInView(account: api.viewer.account, appearance: $appearance)
                    .navigationTitle("Sign in to participate")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { signIn = false } } }
            }
        }
        .confirmationDialog("Delete reply?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { reply in
                Button("Delete reply", role: .destructive) { Task { await remove(reply) } }
            }
        .alert("Discussion update", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) { message = nil }
        } message: { Text(message ?? "") }
    }

    @ViewBuilder
    private func discussion(_ topic: ForumAPI.Topic) -> some View {
        ForumTopicRow(topic: topic)
        ResearchToolCard(color: slipPalette.accent) {
            author(topic.author, created: topic.createdAt)
        } content: {
            if let content = topic.content, !content.isEmpty { discussionText(content) }
            reactionRow(id, type: "forum_thread")
        }
        if !replies.isEmpty {
            ResearchSectionTitle(title: "Replies")
            ForEach(replies) { value in
                replyCard(value, locked: topic.isLocked == true)
                    .padding(.leading, value.parentReplyId == nil ? 0 : 12)
                    .id(value.id)
            }
        }
        if let next {
            Button("Load more replies", systemImage: "chevron.down.circle") {
                Task { await load(after: next) }
            }
            .buttonStyle(.bordered)
            .disabled(paging)
        }
        if topic.isLocked == true {
            Label("This thread is locked", systemImage: "lock").font(.subheadline).foregroundStyle(.secondary)
        } else if api.viewer.userID != nil {
            Button("Reply", systemImage: "arrowshape.turn.up.left") { target = .init() }.buttonStyle(.borderedProminent)
        } else {
            Button("Sign in to reply", systemImage: "person.crop.circle") { signIn = true }.buttonStyle(.borderedProminent)
        }
    }

    private func replyCard(_ value: ForumAPI.Reply, locked: Bool) -> some View {
        ResearchToolCard(color: .secondary) {
            author(value.author, created: value.createdAt)
        } content: {
            if let parent = value.parentReplyId, let visible = replies.first(where: { $0.id == parent }) {
                Text("Reply to @\(visible.author?.username ?? "member")")
                    .font(.caption.weight(.medium)).foregroundStyle(.secondary)
            }
            if value.isDeleted == true {
                Text("Reply deleted").font(.subheadline).italic().foregroundStyle(.secondary)
            } else {
                discussionText(value.content ?? "")
                if value.editedAt != nil { Text("Edited").font(.caption).foregroundStyle(.secondary) }
            }
            reactionRow(value.id, type: "forum_reply")
            if let userID = api.viewer.userID, value.isDeleted != true {
                HStack(spacing: 12) {
                    if !locked {
                        Button("Reply", systemImage: "arrowshape.turn.up.left") { target = .init(parent: value) }
                    }
                    if value.authorId == userID {
                        Button("Edit", systemImage: "pencil") { target = .init(existing: value) }
                        Button("Delete", systemImage: "trash", role: .destructive) { deleting = value }
                    }
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.borderless)
            }
        }
    }

    private func discussionText(_ content: String) -> some View {
        NativeSocialBody(content: content, linkify: linkedMentions)
            .font(.body)
            .environment(\.openURL, OpenURLAction { url in
                if url.scheme == "slipsurge-forum-mention", let name = url.host, mentions.contains(name) { member = name }
                else { openURL(url) }
                return .handled
            })
    }

    private func linkedMentions(_ text: String) -> AttributedString {
        var formatted = SiteAnnouncements.linkedText(text)
        for match in text.matches(of: #/@([a-zA-Z0-9_.]{1,30})/#) {
            if match.range.lowerBound != text.startIndex,
               text[text.index(before: match.range.lowerBound)].isLetter ||
                 text[text.index(before: match.range.lowerBound)].isNumber { continue }
            let name = match.output.1.lowercased()
            guard mentions.contains(name), let url = URL(string: "slipsurge-forum-mention://\(name)"),
                  let start = AttributedString.Index(match.range.lowerBound, within: formatted),
                  let end = AttributedString.Index(match.range.upperBound, within: formatted),
                  formatted[start..<end].link == nil else { continue }
            formatted[start..<end].link = url
        }
        return formatted
    }

    @ViewBuilder
    private func author(_ person: ForumAPI.Author?, created: String?) -> some View {
        let time = created.flatMap(SidelineBoard.timestamp)?.formatted(date: .abbreviated, time: .shortened)
        if let person {
            Button { member = person.username } label: {
                HStack(spacing: 7) {
                    ForumAvatar(author: person, size: 36)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(person.displayName ?? person.username).font(.subheadline.weight(.semibold))
                        if let time { Text(time).font(.caption).foregroundStyle(.secondary) }
                    }
                    if person.isVerified == true {
                        Image(systemName: "checkmark.seal.fill").font(.caption)
                            .foregroundStyle(slipPalette.accent).accessibilityLabel("Verified")
                    }
                }
            }
            .buttonStyle(SlipSurgePressStyle())
        } else {
            DugoutOpponentArtwork(name: "SlipSurge member", subtitle: time)
        }
    }

    private func reactionRow(_ targetID: UUID, type: String) -> some View {
        let current = reactions[targetID.uuidString.lowercased()] ?? []
        let score = (current.first { $0.emoji == "⬆️" }?.count ?? 0) - (current.first { $0.emoji == "⬇️" }?.count ?? 0)
        return ScrollView(.horizontal) {
            HStack(spacing: 7) {
                reaction("⬆️", label: "Upvote", icon: "arrow.up", targetID: targetID, type: type, current: current)
                Text(ResearchFormat.signed(score)).font(.subheadline.monospacedDigit()).accessibilityLabel("Score \(score)")
                reaction("⬇️", label: "Downvote", icon: "arrow.down", targetID: targetID, type: type, current: current)
                if api.viewer.userID != nil || current.contains(where: { !["⬆️", "⬇️"].contains($0.emoji) }) {
                    ForEach(["🔥", "👍", "💡", "👀"], id: \.self) { emoji in
                        if api.viewer.userID != nil || current.contains(where: { $0.emoji == emoji }) {
                            reaction(emoji, label: "React \(emoji)", icon: nil, targetID: targetID, type: type, current: current)
                        }
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func reaction(_ emoji: String, label: String, icon: String?, targetID: UUID, type: String,
        current: [ForumAPI.Reaction]) -> some View {
        let state = current.first { $0.emoji == emoji }
        let active = state?.mine == true
        return Button {
            if api.viewer.userID == nil { signIn = true }
            else { Task { await react(emoji: emoji, id: targetID, type: type, enabled: !active) } }
        } label: {
            HStack(spacing: 3) {
                if let icon { Image(systemName: icon).font(.caption.weight(.semibold)) }
                else {
                    Text(emoji)
                    if let count = state?.count, count > 0 { Text(count.formatted()).font(.caption.monospacedDigit()) }
                }
            }
            .foregroundStyle(active ? slipPalette.accent : slipPalette.text)
            .padding(.horizontal, 6)
            .frame(minWidth: 44, minHeight: 44)
            .background(slipPalette.accent.opacity(active ? 0.15 : 0.03), in: .capsule)
        }
        .buttonStyle(SlipSurgePressStyle())
        .disabled(pending.contains(targetID))
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private func load(after cursor: String? = nil) async {
        guard cursor == nil || !paging else { return }
        if cursor != nil { paging = true }
        defer { if cursor != nil { paging = false } }
        do {
            let result = try await api.discussion(id, after: cursor)
            try Task.checkCancellation()
            if let cursor, cursor != next { return }
            if cursor == nil {
                replies = result.replies
                reactions = result.reactions
                mentions = Set(result.mentions ?? [])
            } else {
                let seen = Set(replies.map(\.id))
                replies += result.replies.filter { !seen.contains($0.id) }
                sortReplies()
                reactions.merge(result.reactions) { _, latest in latest }
                mentions.formUnion(result.mentions ?? [])
            }
            topic = result.thread
            next = result.next
            issue = nil
        } catch {
            guard !Task.isCancelled else { return }
            if cursor == nil { issue = error }
            else { message = "More replies couldn’t load. Try again." }
        }
    }

    private func accept(_ reply: ForumAPI.Reply) {
        if let index = replies.firstIndex(where: { $0.id == reply.id }) {
            replies[index] = reply
        } else {
            replies.append(reply)
            sortReplies()
        }
    }

    private func sortReplies() {
        replies.sort { first, second in
            if first.createdAt == second.createdAt { return first.id.uuidString < second.id.uuidString }
            let lhs = SidelineBoard.timestamp(first.createdAt)
            let rhs = SidelineBoard.timestamp(second.createdAt)
            if let lhs, let rhs, lhs != rhs { return lhs < rhs }
            return first.createdAt < second.createdAt
        }
    }

    private func react(emoji: String, id: UUID, type: String, enabled: Bool) async {
        guard pending.insert(id).inserted else { return }
        defer { pending.remove(id) }
        do {
            let receipt = try await api.change(.init(kind: .reaction, id: id, thread: self.id,
                target: type, emoji: emoji, enabled: enabled))
            reactions[id.uuidString.lowercased()] = receipt.reactions
        } catch { message = "The reaction couldn’t be confirmed. Try again." }
    }

    private func remove(_ reply: ForumAPI.Reply) async {
        do {
            let result = try await api.change(.init(kind: .remove, id: reply.id, thread: id, expectedEditedAt: reply.editedAt))
            if let result = result.reply { accept(result) }
        } catch { message = "The reply couldn’t be deleted. Refresh before trying again." }
    }
}

struct AdminForumView: View {
    let api: ForumAPI
    @State private var data: ForumAPI.Admin?
    @State private var failure: (any Error)?
    @State private var removal: ForumAPI.Topic?
    @State private var warning = false
    @State private var active: UUID?
    @State private var revision = 0

    var body: some View {
        List {
            if let data {
                Section("Categories") { ForEach(data.categories) { ForumCategoryRow(category: $0) } }
                Section("Recent threads") {
                    ForEach(data.threads) { thread in
                        NavigationLink {
                            ForumThreadView(api: api, id: thread.id)
                        } label: { ForumTopicRow(topic: thread) }
                            .disabled(active == thread.id)
                            .swipeActions {
                                Button("Delete", role: .destructive) { removal = thread }
                                Button(thread.isLocked == true ? "Unlock" : "Lock") {
                                    Task { await moderate(thread, action: "lock") }
                                }
                            }
                            .contextMenu {
                                Button(thread.isPinned == true ? "Unpin" : "Pin", systemImage: "pin") {
                                    Task { await moderate(thread, action: "pin") }
                                }
                                Button(thread.isLocked == true ? "Unlock" : "Lock", systemImage: "lock") {
                                    Task { await moderate(thread, action: "lock") }
                                }
                                Button("Delete thread", systemImage: "trash", role: .destructive) { removal = thread }
                            }
                    }
                }
            } else {
                ResearchToolMessage(title: "Discussions couldn’t load", error: failure) { revision += 1 }
            }
        }
        .navigationTitle("Manage Discussions")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .confirmationDialog("Delete thread?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }),
            titleVisibility: .visible, presenting: removal) { item in
                Button("Delete thread", role: .destructive) {
                    Task {
                        do { try await api.remove(item.id); revision += 1 }
                        catch { warning = true }
                    }
                }
            } message: { _ in Text("The thread and its replies will be removed.") }
        .alert("The change couldn’t be confirmed", isPresented: $warning) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private func load() async {
        do {
            let results = try await api.admin()
            try Task.checkCancellation()
            data = results
            failure = nil
        } catch { if !Task.isCancelled { failure = error } }
    }

    private func moderate(_ thread: ForumAPI.Topic, action: String) async {
        guard active == nil else { return }
        active = thread.id
        defer { active = nil }
        do {
            try await api.moderate(thread, action: action)
            await load()
        } catch { warning = true }
    }
}
