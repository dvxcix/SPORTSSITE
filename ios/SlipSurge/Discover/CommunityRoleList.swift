import SwiftUI
import UIKit

struct CommunityRoleList: View {
    let api: CommunitySettingsAPI
    let initial: CommunitySettingsState

    @Environment(\.colorScheme) private var scheme
    @State private var current: CommunitySettingsState?
    @State private var creating = false
    @State private var removing: CommunitySettingsState.Role?
    @State private var problem: String?

    private var state: CommunitySettingsState { current ?? initial }

    var body: some View {
        List {
            ForEach(state.roles) { role in
                NavigationLink {
                    CommunityRoleEditor(api: api, initial: state, original: role) { await reload() }
                } label: {
                    HStack(spacing: 10) {
                        Circle().fill(Color(hex: role.color) ?? Brand.accent(for: scheme)).frame(width: 12, height: 12)
                        Text(verbatim: role.name).font(.subheadline.weight(.semibold))
                        Spacer()
                        if role.isDefault { Text("Default").font(.caption).foregroundStyle(.secondary) }
                    }
                }
                .swipeActions(allowsFullSwipe: false) {
                    if !role.isDefault { Button("Delete", systemImage: "trash", role: .destructive) { removing = role } }
                }
            }.listRowBackground(Brand.surface(for: scheme))
            if let problem { Text(problem).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Roles and permissions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("New role", systemImage: "plus") { creating = true } }
        .refreshable { await reload() }
        .sheet(isPresented: $creating) {
            NavigationStack { CommunityRoleEditor(api: api, initial: state, original: nil) { await reload() } }
        }
        .confirmationDialog("Delete this role?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { role in
            Button("Delete \(role.name)", role: .destructive) { Task { await remove(role) } }
        }
    }

    private func reload() async {
        do { current = try await api.load(); problem = nil }
        catch { if !Task.isCancelled { problem = "Roles couldn’t refresh." } }
    }

    private func remove(_ role: CommunitySettingsState.Role) async {
        do {
            try await api.save(.init(action: "role-delete", roleId: role.id.uuidString.lowercased()))
            await reload()
        } catch { problem = "The role couldn’t be deleted." }
    }
}

private struct CommunityRoleEditor: View {
    private static let labels = [
        ("view_channels", "View channels"), ("send_messages", "Send messages"), ("manage_messages", "Manage messages"),
        ("manage_channels", "Manage channels"), ("manage_roles", "Manage roles"), ("manage_members", "Manage members"), ("create_invites", "Create invites"),
    ]

    let api: CommunitySettingsAPI
    let initial: CommunitySettingsState
    let original: CommunitySettingsState.Role?
    let didSave: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var current: CommunitySettingsState?
    @State private var name = ""
    @State private var color = Color(rgb: 0xB4FF4D)
    @State private var permissions: [String: Bool] = [:]
    @State private var busy = false
    @State private var feedback: String?
    @State private var failure = false
    @State private var configured = false

    private var state: CommunitySettingsState { current ?? initial }

    var body: some View {
        Form {
            Section {
                TextField("Role name", text: $name)
                ColorPicker("Color", selection: $color, supportsOpacity: false)
            }.listRowBackground(Brand.surface(for: scheme))
            if let original {
                Section("Permissions") {
                    ForEach(Self.labels, id: \.0) { key, label in
                        Toggle(label, isOn: Binding(get: { permissions[key] ?? false }, set: { permissions[key] = $0 }))
                            .disabled(original.isDefault && key == "manage_roles")
                    }
                }.listRowBackground(Brand.surface(for: scheme))
                if !original.isDefault {
                    Section("Assign members") {
                        ForEach(state.members) { member in
                            let assigned = state.assignments.contains { $0.userId == member.id && $0.roleId == original.id }
                            Toggle(isOn: Binding(get: { assigned }, set: { enabled in
                                Task { await assign(original, to: member, enabled: enabled) }
                            })) {
                                HStack(spacing: 10) {
                                    MessageAvatar(person: member.user, size: 27)
                                    Text(member.user?.name ?? "Member")
                                }
                            }
                        }
                    }.listRowBackground(Brand.surface(for: scheme))
                }
                Section("Channel permissions") {
                    ForEach(state.channels) { channel in
                        NavigationLink {
                            CommunityOverrideEditor(api: api, role: original, channel: channel,
                                previous: state.overrides.first { $0.channelId == channel.id && $0.roleId == original.id }) { await reload() }
                        } label: { Label(channel.name, systemImage: "number") }
                    }
                }.listRowBackground(Brand.surface(for: scheme))
            }
            if let feedback { Text(feedback).foregroundStyle(failure ? .red : Brand.accent(for: scheme)) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(original == nil ? "New role" : "Edit role")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if original == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy || !(2...32).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count))
            }
        }
        .disabled(busy)
        .interactiveDismissDisabled(busy)
        .onAppear {
            guard !configured else { return }
            configured = true
            name = original?.name ?? ""
            color = Color(hex: original?.color) ?? Color(rgb: 0xB4FF4D)
            permissions = original?.permissions ?? [:]
        }
    }

    private func reload() async {
        do { current = try await api.load() }
        catch { if !Task.isCancelled { failure = true; feedback = "Roles couldn’t refresh." } }
    }

    private func assign(_ role: CommunitySettingsState.Role, to member: CommunitySettingsState.Member, enabled: Bool) async {
        await apply(.init(action: "role-assign", user: member.id.uuidString.lowercased(), roleId: role.id.uuidString.lowercased(), enabled: enabled))
    }

    private func save() async {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return }
        let bytes = [red, green, blue].map { Int((min(max($0, 0), 1) * 255).rounded()) }
        let hex = String(format: "#%02x%02x%02x", bytes[0], bytes[1], bytes[2])
        await apply(.init(action: original == nil ? "role-create" : "role-edit", name: name,
            roleId: original?.id.uuidString.lowercased(), color: hex, permissions: permissions))
        if !failure, original == nil { dismiss() }
    }

    private func apply(_ change: CommunitySettingsAPI.Change) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.save(change)
            failure = false
            feedback = "Saved"
            await reload()
            await didSave()
        } catch { failure = true; feedback = "Changes couldn’t be confirmed. Try again." }
    }
}

private struct CommunityOverrideEditor: View {
    private enum Setting: String, CaseIterable {
        case inherited = "Inherit", allow = "Allow", deny = "Deny"
        init(_ value: Bool?) {
            self = value.map { $0 ? .allow : .deny } ?? .inherited
        }
        var flag: Bool? { self == .inherited ? nil : self == .allow }
    }

    let api: CommunitySettingsAPI
    let role: CommunitySettingsState.Role
    let channel: MessagesAPI.Channel
    let previous: CommunitySettingsState.Override?
    let didSave: () async -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var view = Setting.inherited
    @State private var send = Setting.inherited
    @State private var moderate = Setting.inherited
    @State private var busy = false
    @State private var failure = false

    var body: some View {
        Form {
            Section {
                option("View channel", selection: $view)
                option("Send messages", selection: $send)
                option("Manage messages", selection: $moderate)
            } header: { Text(role.name) }
            .listRowBackground(Brand.surface(for: scheme))
            if failure { Text("Channel permissions couldn’t be saved.").foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(channel.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("Save") { Task { await save() } }.disabled(busy) }
        .onAppear {
            view = .init(previous?.canView)
            send = .init(previous?.canSend)
            moderate = .init(previous?.canManageMessages)
        }
    }

    private func option(_ title: String, selection: Binding<Setting>) -> some View {
        Picker(title, selection: selection) {
            ForEach(Setting.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.save(.init(action: "role-override", channel: channel.id.uuidString.lowercased(), roleId: role.id.uuidString.lowercased(),
                canView: view.flag, canSend: send.flag, canManageMessages: moderate.flag))
            await didSave()
            dismiss()
        } catch { failure = true }
    }
}
