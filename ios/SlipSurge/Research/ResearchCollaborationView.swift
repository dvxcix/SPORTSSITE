import SwiftUI

struct ResearchCollaborationView: View {
    let api: ResearchLibraryAPI
    let workspace: ResearchLibraryData.Workspace
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var snapshot: ResearchCollaborationData?
    @State private var error: (any Error)?
    @State private var query = ""
    @State private var suggestions: [MessagePerson] = []
    @State private var candidate: MessagePerson?
    @State private var role = Role.viewer
    @State private var bodyText = ""
    @State private var attempted: (id: UUID, text: String)?
    @State private var busy = false
    @State private var failed = false
    @State private var removing: ResearchCollaborationData.Member?

    private enum Role: String, CaseIterable {
        case viewer, editor
        var title: String { self == .viewer ? "Can view" : "Can edit" }
    }

    private var workspaceKey: String { workspace.id.uuidString.lowercased() }

    var body: some View {
        List {
            if let snapshot {
                if snapshot.owner { invite(snapshot) }
                members(snapshot)
                discussion(snapshot)
            } else {
                ResearchToolMessage(title: "Collaboration couldn’t load", error: error) { Task { await refresh() } }
                    .listRowBackground(slipPalette.surface)
            }
        }
        .navigationTitle("Collaborate")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task {
            await refresh()
            while !Task.isCancelled {
                if phase == .active {
                    try? await api.mutate(.init(kind: "heartbeat", id: workspaceKey))
                    await refresh()
                }
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
        .task(id: query) { await search(query) }
        .refreshable { await refresh() }
        .alert("Workspace change couldn’t be confirmed", isPresented: $failed) { Button("OK", role: .cancel) {} }
        .confirmationDialog("Remove workspace access?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), presenting: removing) { person in
            Button(person.userId == api.userID ? "Leave workspace" : "Remove access", role: .destructive) {
                Task {
                    if await mutate(.init(kind: "remove", id: workspaceKey, user: person.userId.uuidString.lowercased())), person.userId == api.userID { dismiss() }
                }
            }
        }
    }

    private func invite(_ snapshot: ResearchCollaborationData) -> some View {
        Section("Invite a member") {
            TextField("Search people", text: $query)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .onChange(of: query) { _, value in if value != candidate?.username { candidate = nil } }
            if let candidate {
                RecipientLabel(person: candidate)
            } else {
                ForEach(suggestions.filter { candidate in !snapshot.members.contains { $0.userId == candidate.id } }) { person in
                    Button { candidate = person; query = person.username } label: { RecipientLabel(person: person) }
                }
            }
            Picker("Workspace role", selection: $role) { ForEach(Role.allCases, id: \.self) { Text($0.title).tag($0) } }
            Button("Add member", systemImage: "person.badge.plus") {
                Task {
                    if await mutate(.init(kind: "invite", id: workspaceKey, username: candidate?.username ?? query, role: role.rawValue)) {
                        candidate = nil; query = ""
                    }
                }
            }.disabled(busy || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }.listRowBackground(slipPalette.surface)
    }

    private func members(_ snapshot: ResearchCollaborationData) -> some View {
        Section("Members · \(snapshot.activeIds.count) active") {
            if snapshot.members.isEmpty { Text("No collaborators yet").foregroundStyle(.secondary) }
            ForEach(snapshot.members) { person in
                HStack(spacing: 8) {
                    avatar(person.users)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(person.users?.displayName ?? person.users?.username ?? "Member").font(.subheadline.bold())
                        Text(person.role == "editor" ? "Can edit" : "Can view").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if snapshot.activeIds.contains(person.userId) {
                        Circle().fill(slipPalette.accent).frame(width: 7, height: 7).accessibilityLabel("Active now")
                    }
                    if snapshot.owner || person.userId == api.userID {
                        Button("Remove", systemImage: "person.crop.circle.badge.minus", role: .destructive) { removing = person }
                            .buttonStyle(.borderless).labelStyle(.iconOnly)
                    }
                }
            }
        }.listRowBackground(slipPalette.surface)
    }

    private func discussion(_ snapshot: ResearchCollaborationData) -> some View {
        Section("Discussion") {
            TextField("Add a comment", text: $bodyText, axis: .vertical).lineLimit(2...5)
            Button("Post comment", systemImage: "arrow.up.circle.fill") { Task { await comment() } }
                .disabled(busy || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.utf16.count > 5_000)
            ForEach(snapshot.comments) { comment in
                HStack(alignment: .top, spacing: 9) {
                    avatar(comment.users)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(comment.users?.displayName ?? comment.users?.username ?? "Member").font(.subheadline.bold())
                            if let date = comment.createdAt.flatMap(SidelineBoard.timestamp) { Text(date, style: .relative).font(.caption).foregroundStyle(.secondary) }
                        }
                        Text(verbatim: comment.body).font(.subheadline)
                    }
                }
            }
        }.listRowBackground(slipPalette.surface)
    }

    private func avatar(_ person: ResearchCollaborationData.Person?) -> some View {
        let url = person?.avatarUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        return ResearchArtwork(urls: url.map { [$0] } ?? [], fallback: "person.crop.circle")
            .frame(width: 30, height: 30).clipShape(.circle)
    }

    private func refresh() async {
        do {
            let data = try await api.collaboration(workspace.id)
            if !Task.isCancelled { snapshot = data; error = nil }
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func search(_ term: String) async {
        suggestions = []
        guard snapshot?.owner == true, candidate == nil, term.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else { return }
        do {
            try await Task.sleep(for: .milliseconds(250))
            let matches = try await api.search(workspace.id, term: term)
            if !Task.isCancelled, term == query { suggestions = matches }
        } catch {
            if !Task.isCancelled, term == query { failed = true }
        }
    }

    private func mutate(_ action: ResearchLibraryAPI.Change) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        do { try await api.mutate(action); await refresh(); return true }
        catch { failed = true; return false }
    }

    private func comment() async {
        let text = bodyText
        let id = attempted?.text == text ? attempted?.id ?? UUID() : UUID()
        attempted = (id, text)
        if await mutate(.init(kind: "comment", id: workspaceKey, body: text, message: id.uuidString.lowercased())) {
            if bodyText == text { bodyText = "" }
            attempted = nil
        }
    }
}
