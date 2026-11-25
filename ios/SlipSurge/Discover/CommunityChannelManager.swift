import SwiftUI

struct CommunityChannelManager: View {
    let api: CommunitySettingsAPI
    let initial: CommunitySettingsState

    @Environment(\.colorScheme) private var scheme
    @State private var current: CommunitySettingsState?
    @State private var editor: Item?
    @State private var removing: MessagesAPI.Channel?
    @State private var problem: String?

    private struct Item: Identifiable {
        let id = UUID()
        let channel: MessagesAPI.Channel?
    }
    private var state: CommunitySettingsState { current ?? initial }

    var body: some View {
        List {
            ForEach(state.channels) { channel in
                Button { editor = Item(channel: channel) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(channel.name, systemImage: "number").font(.headline)
                        Text(channel.id == state.group.channelId ? "Primary channel" : (channel.channelKind ?? "text").capitalized)
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }.buttonStyle(.plain)
                .swipeActions(allowsFullSwipe: false) {
                    if channel.id != state.group.channelId {
                        Button("Delete", systemImage: "trash", role: .destructive) { removing = channel }
                    }
                }
            }.listRowBackground(Brand.surface(for: scheme))
            if state.channels.isEmpty { ContentUnavailableView("No channels", systemImage: "number") }
            if let problem { Text(problem).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Manage channels")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("New channel", systemImage: "plus") { editor = Item(channel: nil) } }
        .refreshable { await reload() }
        .sheet(item: $editor) { item in
            ChannelEditor(api: api, channel: item.channel) { await reload() }
        }
        .confirmationDialog("Delete this channel?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { channel in
            Button("Delete \(channel.name)", role: .destructive) { Task { await remove(channel) } }
        }
    }

    private func reload() async {
        do { current = try await api.load(); problem = nil }
        catch { if !Task.isCancelled { problem = "Channels couldn’t refresh." } }
    }

    private func remove(_ channel: MessagesAPI.Channel) async {
        do {
            try await api.save(.init(action: "channel-delete", channel: channel.id.uuidString.lowercased()))
            await reload()
        } catch { problem = "The channel couldn’t be deleted." }
    }
}

private struct ChannelEditor: View {
    private static let kinds = ["text", "live", "picks", "announcements"]

    let api: CommunitySettingsAPI
    let channel: MessagesAPI.Channel?
    let didSave: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var name = ""
    @State private var description = ""
    @State private var icon = "#"
    @State private var kind = "text"
    @State private var busy = false
    @State private var failure = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Channel name", text: $name)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(2...5)
                    TextField("Icon", text: $icon)
                    Picker("Channel type", selection: $kind) {
                        ForEach(Self.kinds, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }.listRowBackground(Brand.surface(for: scheme))
                if failure { Text("The channel couldn’t be saved. Try again.").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .navigationTitle(channel == nil ? "New channel" : "Edit channel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || !(2...50).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count) || description.utf16.count > 280 || icon.utf16.count > 12)
                }
            }
            .disabled(busy)
        }
        .onAppear {
            name = channel?.name ?? ""
            description = channel?.description ?? ""
            icon = channel?.icon ?? "#"
            kind = channel?.channelKind ?? "text"
        }
        .interactiveDismissDisabled(busy)
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.save(.init(action: channel == nil ? "channel-create" : "channel-edit", name: name, description: description,
                icon: icon, channel: channel?.id.uuidString.lowercased(), channelKind: kind))
            await didSave()
            dismiss()
        } catch { failure = true }
    }
}
