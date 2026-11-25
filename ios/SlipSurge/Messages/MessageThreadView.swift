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
                        let pins = thread.messages.filter { thread.pins.contains($0.id) }
                        if pins.isEmpty { ContentUnavailableView("No pinned messages", systemImage: "pin") }
                        ForEach(pins) { note in
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
        let visible = term.isEmpty ? thread.messages : thread.messages.filter { $0.content.localizedStandardContains(term) }
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if visible.isEmpty {
                        ContentUnavailableView(term.isEmpty ? "No messages yet" : "No matching messages", systemImage: term.isEmpty ? "bubble.left" : "magnifyingglass")
                            .padding(.vertical, 32)
                    }
                    ForEach(Array(visible.enumerated()), id: \.element.id) { index, message in
                        if isNewDay(index, in: visible), let date = SidelineBoard.timestamp(message.createdAt) {
                            Text(date.formatted(.dateTime.weekday(.abbreviated).month().day()))
                                .font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.vertical, 4)
                        }
                        bubble(message, in: thread).id(message.id)
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

    private func bubble(_ message: MessageThread.Note, in thread: MessageThread) -> some View {
        let mine = message.senderId == api.userID
        let pinned = thread.pins.contains(message.id)
        let reactions = thread.reactions.filter { $0.messageId == message.id }
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
                            if value.utf16.count > 1_000 { draft = String(value.prefix(1_000)) }
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
                thread = value
                error = nil
                if atBottom { read(value.messages.last?.id) }
            }
        } catch {
            if !Task.isCancelled, version == fetchVersion {
                self.error = error
                if let response = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(response.code) { thread = nil }
            }
        }
    }

    private func perform(_ change: MessagesAPI.Change) async -> Bool {
        do { try await api.change(change, in: destination); return true }
        catch { actionFailed = true; return false }
    }

    private func mutate(_ change: MessagesAPI.Change) async {
        _ = await perform(change)
        await refresh()
    }

    private func react(_ symbol: String, on id: String, enabled: Bool) {
        Task { await mutate(.init(action: "react", message: id, emoji: symbol, enabled: enabled)) }
    }

    private func send() async {
        guard !composing, !uploading else { return }
        composing = true
        defer { composing = false }
        let submitted = draft
        let reply = responding?.id
        let image = editing == nil ? picture : nil
        if editing == nil, lastSendAttempt?.text != submitted || lastSendAttempt?.reply != reply || lastSendAttempt?.image != image {
            lastSendAttempt = .init(id: UUID(), text: submitted, reply: reply, image: image)
        }
        guard let note = editing?.id ?? lastSendAttempt?.id else { return }
        let change = MessagesAPI.Change(action: editing == nil ? "send" : "edit", message: note.uuidString.lowercased(),
            text: submitted, reply: reply?.uuidString.lowercased(), image: image)
        if await perform(change) {
            if draft == submitted { draft = "" }
            if picture == image { picture = nil }
            editing = nil
            responding = nil
            lastSendAttempt = nil
        }
        await refresh()
    }
}
