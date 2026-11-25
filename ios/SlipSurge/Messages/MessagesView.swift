import SwiftUI

struct MessagesView: View {
    let api: MessagesAPI
    var startsComposing = false
    var inInbox = false
    var initialInbox: (() -> MessageInbox?)? = nil
    var onUnreadChange: (Int) -> Void = { _ in }
    @Environment(\.colorScheme) private var scheme
    @State private var inbox: MessageInbox?
    @State private var error: (any Error)?
    @State private var query = ""
    @State private var showingRequests = false
    @State private var revision = 0
    @State private var composing = false
    @State private var selection: MessageDestination?
    @State private var pending = Set<UUID>()
    @State private var actionError = false

    private enum Conversation: Identifiable {
        case direct(MessageInbox.Direct)
        case group(MessageInbox.Group)

        var id: MessageDestination {
            switch self {
            case .direct(let item): .init(kind: .direct, id: item.id)
            case .group(let item): .init(kind: .group, id: item.id)
            }
        }

        var date: String {
            switch self {
            case .direct(let item): item.createdAt
            case .group(let item): item.updatedAt
            }
        }
    }

    var body: some View {
        List {
            if let inbox {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { requestsEntry(inbox) }
                conversations(inbox)
            } else {
                ResearchToolMessage(title: "Messages couldn’t load", error: error) { revision += 1 }
                    .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .listStyle(.plain)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search conversations")
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(inInbox ? "Inbox" : "Messages")
        .scrollContentBackground(.hidden)
        .background(Brand.surface(for: scheme))
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
        .navigationDestination(isPresented: $showingRequests) { requestsList }
        .onChange(of: selection) { _, destination in
            if destination == nil { revision += 1 }
        }
        .task(id: revision) {
            if inbox == nil { inbox = initialInbox?() }
            await load()
        }
        .onChange(of: startsComposing, initial: true) { if startsComposing { composing = true } }
        .refreshable { await load() }
        .alert("Request couldn’t be updated", isPresented: $actionError) { Button("OK", role: .cancel) {} }
    }

    private func requestsEntry(_ inbox: MessageInbox) -> some View {
        let count = inbox.conversations.filter(\.isRequest).count
        return Button {
            showingRequests = true
        } label: {
            HStack(spacing: 10) {
                Label("Message requests", systemImage: "tray")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if count > 0 { Text(count.formatted()).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary).accessibilityHidden(true)
            }
            .frame(minHeight: 44).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .listRowBackground(Brand.surface(for: scheme))
    }

    private var requestsList: some View {
        let requests = inbox?.conversations.filter(\.isRequest) ?? []
        return List {
            if requests.isEmpty {
                ContentUnavailableView("No message requests", systemImage: "tray")
                    .listRowSeparator(.hidden)
            }
            ForEach(requests) { item in
                NavigationLink {
                    MessageThreadView(api: api, destination: .init(kind: .direct, id: item.id))
                } label: {
                    directRow(item)
                }
                .swipeActions(allowsFullSwipe: false) {
                    Button("Decline", role: .destructive) { Task { await respond(to: item, status: "declined") } }
                        .disabled(pending.contains(item.id))
                    Button("Accept") { Task { await respond(to: item, status: "accepted") } }
                        .tint(Brand.accent(for: scheme)).disabled(pending.contains(item.id))
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Brand.surface(for: scheme))
        .navigationTitle("Requests")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func conversations(_ inbox: MessageInbox) -> some View {
        let direct = inbox.conversations.filter { !$0.isRequest && matches($0.partner.name, $0.partner.username, $0.content) }
        let groups = inbox.groupConversations.filter { matches($0.name, $0.lastMessage) }
        let recent = (direct.map(Conversation.direct) + groups.map(Conversation.group))
            .map { ($0, SidelineBoard.timestamp($0.date) ?? .distantPast) }
            .sorted { $0.1 > $1.1 }
            .map(\.0)
        if recent.isEmpty {
            ContentUnavailableView(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "No conversations" : "No matching conversations",
                systemImage: "bubble.left.and.bubble.right")
                .listRowBackground(Brand.surface(for: scheme))
                .listRowSeparator(.hidden)
        }
        ForEach(recent) { conversation in
            Button { selection = conversation.id } label: {
                switch conversation {
                case .direct(let item): directRow(item)
                case .group(let item):
                    row(name: item.name, text: item.lastMessage, date: item.updatedAt, unread: item.unreadCount,
                        people: Array(item.members.filter { $0.id != api.userID }.prefix(2)))
                }
            }
            .buttonStyle(.plain)
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func directRow(_ item: MessageInbox.Direct) -> some View {
        row(name: item.partner.name, text: item.lastIsMine && !item.content.isEmpty ? "You: \(item.content)" : item.content,
            date: item.createdAt, unread: item.unreadCount, people: [item.partner])
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
                        Text(date, format: Calendar.current.isDateInToday(date) ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            .accessibilityLabel(date.formatted(date: .abbreviated, time: .shortened))
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
            onUnreadChange(value.unreadCount)
        } catch {
            if !Task.isCancelled {
                if let response = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(response.code) {
                    inbox = nil
                    onUnreadChange(0)
                }
                self.error = error
            }
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
