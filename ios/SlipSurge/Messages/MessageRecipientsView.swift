import SwiftUI

struct MessageRecipientsView: View {
    let api: MessagesAPI
    var forward: ((MessageDestination) async throws -> Void)?
    let onOpen: (MessageDestination) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var group = false
    @State private var name = ""
    @State private var query = ""
    @State private var matching: [MessagePerson] = []
    @State private var selected: [MessagePerson] = []
    @State private var working = false
    @State private var searchFailed = false
    @State private var createFailed = false
    @State private var forwardTarget: MessagePerson?
    @State private var forwardFailed = false

    var body: some View {
        NavigationStack {
            List {
                if forward == nil {
                    Picker("Conversation type", selection: $group) {
                        Text("Direct message").tag(false)
                        Text("Group").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Brand.surface(for: scheme))
                }
                if group {
                    Section {
                        TextField("Group name", text: $name)
                            .onChange(of: name) { _, value in if value.count > 64 { name = String(value.prefix(64)) } }
                        ForEach(selected) { person in
                            Button(role: .destructive) { selected.removeAll { $0.id == person.id } } label: {
                                HStack {
                                    RecipientLabel(person: person)
                                    Spacer()
                                    Image(systemName: "xmark.circle")
                                }
                            }
                            .accessibilityHint("Remove \(person.name)")
                        }
                    } header: { Text("\(selected.count) of 19 selected") }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                Section {
                    TextField("Search people", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: query) { _, value in if value.count > 64 { query = String(value.prefix(64)) } }
                    ForEach(matching) { person in
                        let included = selected.contains { $0.id == person.id }
                        Button {
                            if group {
                                if included { selected.removeAll { $0.id == person.id } }
                                else if selected.count < 19 { selected.append(person) }
                            } else if forward != nil {
                                forwardTarget = person
                            } else {
                                onOpen(.init(kind: .direct, id: person.id))
                            }
                        } label: {
                            HStack {
                                RecipientLabel(person: person)
                                if group {
                                    Spacer()
                                    Image(systemName: included ? "checkmark.circle.fill" : "circle")
                                }
                            }
                        }
                        .accessibilityAddTraits(included ? .isSelected : [])
                        .disabled(working)
                    }
                    if searchFailed { Text("Search is temporarily unavailable").font(.subheadline).foregroundStyle(.secondary) }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .navigationTitle(forward == nil ? "New message" : "Forward message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(working) }
                if group {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") { Task { await create() } }
                            .disabled(working || selected.count < 2 || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .alert("Group couldn’t be created", isPresented: $createFailed) { Button("OK", role: .cancel) {} }
            .alert("Message forwarding couldn’t be confirmed", isPresented: $forwardFailed) { Button("OK", role: .cancel) {} }
            .confirmationDialog("Forward this message?", isPresented: Binding(get: { forwardTarget != nil }, set: { if !$0 { forwardTarget = nil } }),
                titleVisibility: .visible, presenting: forwardTarget) { person in
                    Button("Forward to \(person.name)") { Task { await sendForward(person) } }
                }
            .task(id: query) { await search(query) }
        }
    }

    private func search(_ term: String) async {
        searchFailed = false
        matching = []
        guard term.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else { return }
        do {
            try await Task.sleep(for: .milliseconds(250))
            let people = try await api.search(term)
            if !Task.isCancelled, term == query { matching = people }
        } catch {
            if !Task.isCancelled, term == query { searchFailed = true }
        }
    }

    private func create() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do { onOpen(try await api.createGroup(name, users: selected.map(\.id))) }
        catch { createFailed = true }
    }

    private func sendForward(_ person: MessagePerson) async {
        guard !working, let forward else { return }
        working = true
        defer { working = false }
        let destination = MessageDestination(kind: .direct, id: person.id)
        do { try await forward(destination); onOpen(destination) }
        catch { forwardFailed = true }
    }
}

struct RecipientLabel: View {
    let person: MessagePerson

    var body: some View {
        HStack(spacing: 10) {
            MessageAvatar(person: person, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(verbatim: person.name).font(.subheadline.weight(.semibold))
                    if person.isVerified == true {
                        Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified")
                    }
                }
                Text("@\(person.username)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(.primary)
        .accessibilityElement(children: .combine)
    }
}
