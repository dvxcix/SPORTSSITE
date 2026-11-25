import SwiftUI

struct CommunityMembersManager: View {
    let api: CommunitySettingsAPI
    let initial: CommunitySettingsState

    @Environment(\.colorScheme) private var scheme
    @State private var current: CommunitySettingsState?
    @State private var search = ""
    @State private var showInvites = false
    @State private var removing: CommunitySettingsState.Member?
    @State private var problem: String?
    @State private var busy = false

    private static let roles = ["admin", "moderator", "analyst", "subscriber", "member"]
    private var state: CommunitySettingsState { current ?? initial }

    var body: some View {
        List {
            if state.memberManagement {
                ForEach(state.members.filter { user in
                    search.isEmpty || user.user?.name.localizedStandardContains(search) == true || user.user?.username.localizedStandardContains(search) == true
                }) { user in
                    row(user)
                }.listRowBackground(Brand.surface(for: scheme))
            }
            if state.invite {
                Button("Invite a member", systemImage: "person.badge.plus") { showInvites = true }
                    .listRowBackground(Brand.surface(for: scheme))
            }
            if let problem { Text(problem).foregroundStyle(.red) }
        }
        .searchable(text: $search, prompt: "Find a member")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .sheet(isPresented: $showInvites) { CommunityInviteView(api: api) }
        .confirmationDialog("Remove member?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { member in
            Button("Remove \(member.user?.name ?? "member")", role: .destructive) {
                Task { await change(.init(action: "member-remove", user: member.id.uuidString.lowercased())) }
            }
        }
    }

    private func row(_ member: CommunitySettingsState.Member) -> some View {
        HStack(spacing: 10) {
            MessageAvatar(person: member.user, size: 34)
            Text(member.user?.name ?? "Member").font(.subheadline.weight(.semibold))
            Spacer()
            if member.role != "owner", member.id != api.userID {
                Menu(member.role.capitalized) {
                    if state.owner {
                        ForEach(Self.roles, id: \.self) { role in
                            Button(role.capitalized) {
                                Task { await change(.init(action: "member-role", user: member.id.uuidString.lowercased(), role: role)) }
                            }.disabled(role == member.role)
                        }
                    }
                    Button("Remove member", systemImage: "person.badge.minus", role: .destructive) { removing = member }
                }.disabled(busy)
            } else {
                Text(member.role.capitalized).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func reload() async {
        do { current = try await api.load(); problem = nil }
        catch { if !Task.isCancelled { problem = "Members couldn’t refresh." } }
    }

    private func change(_ change: CommunitySettingsAPI.Change) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await api.save(change); await reload() }
        catch { problem = "The member change couldn’t be confirmed." }
    }
}

private struct CommunityInviteView: View {
    let api: CommunitySettingsAPI

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    @State private var matches: [MessagePerson] = []
    @State private var pending: Set<UUID> = []
    @State private var sending: Set<UUID> = []
    @State private var problem: String?
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(matches) { person in
                    HStack(spacing: 10) {
                        MessageAvatar(person: person, size: 34)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(person.name).font(.subheadline.weight(.semibold))
                            Text("@\(person.username)").font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if pending.contains(person.id) { Label("Invited", systemImage: "checkmark").font(.footnote) }
                        else {
                            Button("Invite") { Task { await invite(person) } }.buttonStyle(.bordered).disabled(sending.contains(person.id))
                        }
                    }
                }.listRowBackground(Brand.surface(for: scheme))
                if searching { ProgressView("Searching members") }
                if let problem { Text(problem).foregroundStyle(.red) }
            }
            .searchable(text: $query, prompt: "Name or username")
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .navigationTitle("Invite members")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done", role: .cancel) { dismiss() } } }
            .task(id: query) { await find() }
        }
    }

    private func find() async {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        matches = []
        problem = nil
        searching = term.count >= 2
        guard searching else { return }
        do {
            try await Task.sleep(for: .milliseconds(280))
            let result = try await api.search(term)
            try Task.checkCancellation()
            matches = result.users
            pending.formUnion(result.pending ?? [])
            searching = false
        } catch { if !Task.isCancelled { searching = false; problem = "Member search couldn’t load." } }
    }

    private func invite(_ person: MessagePerson) async {
        guard sending.insert(person.id).inserted else { return }
        defer { sending.remove(person.id) }
        do {
            try await api.save(.init(action: "invite", user: person.id.uuidString.lowercased()))
            pending.insert(person.id)
            problem = nil
        } catch { problem = "Invitation couldn’t be confirmed." }
    }
}
