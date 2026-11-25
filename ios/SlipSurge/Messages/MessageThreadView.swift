import SwiftUI

struct MessageThreadView: View {
    let api: MessagesAPI
    let destination: MessageDestination
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    @State private var thread: MessageThread?
    @State private var error: (any Error)?
    @State private var draft = ""
    @State private var draftVersion = 0
    @State private var unsent: [UnsentDraft] = []
    @State private var lastSendAttempt: SendAttempt?
    @State private var picture: URL?
    @State private var uploading = false
    @State private var composing = false
    @State private var responding: MessageThread.Note?
    @State private var editing: MessageThread.Note?
    @State private var deleting: MessageThread.Note?
    @State private var leave = false
    @State private var actionFailed = false
    @State private var showPins = false
    @State private var showPeople = false
    @State private var query = ""
    @State private var searching = false
    @State private var revision = 0
    @State private var lastRead: UUID?
    @State private var atBottom = true
    @State private var fetchVersion = 0
    @State private var history: [HistoryPage] = []
    @State private var agedMessages: [MessageThread.Note] = []
    @State private var agedReactions: [MessageThread.Reaction] = []
    @State private var loadingHistory = false
    @State private var historyFailed = false
    @State private var historyEpoch = 0
    @State private var typingPresence = MessageTypingPresence()
    @State private var forwarding: MessageThread.Note?
    @State private var forwardAttempts: [UUID: UUID] = [:]
    @State private var forwardedThread: MessageDestination?

    private struct UnsentDraft: Identifiable { let id = UUID(); var text: String }

    private struct HistoryPage {
        let cursor: String
        var result: MessageThread
    }

    private struct SendAttempt {
        let id: UUID
        let text: String
        let reply: UUID?
        let image: URL?
    }

    var body: some View {
        Group {
            if let thread {
                chat(thread)
            } else if let status = error as? SlipSurgeHTTP.Status, status.code == 404 {
                ContentUnavailableView("Conversation unavailable", systemImage: "lock")
            } else {
                ResearchToolMessage(title: "Messages couldn’t load", error: error) { revision += 1 }
            }
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(thread?.title ?? "Messages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let thread {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Conversation actions", systemImage: "ellipsis.circle") {
                        Button(searching ? "Close search" : "Search messages", systemImage: "magnifyingglass") { searching.toggle(); query = "" }
                        if destination.kind == .direct {
                            Button("Pinned messages", systemImage: "pin") { showPins = true }
                        } else if destination.kind == .group {
                            Button("Participants", systemImage: "person.2") { showPeople = true }
                            Button(thread.muted ? "Unmute" : "Mute", systemImage: thread.muted ? "bell" : "bell.slash") {
                                Task { await mutate(.init(action: "mute", enabled: !thread.muted)) }
                            }
                            if !thread.owner { Button("Leave group", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { leave = true } }
                        }
                    }
                }
            }
        }
        .task(id: revision) {
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(8)) } catch { return }
                if phase == .active { await refresh() }
            }
        }
        .task(id: phase == .active && thread != nil && destination.kind != .group) {
            if phase == .active, thread != nil, destination.kind != .group {
                await typingPresence.run(account: api.account, userID: api.userID, destination: destination)
            } else { typingPresence.stop() }
        }
        .onChange(of: focused) { _, isFocused in if !isFocused { typingPresence.didType(hasText: false) } }
        .onDisappear { typingPresence.stop() }
        .navigationDestination(item: $forwardedThread) { room in
            MessageThreadView(api: api, destination: room)
        }
        .sheet(item: $forwarding, onDismiss: { forwardAttempts = [:] }) { message in
            MessageRecipientsView(api: api, forward: { recipient in
                let replay = forwardAttempts[recipient.id] ?? UUID()
                forwardAttempts[recipient.id] = replay
                try await api.change(.init(action: "forward", message: message.id.uuidString.lowercased(),
                    user: recipient.id.uuidString.lowercased(), forwardId: replay.uuidString.lowercased()), in: destination)
            }) { recipient in
                forwarding = nil
                if recipient == destination { Task { await refresh() } }
                else { forwardedThread = recipient }
            }
        }
        .alert("Message change couldn’t be confirmed", isPresented: $actionFailed) { Button("OK", role: .cancel) {} }
        .confirmationDialog("Delete this message?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), presenting: deleting) { note in
            Button("Delete", role: .destructive) { Task { await mutate(.init(action: "delete", message: note.id.uuidString.lowercased())) } }
        }
        .confirmationDialog("Leave this conversation?", isPresented: $leave) {
            Button("Leave group", role: .destructive) { Task { if await perform(.init(action: "leave")) { dismiss() } } }
        }
        .sheet(isPresented: $showPeople) {
            if let current = thread {
                MessageParticipantsView(api: api, destination: destination, initial: current) { await refresh() }
            }
        }
        .sheet(isPresented: $showPins) {
            NavigationStack {
                List {
                    if let thread {
                        let pinnedIDs = Set(thread.pins + history.flatMap { $0.result.pins })
                        let pins = (thread.messages + history.flatMap { $0.result.messages }).filter { pinnedIDs.contains($0.id) }
                        let uniquePins = Dictionary(pins.map { ($0.id, $0) }, uniquingKeysWith: { recent, _ in recent })
                        if pins.isEmpty { ContentUnavailableView("No pinned messages", systemImage: "pin") }
                        ForEach(uniquePins.values.sorted { $0.createdAt > $1.createdAt }) { note in
                            Text(verbatim: note.content.isEmpty ? "Attachment" : note.content)
                                .swipeActions(allowsFullSwipe: false) {
                                    Button("Unpin", systemImage: "pin.slash", role: .destructive) {
                                        Task { await mutate(.init(action: "pin", message: note.id.uuidString.lowercased(), enabled: false)) }
                                    }
                                }
                        }
                    }
                }
                .navigationTitle("Pinned messages")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { showPins = false }.labelStyle(.iconOnly) }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func chat(_ thread: MessageThread) -> some View {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let recentIDs = Set(thread.messages.map(\.id))
        let archived = history.reversed().flatMap { $0.result.messages } + agedMessages
        var seen = recentIDs
        let notes = archived.filter { seen.insert($0.id).inserted } + thread.messages
        let visible = term.isEmpty ? notes : notes.filter { $0.content.localizedStandardContains(term) }
        let older = history.isEmpty ? thread.nextCursor : history.last?.result.nextCursor
        let reactions = archivedReactions(excluding: recentIDs) + thread.reactions
        let byMessage = Dictionary(grouping: reactions, by: \.messageId)
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if let older {
                        Button(historyFailed ? "Retry older messages" : "Load older messages", systemImage: "clock.arrow.circlepath") {
                            let anchor = visible.first?.id
                            Task {
                                if await loadHistory(before: older), let anchor { proxy.scrollTo(anchor, anchor: .top) }
                            }
                        }
                        .buttonStyle(.bordered)
                        .disabled(loadingHistory)
                        .padding(.vertical, 6)
                        if loadingHistory { ProgressView("Loading older messages").font(.caption) }
                    }
                    if visible.isEmpty {
                        ContentUnavailableView(term.isEmpty ? "No messages yet" : "No matching messages", systemImage: term.isEmpty ? "bubble.left" : "magnifyingglass")
                            .padding(.vertical, 32)
                    }
                    ForEach(Array(visible.enumerated()), id: \.element.id) { index, message in
                        if isNewDay(index, in: visible), let date = SidelineBoard.timestamp(message.createdAt) {
                            Text(date.formatted(.dateTime.weekday(.abbreviated).month().day()))
                                .font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.vertical, 4)
                        }
                        bubble(message, in: thread, reactions: byMessage[message.id] ?? []).id(message.id)
                    }
                    if term.isEmpty, destination.kind == .direct, let latest = thread.messages.last,
                       latest.senderId == api.userID, latest.isDeleted != true,
                       let read = thread.partnerLastReadAt.flatMap(SidelineBoard.timestamp), let sent = SidelineBoard.timestamp(latest.createdAt), read >= sent {
                        Label("Seen", systemImage: "checkmark")
                            .font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    Color.clear.frame(height: 2).id("latest-message")
                        .onAppear { atBottom = true; read(thread.messages.last?.id) }
                        .onDisappear { atBottom = false }
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: visible.last?.id, initial: true) { _, last in
                if term.isEmpty, atBottom || visible.last?.senderId == api.userID {
                    withAnimation(reduceMotion ? nil : .snappy(duration: 0.23)) { proxy.scrollTo("latest-message", anchor: .bottom) }
                    read(last)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if searching {
                    TextField("Search messages", text: $query)
                        .textFieldStyle(.roundedBorder).padding(10).background(.bar)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer(thread) }
        }
    }

    private func isNewDay(_ index: Int, in notes: [MessageThread.Note]) -> Bool {
        guard index > 0, let previous = SidelineBoard.timestamp(notes[index - 1].createdAt),
              let current = SidelineBoard.timestamp(notes[index].createdAt) else { return true }
        return !Calendar.current.isDate(previous, inSameDayAs: current)
    }

    private func bubble(_ message: MessageThread.Note, in thread: MessageThread, reactions: [MessageThread.Reaction]) -> some View {
        let mine = message.senderId == api.userID
        let pinned = thread.pins.contains(message.id) || history.contains { $0.result.pins.contains(message.id) }
        let counts = Dictionary(grouping: reactions, by: \.emoji)
        let messageID = message.id.uuidString.lowercased()
        return HStack(alignment: .bottom, spacing: 7) {
            if mine { Spacer(minLength: 38) }
            if !mine, destination.kind == .group {
                MessageAvatar(person: thread.members.first(where: { $0.id == message.senderId })?.user, size: 26)
            } else if !mine, destination.kind == .channel {
                ResearchArtwork(urls: message.sender?.avatarUrl.map { [$0] } ?? [], fallback: "person.crop.circle.fill")
                    .frame(width: 26, height: 26).clipShape(.circle)
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
                if !mine, destination.kind != .direct, let sender = message.sender {
                    Text(sender.displayName ?? sender.username).font(.caption2.weight(.medium)).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 6) {
                    if message.isDeleted == true {
                        Text("Message deleted").font(.subheadline).italic().foregroundStyle(.secondary)
                    } else {
                        if message.forwardedFromId != nil {
                            Label("Forwarded", systemImage: "arrowshape.turn.up.right").font(.caption2).foregroundStyle(.secondary)
                        }
                        if let reply = message.replyTo { replyPreview(reply.content, author: reply.sender?.displayName ?? reply.sender?.username) }
                        if !message.content.isEmpty { Text(verbatim: message.content).font(.body) }
                        ForEach((message.mediaUrls ?? []).filter(FeedPostCard.allowedMedia), id: \.self) { url in
                            AsyncImage(url: url) { artwork in artwork.resizable().scaledToFit() } placeholder: { ProgressView() }
                                .frame(maxWidth: 240, maxHeight: 200)
                                .clipShape(.rect(cornerRadius: 10))
                        }
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(mine ? Brand.accent(for: scheme).opacity(scheme == .dark ? 0.22 : 0.17) : Brand.surface(for: scheme), in: .rect(cornerRadius: 17))
                .contextMenu {
                    if message.isDeleted != true {
                        if thread.canSend {
                            Button("Reply", systemImage: "arrowshape.turn.up.left") { editing = nil; responding = message; focused = true }
                        }
                        if destination.kind == .direct {
                            Button(pinned ? "Unpin" : "Pin", systemImage: pinned ? "pin.slash" : "pin") {
                                Task { await mutate(.init(action: "pin", message: messageID, enabled: !pinned)) }
                            }
                            Button("Forward", systemImage: "arrowshape.turn.up.right") { forwarding = message }
                        }
                        Menu("React", systemImage: "face.smiling") {
                            ForEach(["❤️", "🔥", "⚡", "👏", "😂", "👀"], id: \.self) { symbol in
                                Button(symbol) { react(symbol, on: messageID, enabled: !reactions.contains { $0.emoji == symbol && $0.mine }) }
                            }
                        }
                        if mine && (destination.kind != .channel || thread.canSend) {
                            Button("Edit", systemImage: "pencil") { responding = nil; editing = message; draft = message.content; focused = true }
                        }
                        if mine || thread.canModerate == true {
                            Button("Delete", systemImage: "trash", role: .destructive) { deleting = message }
                        }
                    }
                }
                if !counts.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(counts.keys.sorted().prefix(8), id: \.self) { symbol in
                            let items = counts[symbol] ?? []
                            let selected = items.contains(where: \.mine)
                            Button("\(symbol) \(items.count)") { react(symbol, on: messageID, enabled: !selected) }
                                .font(.caption2.weight(.semibold)).buttonStyle(.bordered).buttonBorderShape(.capsule)
                                .tint(selected ? Brand.accent(for: scheme) : .secondary)
                                .accessibilityAddTraits(selected ? .isSelected : [])
                        }
                    }
                }
                HStack(spacing: 4) {
                    if pinned { Image(systemName: "pin.fill").accessibilityLabel("Pinned") }
                    if let date = SidelineBoard.timestamp(message.createdAt) { Text(date.formatted(.dateTime.hour().minute())) }
                    if message.editedAt != nil, message.isDeleted != true { Text("Edited") }
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
            if !mine { Spacer(minLength: 38) }
        }
        .frame(maxWidth: .infinity)
    }

    private func replyPreview(_ text: String, author: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let author { Text(verbatim: author).font(.caption2.weight(.semibold)) }
            Text(verbatim: text.isEmpty ? "Attachment" : text).font(.caption).lineLimit(1)
        }
        .padding(7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: .rect(cornerRadius: 7))
    }

    private func composer(_ thread: MessageThread) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            if typingPresence.count > 0 {
                HStack(spacing: 5) {
                    Image(systemName: "ellipsis.bubble.fill")
                        .symbolEffect(.variableColor, options: .repeating, isActive: !reduceMotion)
                        .accessibilityHidden(true)
                    if let partner = thread.partner { Text("\(partner.name) is typing") }
                    else { Text(typingPresence.count == 1 ? "Someone is typing" : "\(typingPresence.count) members are typing") }
                }
                .font(.caption).foregroundStyle(.secondary)
                .accessibilityElement(children: .combine)
            }
            if let context = editing ?? responding {
                HStack {
                    replyPreview(context.content, author: editing == nil ? "Replying" : "Editing")
                    Button("Cancel", systemImage: "xmark.circle.fill") {
                        if editing != nil { draft = "" }
                        editing = nil; responding = nil
                    }
                    .buttonStyle(.borderless).labelStyle(.iconOnly)
                }
            }
            if let picture, editing == nil {
                HStack {
                    ResearchArtwork(urls: [picture], fallback: "photo").frame(width: 82, height: 56).clipShape(.rect(cornerRadius: 7))
                    Button("Remove photo", systemImage: "xmark.circle.fill") { self.picture = nil }.labelStyle(.iconOnly)
                    Spacer()
                }
            }
            if !unsent.isEmpty, editing == nil {
                Menu("Unsent drafts (\(unsent.count))", systemImage: "doc.badge.clock") {
                    ForEach(unsent) { item in Button(String(item.text.prefix(70))) { insertDraft(item) } }
                }
                .font(.footnote)
                .disabled(draft.utf16.count >= 999)
            }
            if thread.canSend || editing != nil {
                HStack(alignment: .bottom, spacing: 9) {
                    if editing == nil {
                        NativePhotoPicker(title: "Attach a photo", upload: { photo in
                            try await NativeMediaUpload.upload(photo, kind: .messages, account: api.account, userID: api.userID)
                        }, url: $picture, uploading: $uploading)
                        .labelStyle(.iconOnly).disabled(composing)
                        .padding(.vertical, 7)
                    }
                    TextField("Message", text: $draft, axis: .vertical)
                        .lineLimit(1...5).padding(.horizontal, 12).padding(.vertical, 9)
                        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 17))
                        .focused($focused)
                        .onChange(of: draft) { _, value in
                            draftVersion += 1
                            if value.utf16.count > 1_000 { draft = String(value.prefix(1_000)) }
                            if editing == nil, thread.canSend, focused {
                                typingPresence.didType(hasText: !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                        }
                    sendControl
                }
            } else {
                Label(destination.kind == .channel ? "Read-only channel" : "This member has direct messages turned off", systemImage: "lock")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.bar)
    }

    private var sendControl: some View {
        let button = Button(editing == nil ? "Send" : "Save", systemImage: editing == nil ? "arrow.up" : "checkmark") {
            Task { await send() }
        }
        .labelStyle(.iconOnly)
        .tint(Brand.accent(for: scheme))
        .disabled(composing || uploading || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (picture == nil || editing != nil)) || draft.utf16.count > 1_000)
        return Group {
            if #available(iOS 26, *) { button.buttonStyle(.glassProminent) }
            else { button.buttonStyle(.borderedProminent).buttonBorderShape(.circle) }
        }
    }

    private func read(_ id: UUID?) {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, phase == .active, let id, lastRead != id else { return }
        lastRead = id
        Task {
            do { try await api.change(.init(action: "read", message: id.uuidString.lowercased()), in: destination) }
            catch { if lastRead == id { lastRead = nil } }
        }
    }

    private func refresh() async {
        fetchVersion += 1
        let version = fetchVersion
        do {
            let value = try await api.thread(destination)
            if !Task.isCancelled, version == fetchVersion {
                preserveVisibleHistory(next: value)
                thread = value
                error = nil
                if atBottom { read(value.messages.last?.id) }
            }
        } catch {
            if !Task.isCancelled, version == fetchVersion {
                self.error = error
                if accessLost(error) {
                    thread = nil
                    clearHistory()
                }
            }
        }
    }

    private func perform(_ change: MessagesAPI.Change) async -> Bool {
        do { try await api.change(change, in: destination); return true }
        catch { actionFailed = true; return false }
    }

    private func mutate(_ change: MessagesAPI.Change) async {
        if await perform(change), let id = change.message.flatMap(UUID.init(uuidString:)) {
            await refreshOlderMessage(id, deleted: change.action == "delete")
        }
        await refresh()
    }

    private func react(_ symbol: String, on id: String, enabled: Bool) {
        Task { await mutate(.init(action: "react", message: id, emoji: symbol, enabled: enabled)) }
    }

    private func send() async {
        guard !composing, !uploading else { return }
        composing = true
        typingPresence.didType(hasText: false)
        defer { composing = false }
        let submitted = draft
        let submittedVersion = draftVersion
        let reply = responding?.id
        let image = editing == nil ? picture : nil
        if editing == nil, lastSendAttempt?.text != submitted || lastSendAttempt?.reply != reply || lastSendAttempt?.image != image {
            lastSendAttempt = .init(id: UUID(), text: submitted, reply: reply, image: image)
        }
        guard let note = editing?.id ?? lastSendAttempt?.id else { return }
        let change = MessagesAPI.Change(action: editing == nil ? "send" : "edit", message: note.uuidString.lowercased(),
            text: submitted, reply: reply?.uuidString.lowercased(), image: image)
        if await perform(change) {
            if change.action == "edit" { await refreshOlderMessage(note, deleted: false) }
            if draftVersion == submittedVersion { draft = "" }
            if picture == image { picture = nil }
            editing = nil
            responding = nil
            lastSendAttempt = nil
        } else if editing == nil, draftVersion != submittedVersion, !submitted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            unsent.append(.init(text: submitted))
        }
        await refresh()
    }

    private func insertDraft(_ item: UnsentDraft) {
        let separator = draft.isEmpty ? "" : "\n"
        let available = 1_000 - draft.utf16.count - separator.utf16.count
        guard available > 0, let index = unsent.firstIndex(where: { $0.id == item.id }) else { return }
        var insertion = String.UnicodeScalarView()
        var count = 0
        for scalar in item.text.unicodeScalars {
            let width = scalar.utf16.count
            if count + width > available { break }
            insertion.append(scalar)
            count += width
        }
        guard !insertion.isEmpty else { return }
        draft += separator + String(insertion)
        let remaining = item.text.unicodeScalars.dropFirst(insertion.count)
        if remaining.isEmpty { unsent.remove(at: index) }
        else { unsent[index].text = String(remaining) }
    }

    private func archivedReactions(excluding recentIDs: Set<UUID>) -> [MessageThread.Reaction] {
        let byPage = history.map { Dictionary(grouping: $0.result.reactions, by: \.messageId) } +
            [Dictionary(grouping: agedReactions, by: \.messageId)]
        var seen = recentIDs
        return byPage.flatMap { page in
            page.filter { seen.insert($0.key).inserted }.values.flatMap { $0 }
        }
    }

    private func loadHistory(before cursor: String) async -> Bool {
        guard !loadingHistory else { return false }
        loadingHistory = true
        historyFailed = false
        let epoch = historyEpoch
        defer { loadingHistory = false }
        do {
            let page = try await api.thread(destination, before: cursor)
            guard !Task.isCancelled, epoch == historyEpoch, thread != nil else { return false }
            history.append(.init(cursor: cursor, result: page))
            return true
        } catch {
            if !Task.isCancelled, epoch == historyEpoch {
                if accessLost(error) {
                    thread = nil
                    self.error = error
                    fetchVersion += 1
                    clearHistory()
                } else {
                    historyFailed = true
                }
            }
            return false
        }
    }

    private func preserveVisibleHistory(next: MessageThread) {
        guard loadingHistory || !history.isEmpty,
              let previous = thread, let first = next.messages.first else { return }
        if let overlap = previous.messages.firstIndex(where: { $0.id == first.id }), overlap > 0 {
            let aged = previous.messages.prefix(upTo: overlap)
            let ids = Set(aged.map(\.id))
            agedMessages.append(contentsOf: aged)
            agedReactions.append(contentsOf: previous.reactions.filter { ids.contains($0.messageId) })
        } else if !previous.messages.isEmpty, Set(previous.messages.map(\.id)).isDisjoint(with: next.messages.map(\.id)) {
            clearHistory()
        }
    }

    private func refreshOlderMessage(_ id: UUID, deleted: Bool) async {
        let page = history.first { $0.result.messages.contains { $0.id == id } }
        let aged = agedMessages.contains { $0.id == id }
        guard page != nil || aged else { return }
        if deleted && aged && destination.kind == .channel {
            agedMessages.removeAll { $0.id == id }
            agedReactions.removeAll { $0.messageId == id }
        }
        let edge = thread?.messages.first.map { "\($0.createdAt)|\($0.id.uuidString.lowercased())" }
        guard let cursor = page?.cursor ?? edge else { return }
        let epoch = historyEpoch
        do {
            let updated = try await api.thread(destination, before: cursor)
            guard !Task.isCancelled, epoch == historyEpoch else { return }
            if let position = history.firstIndex(where: { $0.cursor == cursor }) {
                history[position].result = updated
            } else if let note = updated.messages.first(where: { $0.id == id }),
                      let position = agedMessages.firstIndex(where: { $0.id == id }) {
                agedMessages[position] = note
                agedReactions.removeAll { $0.messageId == id }
                agedReactions.append(contentsOf: updated.reactions.filter { $0.messageId == id })
            }
        } catch {
            guard !Task.isCancelled, epoch == historyEpoch else { return }
            if accessLost(error) {
                thread = nil
                self.error = error
                fetchVersion += 1
                clearHistory()
            } else {
                historyFailed = true
            }
        }
    }

    private func clearHistory() {
        historyEpoch += 1
        history = []
        agedMessages = []
        agedReactions = []
        historyFailed = false
    }

    private func accessLost(_ error: any Error) -> Bool {
        guard let response = error as? SlipSurgeHTTP.Status else { return false }
        return [401, 403, 404].contains(response.code)
    }
}
