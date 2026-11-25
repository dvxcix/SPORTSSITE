import SwiftUI

struct RoomConversationView: View {
    let api: MessagesAPI
    let group: UUID?
    let groupName: String?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var room: MessageDestination
    @State private var catalog: [MessagesAPI.Channel]
    @State private var drafts: [UUID: MessageThreadDraft] = [:]

    private var busy: Bool { drafts[room.id]?.composing == true || drafts[room.id]?.uploading == true }

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
                        if catalog.count > 1 {
                            Menu {
                                ForEach(catalog) { choice in
                                    Button(choice.name, systemImage: choice.id == room.id ? "checkmark" : choice.preferred == true ? "star" : "number") {
                                        switchRoom(to: choice)
                                    }
                                }
                            } label: {
                                roomTitle(name, offersSwitch: true)
                            }
                            .menuOrder(.fixed)
                            .disabled(busy)
                            .accessibilityLabel("\(name), switch room")
                        } else {
                            roomTitle(name, offersSwitch: false)
                                .accessibilityAddTraits(.isHeader)
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .tabBar)
            .task {
                guard let latest = try? await api.channels(group: group), !Task.isCancelled else { return }
                catalog = latest
            }
    }

    private func roomTitle(_ name: String, offersSwitch: Bool) -> some View {
        VStack(spacing: 1) {
            HStack(spacing: 4) {
                Text(name).font(.headline).lineLimit(1)
                if offersSwitch {
                    Image(systemName: "chevron.down").font(.caption2.bold())
                        .foregroundStyle(.secondary).accessibilityHidden(true)
                }
            }
            if let groupName, groupName != name {
                Text(groupName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .foregroundStyle(Brand.text(for: scheme))
        .accessibilityElement(children: .combine)
    }

    private var roomSwitcher: some View {
        ScrollViewReader { scroll in
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ForEach(catalog) { choice in
                        let selected = choice.id == room.id
                        Button {
                            switchRoom(to: choice)
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
                        .disabled(busy)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .id(choice.id)
                    }
                }
                .padding(.horizontal, 13)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.never)
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

    private func switchRoom(to choice: MessagesAPI.Channel) {
        guard !busy, choice.id != room.id else { return }
        room = .init(kind: .channel, id: choice.id)
    }

    private func draft(for id: UUID) -> Binding<MessageThreadDraft> {
        Binding(get: { drafts[id] ?? .init() }, set: { drafts[id] = $0 })
    }
}
