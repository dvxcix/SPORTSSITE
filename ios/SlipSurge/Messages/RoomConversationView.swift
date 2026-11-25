import SwiftUI

private struct CommunityRoomVisibilityKey: EnvironmentKey {
    static let defaultValue: (@MainActor @Sendable (UUID, Bool) -> Void)? = nil
}

extension EnvironmentValues {
    var communityRoomVisibility: (@MainActor @Sendable (UUID, Bool) -> Void)? {
        get { self[CommunityRoomVisibilityKey.self] }
        set { self[CommunityRoomVisibilityKey.self] = newValue }
    }
}

struct RoomConversationView: View {
    let api: MessagesAPI
    let group: UUID?
    let groupName: String?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.communityRoomVisibility) private var reportVisibility
    @State private var room: MessageDestination
    @State private var visibilityID = UUID()
    @State private var catalog: [MessagesAPI.Channel]
    @State private var drafts: [UUID: MessageThreadDraft] = [:]

    init(api: MessagesAPI, group: UUID?, groupName: String?, room: MessageDestination,
         catalog: [MessagesAPI.Channel] = []) {
        self.api = api
        self.group = group
        self.groupName = groupName
        _room = State(initialValue: room)
        _catalog = State(initialValue: catalog)
    }

    var body: some View {
        MessageThreadView(api: api, destination: room, roomDraft: draft(for: room.id))
            .id(room.id)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .safeAreaInset(edge: .top, spacing: 0) {
                if catalog.count > 1 { roomSwitcher }
            }
            .toolbar {
                if let name = catalog.first(where: { $0.id == room.id })?.name {
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 1) {
                            Text(name).font(.headline).lineLimit(1)
                            if let groupName, groupName != name {
                                Text(groupName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)
                    }
                }
            }
            .toolbar(.hidden, for: .tabBar)
            .onAppear { reportVisibility?(visibilityID, true) }
            .onDisappear { reportVisibility?(visibilityID, false) }
            .task {
                guard let latest = try? await api.channels(group: group), !Task.isCancelled else { return }
                catalog = latest
            }
    }

    private var roomSwitcher: some View {
        ScrollViewReader { scroll in
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ForEach(catalog) { choice in
                        let selected = choice.id == room.id
                        Button {
                            room = .init(kind: .channel, id: choice.id)
                        } label: {
                            Label(choice.name, systemImage: choice.preferred == true ? "star.fill" : "number")
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 44)
                                .foregroundStyle(selected ? Brand.accent(for: scheme) : Brand.text(for: scheme))
                                .background(selected ? Brand.accent(for: scheme).opacity(0.15) : Brand.surface(for: scheme), in: .capsule)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .disabled(drafts[room.id]?.composing == true || drafts[room.id]?.uploading == true)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .id(choice.id)
                    }
                }
                .padding(.horizontal, 13)
            }
            .scrollIndicators(.hidden)
            .onAppear { scroll.scrollTo(room.id, anchor: .center) }
            .onChange(of: room) { _, selection in
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) { scroll.scrollTo(selection.id, anchor: .center) }
            }
        }
        .padding(.vertical, 4)
        .background(Brand.background(for: scheme))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Switch rooms")
        .sensoryFeedback(.selection, trigger: room)
    }

    private func draft(for id: UUID) -> Binding<MessageThreadDraft> {
        Binding(get: { drafts[id] ?? .init() }, set: { drafts[id] = $0 })
    }
}
