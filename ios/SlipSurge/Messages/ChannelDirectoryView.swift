import SwiftUI

struct ChannelDirectoryView: View {
    let api: MessagesAPI
    var group: UUID? = nil

    @Environment(\.colorScheme) private var scheme
    @State private var channels: [MessagesAPI.Channel]?
    @State private var filter = ""
    @State private var error: (any Error)?
    @State private var revision = 0

    var body: some View {
        List {
            if let channels {
                let visible = channels.filter { filter.isEmpty || $0.name.localizedStandardContains(filter) || $0.description?.localizedStandardContains(filter) == true }
                ForEach(visible) { channel in
                    NavigationLink {
                        MessageThreadView(api: api, destination: .init(kind: .channel, id: channel.id))
                    } label: { row(channel) }
                }.listRowBackground(Brand.surface(for: scheme))
                if visible.isEmpty { ContentUnavailableView("No matching channels", systemImage: "number") }
            } else if group == nil, let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                ContentUnavailableView {
                    Label("Live Rooms require membership", systemImage: "lock")
                } actions: {
                    NavigationLink("Compare memberships") { NativeMembershipOverview(account: api.account) }.buttonStyle(.borderedProminent)
                }
            } else {
                ResearchToolMessage(title: "Channels couldn’t load", error: error) { revision += 1 }
            }
        }
        .searchable(text: $filter, prompt: "Find a channel")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(group == nil ? "Live Rooms" : "Channels")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func row(_ channel: MessagesAPI.Channel) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 11).fill(Brand.accent(for: scheme).opacity(0.16))
                if let icon = channel.icon, icon != "#", !icon.isEmpty { Text(String(icon.prefix(6))) }
                else { Image(systemName: symbol(channel.channelKind)).foregroundStyle(Brand.accent(for: scheme)) }
            }.frame(width: 38, height: 38).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: channel.name).font(.headline)
                if let description = channel.description, !description.isEmpty {
                    Text(verbatim: description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
                if let count = channel.memberCount, count > 0 {
                    Text("\(count.formatted()) members").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if channel.preferred == true { Image(systemName: "star.fill").font(.caption).accessibilityLabel("Favorite channel") }
            else if channel.isPinned == true { Image(systemName: "pin.fill").font(.caption).accessibilityLabel("Pinned") }
        }
    }

    private func symbol(_ kind: String?) -> String {
        switch kind {
        case "live": "dot.radiowaves.left.and.right"
        case "picks": "chart.line.uptrend.xyaxis"
        case "announcements": "megaphone"
        default: "number"
        }
    }

    private func load() async {
        do {
            channels = try await api.channels(group: group)
            error = nil
        } catch { if !Task.isCancelled { self.error = error } }
    }
}
