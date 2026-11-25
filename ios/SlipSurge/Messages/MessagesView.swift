import SwiftUI

struct MessagesView: View {
    let api: MessagesAPI
    var startsComposing = false
    @Environment(\.colorScheme) private var scheme
    @State private var inbox: MessageInbox?
    @State private var error: (any Error)?
    @State private var query = ""
    @State private var section = Section.inbox
    @State private var revision = 0
    @State private var composing = false
    @State private var selection: MessageDestination?
    @State private var pending = Set<UUID>()
    @State private var actionError = false

    private enum Section: String, CaseIterable { case inbox = "Inbox", requests = "Requests" }

    var body: some View {
        List {
            if let inbox {
                Picker("Conversations", selection: $section) {
                    ForEach(Section.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Brand.surface(for: scheme))
                rows(inbox)
            } else {
                ResearchToolMessage(title: "Messages couldn’t load", error: error) { revision += 1 }
                    .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .searchable(text: $query, prompt: "Search conversations")
        .navigationTitle("Messages")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button("New message", systemImage: "square.and.pencil") { composing = true } }
        }
        .sheet(isPresented: $composing) {
            MessageRecipientsView(api: api) { destination in
                composing = false
                selection = destination
            }
        }
        .navigationDestination(item: $selection) { destination in
            MessageThreadView(api: api, destination: destination)
        }
        .onChange(of: selection) { _, destination in
            if destination == nil { revision += 1 }
        }
        .task(id: revision) { await load() }
        .onChange(of: startsComposing, initial: true) { if startsComposing { composing = true } }
        .refreshable { await load() }
        .alert("Request couldn’t be updated", isPresented: $actionError) { Button("OK", role: .cancel) {} }
    }

    @ViewBuilder
    private func rows(_ inbox: MessageInbox) -> some View {
        let unreadRequests = inbox.conversations.filter(\.isRequest).count
        let direct = inbox.conversations.filter { row in
            row.isRequest == (section == .requests) && matches(row.partner.name, row.partner.username, row.content)
        }
        let groups = section == .inbox ? inbox.groupConversations.filter { matches($0.name, $0.lastMessage) } : []
        if direct.isEmpty && groups.isEmpty {
            ContentUnavailableView(section == .requests ? "No message requests" : "No conversations", systemImage: "bubble.left.and.bubble.right")
                .listRowBackground(Brand.surface(for: scheme))
        }
        if !groups.isEmpty {
            SwiftUI.Section("Group conversations") {
                ForEach(groups) { group in
                    Button { selection = .init(kind: .group, id: group.id) } label: {
                        row(name: group.name, text: group.lastMessage, date: group.updatedAt, unread: group.unreadCount,
                            people: Array(group.members.filter { $0.id != api.userID }.prefix(2)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
        if !direct.isEmpty {
            SwiftUI.Section(section == .requests ? "Requests (\(unreadRequests))" : "Direct messages") {
                ForEach(direct) { item in
                    Button { selection = .init(kind: .direct, id: item.id) } label: {
                        row(name: item.partner.name, text: item.lastIsMine && !item.content.isEmpty ? "You: \(item.content)" : item.content,
                            date: item.createdAt, unread: item.unreadCount, people: [item.partner])
                    }
                    .buttonStyle(.plain)
                    .swipeActions(allowsFullSwipe: false) {
                        if item.isRequest {
                            Button("Decline", role: .destructive) { Task { await respond(to: item, status: "declined") } }
                                .disabled(pending.contains(item.id))
                            Button("Accept") { Task { await respond(to: item, status: "accepted") } }
                                .tint(Brand.accent(for: scheme)).disabled(pending.contains(item.id))
                        }
                    }
                }
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func row(name: String, text: String, date: String, unread: Int, people: [MessagePerson]) -> some View {
        HStack(spacing: 11) {
            if people.count > 1 {
                ZStack(alignment: .bottomTrailing) {
                    MessageAvatar(person: people.first, size: 33).offset(x: -8, y: -8)
                    MessageAvatar(person: people.last, size: 30)
                }
                .frame(width: 43, height: 43)
            } else {
                MessageAvatar(person: people.first)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: name).fontWeight(unread > 0 ? .bold : .semibold)
                    Spacer(minLength: 6)
                    if let date = SidelineBoard.timestamp(date) {
                        Text(date, style: .relative).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                HStack {
                    Text(verbatim: text.isEmpty ? "Conversation started" : text)
                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    if unread > 0 {
                        Text(unread.formatted()).font(.caption2.bold()).monospacedDigit()
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Brand.accent(for: scheme).opacity(0.2), in: .capsule)
                            .accessibilityLabel("\(unread) unread")
                    }
                }
            }
        }
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func matches(_ values: String...) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return needle.isEmpty || values.contains { $0.localizedStandardContains(needle) }
    }

    private func load() async {
        do {
            let value = try await api.inbox()
            try Task.checkCancellation()
            inbox = value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func respond(to item: MessageInbox.Direct, status: String) async {
        guard pending.insert(item.id).inserted else { return }
        defer { pending.remove(item.id) }
        do { try await api.change(.init(action: "request", status: status), in: .init(kind: .direct, id: item.id)) }
        catch { actionError = true }
        await load()
    }
}

struct MessageAvatar: View {
    let person: MessagePerson?
    var size: CGFloat = 42
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if let person {
            NativeMemberAvatar(url: person.avatarUrl, name: person.name, size: size,
                style: person.avatarRingStyle, color: person.avatarRingColor)
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: size * 0.65))
                .foregroundStyle(Brand.accent(for: scheme))
                .frame(width: size, height: size)
                .background(Brand.background(for: scheme), in: .circle)
                .accessibilityHidden(true)
        }
    }
}
