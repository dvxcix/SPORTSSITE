import SwiftUI

struct ChannelDirectoryView: View {
    let api: MessagesAPI
    var group: UUID? = nil
    var groupName: String? = nil
    @Environment(\.colorScheme) private var scheme
    @State private var revision = 0

    var body: some View {
        ScrollView {
            RoomDirectory(api: api, group: group, groupName: groupName, revision: revision, showsSearch: true)
                .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(groupName ?? "Live Rooms")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { revision += 1 }
    }
}

struct RoomDirectory: View {
    let api: MessagesAPI
    let group: UUID?
    let groupName: String?
    var revision = 0
    var showsSearch = false
    @Environment(\.colorScheme) private var scheme
    @FocusState private var filterFocused: Bool
    @State private var rooms: [MessagesAPI.Channel]?
    @State private var filter = ""
    @State private var error: (any Error)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let rooms {
                if showsSearch || rooms.count > 5 || !filter.isEmpty { searchField }
                roomList(rooms)
            } else if group == nil, let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                ContentUnavailableView {
                    Label("Live Rooms require membership", systemImage: "lock")
                } actions: {
                    NavigationLink("Compare memberships") { NativeMembershipOverview(account: api.account) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ResearchToolMessage(title: "Rooms couldn’t load", error: error) { Task { await load() } }
            }
        }
        .foregroundStyle(Brand.text(for: scheme))
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone { filterFocused = false }
        .task(id: revision) { await load() }
    }

    private var searchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
            TextField("Find a room", text: $filter).autocorrectionDisabled()
                .focused($filterFocused)
                .submitLabel(.search)
                .onSubmit { filterFocused = false }
        }
        .padding(.horizontal, 12).frame(minHeight: 44)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
    }

    @ViewBuilder private func roomList(_ rooms: [MessagesAPI.Channel]) -> some View {
        let visible = rooms.filter {
            filter.isEmpty || $0.name.localizedStandardContains(filter) || $0.description?.localizedStandardContains(filter) == true
        }
        if visible.isEmpty {
            ContentUnavailableView(filter.isEmpty ? "No rooms yet" : "No matching rooms", systemImage: "number")
        } else {
            let favorites = visible.filter { $0.preferred == true }
            let otherRooms = visible.filter { $0.preferred != true }
            if !favorites.isEmpty {
                roomSection("Favorites", rooms: favorites, catalog: rooms)
            }
            if !otherRooms.isEmpty {
                roomSection(favorites.isEmpty ? nil : "More rooms", rooms: otherRooms, catalog: rooms)
            }
        }
    }

    private func roomSection(_ title: String?, rooms: [MessagesAPI.Channel], catalog: [MessagesAPI.Channel]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title).font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader)
            }
            LazyVStack(spacing: 0) {
                ForEach(rooms) { room in
                    NavigationLink {
                        RoomConversationView(api: api, group: group, groupName: groupName,
                            room: .init(kind: .channel, id: room.id), catalog: catalog)
                    } label: {
                        row(room)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    if room.id != rooms.last?.id { Divider().padding(.leading, 54).accessibilityHidden(true) }
                }
            }
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
        }
    }

    private func row(_ room: MessagesAPI.Channel) -> some View {
        HStack(spacing: 12) {
            Group {
                if let icon = room.icon, icon != "#", !icon.isEmpty { Text(String(icon.prefix(6))) }
                else { Image(systemName: room.symbol).foregroundStyle(Brand.accent(for: scheme)) }
            }
            .frame(width: 36, height: 36)
            .background(Brand.accent(for: scheme).opacity(0.13), in: .rect(cornerRadius: 10))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: room.name).font(.headline)
                if let description = room.description, !description.isEmpty {
                    Text(verbatim: description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            if room.preferred == true {
                Image(systemName: "star.fill").font(.caption).foregroundStyle(Brand.accent(for: scheme))
                    .accessibilityLabel("Favorite room")
            } else if room.isPinned == true {
                Image(systemName: "pin.fill").font(.caption).accessibilityLabel("Pinned")
            }
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 10)
        .frame(minHeight: 56)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            let latest = try await api.channels(group: group)
            try Task.checkCancellation()
            rooms = latest
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}

private extension MessagesAPI.Channel {
    var symbol: String {
        switch channelKind {
        case "live": "dot.radiowaves.left.and.right"
        case "picks": "chart.line.uptrend.xyaxis"
        case "announcements": "megaphone"
        default: "number"
        }
    }
}
