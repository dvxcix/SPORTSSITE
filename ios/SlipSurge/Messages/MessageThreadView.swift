import PhotosUI
import SwiftUI

struct MessageThreadDraft {
    struct Unsent: Identifiable { let id = UUID(); var text: String }
    struct SendAttempt {
        let id: UUID
        let text: String
        let reply: UUID?
        let image: URL?
    }

    var text = ""
    var revision = 0
    var picture: URL?
    var responding: MessageThread.Note?
    var editing: MessageThread.Note?
    var unsent: [Unsent] = []
    var lastSendAttempt: SendAttempt?
    var composing = false
    var uploading = false
}

struct MessageThreadView: View {
    private enum Input: Hashable { case message, search }
    private enum ComposerPicker: Identifiable {
        case gif, emoji
        var id: Self { self }
    }
    let api: MessagesAPI
    let destination: MessageDestination
    var roomDraft: Binding<MessageThreadDraft>? = nil
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Input?
    @State private var thread: MessageThread?
    @State private var error: (any Error)?
    @State private var localDraft = MessageThreadDraft()
    @State private var showingPhotos = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var composerPicker: ComposerPicker?
    @State private var memberPreview: MessagePerson?
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
    @State private var selectingReaction: ReactionTarget?
    @State private var reactionBurst: MessageReactionBurst?
    @State private var reacting = Set<String>()
    @State private var reactionFeedback = 0

    private struct MessageReactionBurst {
        let message: UUID
        let animation: ReactionBurst
    }
    @State private var forwardAttempts: [UUID: UUID] = [:]
    @State private var forwardedThread: MessageDestination?

    private struct ReactionTarget: Identifiable { let id: UUID; let mine: Set<String> }

    private struct HistoryPage {
        let cursor: String
        var result: MessageThread
    }

    private var draftBinding: Binding<MessageThreadDraft> { roomDraft ?? $localDraft }
    private var draftData: MessageThreadDraft {
        get { draftBinding.wrappedValue }
        nonmutating set { draftBinding.wrappedValue = newValue }
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
        .sensoryFeedback(.selection, trigger: reactionFeedback)
        .navigationTitle(thread?.title ?? "Messages")
        .navigationBarTitleDisplayMode(.inline)
        .socialDetail()
        .presentationContentInteraction(.scrolls)
        .interactiveDismissDisabled(focused != nil || !draftData.text.isEmpty || draftData.picture != nil || draftData.uploading)
        .photosPicker(isPresented: $showingPhotos, selection: $selectedPhoto, matching: .images, preferredItemEncoding: .current)
        .modifier(NativePhotoSelection(photo: $selectedPhoto, url: draftBinding.picture, uploading: draftBinding.uploading) { photo in
            try await NativeMediaUpload.upload(photo, kind: .messages, account: api.account, userID: api.userID)
        })
        .sheet(item: $composerPicker) { picker in
            switch picker {
            case .gif:
                NativeGIFPickerSheet(account: api.account, userID: api.userID, uploadKind: .messages) { url in
                    draftData.picture = url
                    composerPicker = nil
                }
            case .emoji:
                NavigationStack {
                    NativeEmojiPicker { value in
                        let next = draftData.text.isEmpty ? value : draftData.text + " " + value
                        if next.utf16.count <= 1_000 { draftData.text = next }
                    }
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(item: $memberPreview) { member in
            ChatMemberPreview(viewer: .init(account: api.account, userID: api.userID), member: member)
        }
        .sheet(item: $selectingReaction) { target in
            NavigationStack {
                NativeEmojiPicker(title: "React") { symbol in
                    react(symbol, on: target.id.uuidString.lowercased(), enabled: !target.mine.contains(symbol))
                }
            }
            .presentationDetents([.medium, .large])
        }
        .toolbar {
            if let thread {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Conversation actions", systemImage: "ellipsis.circle") {
                        Button(searching ? "Close search" : "Search messages", systemImage: searching ? "xmark" : "magnifyingglass") {
                            if searching { closeSearch() }
                            else { searching = true }
                        }
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
        .onChange(of: focused) { previous, current in
            if previous == .message, current != .message { typingPresence.didType(hasText: false) }
        }
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
            .scrollBounceBehavior(.always, axes: .vertical)
            .onChange(of: visible.last?.id, initial: true) { previous, last in
                if term.isEmpty, atBottom || visible.last?.senderId == api.userID {
                    withAnimation(previous == nil || reduceMotion ? nil : .snappy(duration: 0.23)) {
                        proxy.scrollTo("latest-message", anchor: .bottom)
                    }
                    read(last)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if searching {
                    HStack(spacing: 10) {
                        TextField("Search messages", text: $query)
                            .textFieldStyle(.roundedBorder)
                            .focused($focused, equals: .search)
                            .submitLabel(.search)
                            .onSubmit { focused = nil }
                            .onAppear { focused = .search }
                        Button("Cancel", action: closeSearch)
                            .frame(minHeight: 44)
                            .accessibilityLabel("Cancel message search")
                    }
                    .padding(.horizontal, 12)
                    .background(.bar)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer(thread) }
        }
    }

    private func closeSearch() {
        if focused == .search { focused = nil }
        searching = false
        query = ""
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
        let author = mine ? nil : author(of: message, in: thread)
        return HStack(alignment: .bottom, spacing: 7) {
            if mine { Spacer(minLength: 38) }
            if let author {
                Button { memberPreview = author } label: {
                    MessageAvatar(person: author, size: 28)
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Show profile for \(author.name)")
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
                        if !message.content.isEmpty { NativeSocialBody(content: message.content, maxGIFWidth: 230).font(.body) }
                        ForEach((message.mediaUrls ?? []).filter(FeedPostCard.allowedMedia), id: \.self) { url in
                            if NativeGIFSource.canPlay(url) {
                                NativeGIFPlayback(url: url, maxHeight: 200, maxWidth: 240).clipShape(.rect(cornerRadius: 10))
                            } else {
                                PostArtwork(url: url, label: "Message image", maxHeight: 200, pointSize: 240)
                                    .frame(maxWidth: 240, maxHeight: 200)
                                    .clipShape(.rect(cornerRadius: 10))
                            }
                        }
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(mine ? Brand.accent(for: scheme).opacity(scheme == .dark ? 0.22 : 0.17) : Brand.surface(for: scheme), in: .rect(cornerRadius: 17))
                .contextMenu {
                    if message.isDeleted != true {
                        if thread.canSend {
                            Button("Reply", systemImage: "arrowshape.turn.up.left") { draftData.editing = nil; draftData.responding = message; focused = .message }
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
                            Button("More reactions", systemImage: "face.smiling") {
                                selectingReaction = .init(id: message.id, mine: Set(reactions.filter(\.mine).map(\.emoji)))
                            }
                        }
                        if mine && (destination.kind != .channel || thread.canSend) {
                            Button("Edit", systemImage: "pencil") { draftData.responding = nil; draftData.editing = message; draftData.text = message.content; focused = .message }
                        }
                        if mine || thread.canModerate == true {
                            Button("Delete", systemImage: "trash", role: .destructive) { deleting = message }
                        }
                    }
                }
                if !counts.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 6) {
                            ForEach(counts.keys.sorted().prefix(8), id: \.self) { symbol in
                                let items = counts[symbol] ?? []
                                let selected = items.contains(where: \.mine)
                                Button { react(symbol, on: messageID, enabled: !selected) } label: {
                                    HStack(spacing: 3) {
                                        NativeReactionArtwork(symbol: symbol, size: 15)
                                        Text(items.count.formatted()).monospacedDigit()
                                            .contentTransition(reduceMotion ? .identity : .numericText())
                                    }
                                    .frame(minWidth: 26, minHeight: 32)
                                }
                                .font(.caption2.weight(.semibold)).buttonStyle(.bordered).buttonBorderShape(.capsule)
                                .tint(selected ? Brand.accent(for: scheme) : .secondary)
                                .accessibilityLabel("\(NativeEmojiLibrary.shortcode(in: symbol) ?? symbol) reaction, \(items.count)")
                                .accessibilityAddTraits(selected ? .isSelected : [])
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .fixedSize(horizontal: counts.count < 4, vertical: false)
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
        .reactionBurst(reactionBurst?.message == message.id ? reactionBurst?.animation : nil,
                       alignment: mine ? .trailing : .leading)
        .onChange(of: reactions) { previous, updated in
            guard !reduceMotion else { return }
            let before = Dictionary(grouping: previous.filter { !$0.mine }, by: \.emoji)
            let after = Dictionary(grouping: updated.filter { !$0.mine }, by: \.emoji)
            if let symbol = after.keys.sorted().first(where: { (after[$0]?.count ?? 0) > (before[$0]?.count ?? 0) }) {
                reactionBurst = .init(message: message.id, animation: .init(symbol: symbol))
            }
        }
    }

    private func author(of message: MessageThread.Note, in thread: MessageThread) -> MessagePerson? {
        if let partner = thread.partner, partner.id == message.senderId { return partner }
        if let member = thread.members.first(where: { $0.id == message.senderId })?.user { return member }
        guard let sender = message.sender else { return nil }
        return .init(id: message.senderId, username: sender.username, displayName: sender.displayName,
            avatarUrl: sender.avatarUrl, isVerified: sender.isVerified,
            avatarRingStyle: sender.avatarRingStyle, avatarRingColor: sender.avatarRingColor)
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
            if let context = draftData.editing ?? draftData.responding {
                HStack {
                    replyPreview(context.content, author: draftData.editing == nil ? "Replying" : "Editing")
                    Button("Cancel", systemImage: "xmark.circle.fill") {
                        if draftData.editing != nil { draftData.text = "" }
                        draftData.editing = nil; draftData.responding = nil
                    }
                    .buttonStyle(.borderless).labelStyle(.iconOnly)
                }
            }
            if draftData.uploading, draftData.editing == nil {
                ProgressView("Uploading photo")
                    .font(.footnote).padding(.horizontal, 8).padding(.vertical, 4)
            } else if let roomPicture = draftData.picture, draftData.editing == nil {
                let gif = NativeGIFSource.canPlay(roomPicture)
                HStack(spacing: 10) {
                    Group {
                        if gif { NativeGIFPlayback(url: roomPicture, maxHeight: 54, maxWidth: 76) }
                        else { ResearchArtwork(urls: [roomPicture], fallback: "photo", contentMode: .fill, pointSize: 76) }
                    }
                    .frame(width: 76, height: 54)
                    .clipShape(.rect(cornerRadius: 9))
                    .accessibilityHidden(true)
                    Text(gif ? "GIF attached" : "Photo attached").font(.subheadline.weight(.medium))
                    Spacer(minLength: 4)
                    Button {
                        draftData.picture = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill").font(.title3).frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove attachment")
                }
                .padding(6)
                .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
            }
            if !draftData.unsent.isEmpty, draftData.editing == nil {
                Menu("Unsent drafts (\(draftData.unsent.count))", systemImage: "doc.badge.clock") {
                    ForEach(draftData.unsent) { item in Button(String(item.text.prefix(70)), systemImage: "doc.text") { insertDraft(item) } }
                }
                .font(.footnote)
                .disabled(draftData.text.utf16.count >= 999)
            }
            if thread.canSend || draftData.editing != nil {
                messageInput(thread)
            } else {
                Label(destination.kind == .channel ? "Read-only channel" : "This member has direct messages turned off", systemImage: "lock")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background { Brand.background(for: scheme).ignoresSafeArea(.container, edges: .bottom) }
        .overlay(alignment: .top) { Rectangle().fill(Color(uiColor: .separator)).frame(height: 0.5).accessibilityHidden(true) }
    }

    private func messageInput(_ thread: MessageThread) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            composerMenu
            HStack(alignment: .bottom, spacing: 0) {
                TextField("Message", text: draftBinding.text, axis: .vertical)
                    .font(.body)
                    .lineLimit(1...5)
                    .padding(.leading, 13)
                    .padding(.trailing, focused == .message ? 0 : 13)
                    .padding(.vertical, 11)
                    .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                    .focused($focused, equals: .message)
                    .accessibilityIdentifier("chat-message-input")
                    .onChange(of: draftData.text) { _, value in
                        draftData.revision += 1
                        if value.utf16.count > 1_000 { draftData.text = String(value.prefix(1_000)) }
                        if draftData.editing == nil, thread.canSend, focused == .message {
                            typingPresence.didType(hasText: !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                if focused == .message {
                    Button {
                        focused = nil
                    } label: {
                        Image(systemName: "keyboard.chevron.compact.down")
                            .font(.body.weight(.medium))
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 46)
                            .contentShape(.rect)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel("Hide keyboard")
                    .accessibilityIdentifier("chat-hide-keyboard")
                }
            }
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 23))
            .overlay {
                RoundedRectangle(cornerRadius: 23)
                    .strokeBorder(focused == .message ? Brand.accent(for: scheme).opacity(0.42) : .secondary.opacity(0.18))
                    .allowsHitTesting(false)
            }
            sendControl
        }
    }

    private var composerMenu: some View {
        Menu {
            if draftData.editing == nil {
                Button("Photo", systemImage: "photo.on.rectangle") {
                    focused = nil
                    showingPhotos = true
                }
                .disabled(draftData.uploading)
                Button("GIF", systemImage: "play.rectangle") {
                    focused = nil
                    composerPicker = .gif
                }
                .disabled(draftData.uploading)
            }
            Button("Emoji", systemImage: "face.smiling") {
                focused = nil
                composerPicker = .emoji
            }
        } label: {
            Image(systemName: "plus")
                .font(.body.weight(.semibold))
                .foregroundStyle(Brand.text(for: scheme))
                .frame(width: 44, height: 46)
                .background(Brand.surface(for: scheme), in: .circle)
                .contentShape(.rect)
        }
        .menuOrder(.fixed)
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel("Add to message")
        .accessibilityIdentifier("chat-compose-menu")
        .disabled(draftData.composing)
    }

    private var sendControl: some View {
        let canSend = !draftData.composing && !draftData.uploading && draftData.text.utf16.count <= 1_000 &&
            (!draftData.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftData.picture != nil && draftData.editing == nil)
        return Button {
            Task { await send() }
        } label: {
            Group {
                if draftData.composing { ProgressView() }
                else { Image(systemName: draftData.editing == nil ? "arrow.up" : "checkmark").font(.body.weight(.bold)) }
            }
            .frame(width: 46, height: 46)
            .foregroundStyle(canSend ? (scheme == .dark ? Color(rgb: 0x18240B) : .white) : .secondary)
            .background(canSend ? Brand.accent(for: scheme) : Brand.surface(for: scheme), in: .circle)
            .contentShape(.circle)
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(draftData.editing == nil ? "Send message" : "Save edit")
        .accessibilityIdentifier("chat-send-message")
        .disabled(!canSend)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: canSend)
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
                if thread != value {
                    preserveVisibleHistory(next: value)
                    thread = value
                }
                if error != nil { error = nil }
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
        let key = "\(id):\(symbol)"
        guard let messageID = UUID(uuidString: id), reacting.insert(key).inserted else { return }
        reactionFeedback += 1
        if enabled, !reduceMotion { reactionBurst = .init(message: messageID, animation: .init(symbol: symbol)) }
        Task {
            defer { reacting.remove(key) }
            await mutate(.init(action: "react", message: id, emoji: symbol, enabled: enabled))
        }
    }

    private func send() async {
        guard !draftData.composing, !draftData.uploading else { return }
        draftData.composing = true
        typingPresence.didType(hasText: false)
        defer { draftData.composing = false }
        let submitted = draftData.text
        let submittedVersion = draftData.revision
        let reply = draftData.responding?.id
        let image = draftData.editing == nil ? draftData.picture : nil
        if draftData.editing == nil, draftData.lastSendAttempt?.text != submitted || draftData.lastSendAttempt?.reply != reply || draftData.lastSendAttempt?.image != image {
            draftData.lastSendAttempt = .init(id: UUID(), text: submitted, reply: reply, image: image)
        }
        guard let note = draftData.editing?.id ?? draftData.lastSendAttempt?.id else { return }
        let change = MessagesAPI.Change(action: draftData.editing == nil ? "send" : "edit", message: note.uuidString.lowercased(),
            text: submitted, reply: reply?.uuidString.lowercased(), image: image)
        if await perform(change) {
            if change.action == "edit" { await refreshOlderMessage(note, deleted: false) }
            if draftData.revision == submittedVersion { draftData.text = "" }
            if draftData.picture == image { draftData.picture = nil }
            draftData.editing = nil
            draftData.responding = nil
            draftData.lastSendAttempt = nil
        } else if draftData.editing == nil, draftData.revision != submittedVersion, !submitted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            draftData.unsent.append(.init(text: submitted))
        }
        await refresh()
    }

    private func insertDraft(_ item: MessageThreadDraft.Unsent) {
        let separator = draftData.text.isEmpty ? "" : "\n"
        let available = 1_000 - draftData.text.utf16.count - separator.utf16.count
        guard available > 0, let index = draftData.unsent.firstIndex(where: { $0.id == item.id }) else { return }
        var insertion = String.UnicodeScalarView()
        var count = 0
        for scalar in item.text.unicodeScalars {
            let width = scalar.utf16.count
            if count + width > available { break }
            insertion.append(scalar)
            count += width
        }
        guard !insertion.isEmpty else { return }
        draftData.text += separator + String(insertion)
        let remaining = item.text.unicodeScalars.dropFirst(insertion.count)
        if remaining.isEmpty { draftData.unsent.remove(at: index) }
        else { draftData.unsent[index].text = String(remaining) }
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
