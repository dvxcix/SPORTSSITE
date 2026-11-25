import SwiftUI

struct ActivityView: View {
    let api: ActivityAPI
    @Environment(\.colorScheme) private var scheme
    @State private var selection = Filter.all
    @State private var destination: ActivityNotification.Destination?
    @State private var rows: [ActivityNotification] = []
    @State private var state = State.loading
    @State private var busy = false
    @State private var showClear = false
    @State private var mutationFailed = false
    @State private var revision = 0

    private enum State {
        case loading, ready, unavailable, denied
    }

    private enum Filter: String, CaseIterable {
        case all = "All"
        case unread = "Unread"
        case mentions = "Mentions"
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
        .navigationTitle("Notifications")
        .navigationDestination(item: $destination) { chosen in
            switch chosen {
            case .post(let id): FeedThreadView(api: FeedAPI(account: api.account, userID: api.userID), id: id)
            case .conversation(let room): MessageThreadView(api: MessagesAPI(account: api.account, userID: api.userID), destination: room)
            case .discovery: DiscoverView(api: DiscoverAPI(account: api.account, userID: api.userID))
            case .community(let id): DiscoverView(api: DiscoverAPI(account: api.account, userID: api.userID), opensCommunity: id)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: revision) { await load() }
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
        ForEach(filtered) { row in
            Button {
                if !row.read { Task { await mutate { try await api.markRead([row.id]) } } }
                if let target = row.destination { destination = target }
            } label: {
                notification(row)
            }
            .disabled(busy)
            .listRowBackground(Brand.surface(for: scheme))
            .swipeActions(allowsFullSwipe: false) {
                Button("Remove", role: .destructive) { Task { await mutate { try await api.remove(row.id) } } }
                    .disabled(busy)
            }
        }
    }

    private func notification(_ row: ActivityNotification) -> some View {
        HStack(alignment: .top, spacing: 10) {
            let avatar = row.actor?.avatarUrl.flatMap { $0.scheme == "https" ? $0 : nil }
            ResearchArtwork(urls: avatar.map { [$0] } ?? [], fallback: row.icon)
                .frame(width: 32, height: 32)
                .clipShape(.circle)
            VStack(alignment: .leading, spacing: 3) {
                if let message = row.message { Text(verbatim: message).font(.headline) }
                if let body = row.body { Text(verbatim: body).font(.subheadline) }
                if row.message == nil, row.body == nil {
                    Text(row.type.replacingOccurrences(of: "_", with: " ").capitalized)
                }
                if let date = SidelineBoard.timestamp(row.createdAt) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .foregroundStyle(Brand.text(for: scheme))
            Spacer()
            if !row.read {
                Circle().fill(Brand.accent(for: scheme))
                    .frame(width: 8, height: 8)
                    .accessibilityLabel("Unread")
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            let loaded = try await api.load()
            try Task.checkCancellation()
            rows = loaded
            state = .ready
        } catch let response as SlipSurgeHTTP.Status where response.code == 403 {
            if !Task.isCancelled { state = .denied }
        } catch {
            if !Task.isCancelled { state = .unavailable }
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
