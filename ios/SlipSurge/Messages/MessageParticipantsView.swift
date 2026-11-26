import SwiftUI

struct MessageParticipantsView: View {
    let api: MessagesAPI
    let destination: MessageDestination
    let initial: MessageThread
    let onChange: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var updated: MessageThread?
    @State private var query = ""
    @State private var matches: [MessagePerson] = []
    @State private var removing: MessagePerson?
    @State private var busy = false
    @State private var failure = false

    private var thread: MessageThread { updated ?? initial }

    var body: some View {
        NavigationStack {
            List {
                Section("Participants") {
                    ForEach(thread.members) { member in
                        if let person = member.user {
                            HStack {
                                RecipientLabel(person: person)
                                Spacer()
                                if member.role == "owner" { Text("Owner").font(.caption).foregroundStyle(.secondary) }
                                else if thread.owner {
                                    Button("Remove", systemImage: "person.crop.circle.badge.minus", role: .destructive) { removing = person }
                                        .labelStyle(.iconOnly).buttonStyle(.borderless).disabled(busy)
                                }
                            }
                        }
                    }
                }
                .listRowBackground(slipPalette.surface)
                if thread.owner {
                    Section("Add someone") {
                        TextField("Search people", text: $query)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        ForEach(matches.filter { person in !thread.members.contains { $0.id == person.id } }) { person in
                            Button { Task { await update(person, action: "add") } } label: {
                                HStack {
                                    RecipientLabel(person: person)
                                    Spacer()
                                    Image(systemName: "plus.circle")
                                }
                            }
                            .disabled(busy)
                        }
                    }
                    .listRowBackground(slipPalette.surface)
                }
            }
            .navigationTitle("Participants")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(slipPalette.background)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
            }
            .task(id: query) { await search(query) }
            .confirmationDialog("Remove this participant?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), presenting: removing) { person in
                Button("Remove \(person.name)", role: .destructive) { Task { await update(person, action: "remove") } }
            }
            .alert("Participants couldn’t be updated", isPresented: $failure) { Button("OK", role: .cancel) {} }
        }
    }

    private func search(_ term: String) async {
        matches = []
        guard term.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else { return }
        do {
            try await Task.sleep(for: .milliseconds(250))
            let results = try await api.search(term)
            if !Task.isCancelled, term == query { matches = results }
        } catch {
            if !Task.isCancelled, term == query { failure = true }
        }
    }

    private func update(_ person: MessagePerson, action: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.change(.init(action: "member", status: action, user: person.id.uuidString.lowercased()), in: destination)
            updated = try await api.thread(destination)
            query = ""
            await onChange()
        } catch { failure = true }
    }
}
