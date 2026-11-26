import SwiftUI

struct ActivityView: View {
    let api: ActivityAPI
    var inInbox = false
    var initialActivity: (() -> [ActivityNotification]?)? = nil
    var onUnreadChange: (Int) -> Void = { _ in }
    @Environment(\.colorScheme) private var scheme
    @State private var selection = Filter.all
    @State private var destination: ActivityNotification.Destination?
    @State private var rows: [ActivityNotification] = []
    @State private var state = State.loading
    @State private var busy = false
    @State private var showClear = false
    @State private var mutationFailed = false
    @State private var refreshFailed = false
    @State private var revision = 0

    private enum State {
        case loading, ready, unavailable, denied
    }

    private enum Filter: String, CaseIterable {
        case all = "All"
        case unread = "Unread"
        case mentions = "Mentions"
    }

    private enum Period: String, CaseIterable {
        case today = "Today"
        case earlier = "Earlier"
    }

    private func period(of row: ActivityNotification) -> Period {
        guard let date = SidelineBoard.timestamp(row.createdAt), Calendar.current.isDateInToday(date) else { return .earlier }
        return .today
    }

    private var filtered: [ActivityNotification] {
        switch selection {
        case .all: rows
        case .unread: rows.filter { !$0.read }
        case .mentions: rows.filter { $0.type == "mention" }
        }
    }

    var body: some View {
        List {
            switch state {
            case .loading:
                ProgressView("Loading notifications")
                    .listRowBackground(Brand.surface(for: scheme))
            case .ready:
                if refreshFailed {
                    Button("Couldn’t refresh activity. Retry", systemImage: "arrow.clockwise") { revision += 1 }
                        .listRowBackground(Brand.surface(for: scheme))
                }
                activityRows
            case .denied:
                ContentUnavailableView("Notification access required", systemImage: "lock")
                    .listRowBackground(Brand.surface(for: scheme))
            case .unavailable:
                ContentUnavailableView {
                    Label("Notifications unavailable", systemImage: "bell.slash")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .navigationTitle(inInbox ? "Inbox" : "Notifications")
        .navigationDestination(item: $destination) { chosen in
            ActivityDestinationView(api: api, destination: chosen)
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: revision) {
            if state == .loading, let initial = initialActivity?() {
                rows = initial
                state = .ready
            }
            await load()
        }
        .onReceive(NotificationCenter.default.publisher(for: .slipSurgeActivityChanged)) { _ in
            if !busy { revision += 1 }
        }
        .refreshable { if !busy { await load() } }
        .toolbar {
            if state == .ready, !rows.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Mark all visible read", systemImage: "checkmark.circle") {
                            let ids = rows.filter { !$0.read }.map(\.id)
                            Task { await mutate { try await api.markRead(ids) } }
                        }
                        .disabled(rows.allSatisfy(\.read))
                        Button("Clear all notifications", systemImage: "trash", role: .destructive) { showClear = true }
                    } label: {
                        Label("Actions", systemImage: "ellipsis.circle")
                    }
                    .disabled(busy)
                }
            }
        }
        .confirmationDialog("Clear all notifications?", isPresented: $showClear, titleVisibility: .visible) {
            Button("Clear all", role: .destructive) {
                Task { await mutate { try await api.clear() } }
            }
        } message: {
            Text("This permanently removes every notification in your inbox.")
        }
        .alert("Notifications couldn’t be updated", isPresented: $mutationFailed) {
            Button("OK", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var activityRows: some View {
        Picker("Filter", selection: $selection) {
            ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .listRowBackground(Brand.surface(for: scheme))

        if filtered.isEmpty {
            ContentUnavailableView("No notifications", systemImage: "bell")
                .listRowBackground(Brand.surface(for: scheme))
        }
        let grouped = Dictionary(grouping: filtered, by: period)
        ForEach(Period.allCases, id: \.self) { period in
            if let items = grouped[period] {
                Section(period.rawValue) {
                    ForEach(items) { row in
                        Button {
                            open(row)
                        } label: {
                            notification(row)
                        }
                        .disabled(busy)
                        .listRowBackground(Brand.surface(for: scheme))
                        .swipeActions(edge: .leading) {
                            if !row.read {
                                Button("Mark as read", systemImage: "checkmark") {
                                    Task { await mutate { try await api.markRead([row.id]) } }
                                }
                                .tint(Brand.accent(for: scheme))
                                .disabled(busy)
                            }
                        }
                        .swipeActions(allowsFullSwipe: false) {
                            Button("Remove", role: .destructive) { Task { await mutate { try await api.remove(row.id) } } }
                                .disabled(busy)
                        }
                    }
                }
            }
        }
    }

    private func open(_ row: ActivityNotification) {
        if !row.read { Task { await mutate { try await api.markRead([row.id]) } } }
        if let target = row.destination { destination = target }
    }

    private func notification(_ row: ActivityNotification) -> some View {
        let artwork = row.artworkUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        let hasImage = row.actor != nil || artwork != nil
        return HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                if let actor = row.actor {
                    NativeMemberAvatar(url: actor.avatarUrl, name: actor.displayName ?? actor.username, size: 40,
                        style: actor.avatarRingStyle, color: actor.avatarRingColor)
                } else if let artwork {
                    ResearchArtwork(urls: [artwork], fallback: row.icon, pointSize: 40, playerPortrait: row.type == "pick_result")
                        .frame(width: 40, height: 40)
                        .background(Brand.accent(for: scheme).opacity(0.12), in: .rect(cornerRadius: 12))
                        .clipShape(.rect(cornerRadius: 12))
                } else {
                    Circle().fill(Brand.accent(for: scheme).opacity(0.12))
                        .frame(width: 40, height: 40)
                }
                Image(systemName: row.icon)
                    .font((hasImage ? Font.caption2 : .body).weight(.semibold))
                    .foregroundStyle(Brand.accent(for: scheme))
                    .frame(width: hasImage ? 21 : 40, height: hasImage ? 21 : 40)
                    .background(hasImage ? Brand.surface(for: scheme) : .clear, in: .circle)
                    .offset(x: hasImage ? 5 : 0, y: hasImage ? 4 : 0)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(row.title).font(.caption.weight(.semibold))
                    Spacer(minLength: 2)
                    if let date = SidelineBoard.timestamp(row.createdAt) {
                        Text(date, style: .relative).font(.caption2).monospacedDigit().lineLimit(1)
                    }
                }
                .foregroundStyle(.secondary)
                if let actor = row.actor {
                    let name = actor.displayName?.isEmpty == false ? actor.displayName ?? actor.username : actor.username
                    (Text(verbatim: name).fontWeight(.bold) +
                        Text(verbatim: row.message.map { " " + $0 } ?? ""))
                        .font(.subheadline)
                } else if let message = row.message {
                    Text(verbatim: message).font(.subheadline.weight(row.read ? .regular : .semibold))
                }
                if let body = row.body { Text(verbatim: body).font(.subheadline).foregroundStyle(.secondary) }
            }
            .foregroundStyle(Brand.text(for: scheme))
            if !row.read {
                Circle().fill(Brand.accent(for: scheme))
                    .frame(width: 7, height: 7)
                    .padding(.top, 4)
                    .accessibilityLabel("Unread")
            }
        }
        .padding(.vertical, 4)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        refreshFailed = false
        do {
            let loaded = try await api.load()
            try Task.checkCancellation()
            rows = loaded
            state = .ready
            onUnreadChange(loaded.unreadCount)
        } catch let response as SlipSurgeHTTP.Status where [401, 403, 404].contains(response.code) {
            if !Task.isCancelled {
                rows = []
                state = .denied
                onUnreadChange(0)
            }
        } catch {
            if !Task.isCancelled {
                if rows.isEmpty { state = .unavailable }
                else { refreshFailed = true }
            }
        }
    }

    private func mutate(_ mutation: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await mutation() } catch { mutationFailed = true }
        await load()
    }
}
