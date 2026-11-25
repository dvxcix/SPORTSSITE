import SwiftUI

struct CommunityEventCreate: View {
    let api: CommunityEventsAPI
    let sports: [String]
    let created: (UUID) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draftID = UUID()
    @State private var title = ""
    @State private var description = ""
    @State private var location = ""
    @State private var sport = ""
    @State private var start = Date.now.addingTimeInterval(3_600)
    @State private var end = Date.now.addingTimeInterval(7_200)
    @State private var hasEnd = false
    @State private var online = false
    @State private var link = ""
    @State private var saving = false
    @State private var problem: String?

    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf16.count <= 100 &&
            description.utf16.count <= 1000 && location.utf16.count <= 500 &&
            (!hasEnd || end > start) && (!online || (link.utf16.count <= 500 && SiteAnnouncements.link(link)?.host != nil && !link.hasPrefix("/")))
    }

    var body: some View {
        Form {
            Section("Event") {
                TextField("Event title", text: $title)
                TextEditor(text: $description).frame(minHeight: 85).accessibilityLabel("Event description")
                Text("\(description.utf16.count) / 1,000").font(.caption).foregroundStyle(.secondary)
                ResearchArtworkPicker(title: "Sport", options: [.init(id: "", title: "General", icon: "calendar")] + sports.map { option in
                    .init(id: option, title: option == "Soccer" ? "Soccer" : LeagueArtwork.label(option),
                        url: LeagueArtwork.logo(option), icon: "sportscourt")
                }, selection: $sport)
            }
            Section("Date & Time") {
                DatePicker("Starts", selection: $start)
                Toggle("Add end time", isOn: $hasEnd)
                if hasEnd {
                    DatePicker("Ends", selection: $end)
                    if end <= start { Text("End time must be after the start time").font(.caption).foregroundStyle(.red) }
                }
            }
            Section("Place") {
                TextField("Address or venue", text: $location)
                Toggle("Online event", isOn: $online)
                if online {
                    TextField("Event link", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                }
            }
            if let problem { Section { Text(problem).font(.subheadline).foregroundStyle(.red) } }
        }
        .navigationTitle("Create Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(!valid || saving)
            }
        }
        .onChange(of: start) { _, date in
            if end <= date { end = date.addingTimeInterval(3_600) }
        }
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        guard valid, !saving else { return }
        saving = true
        problem = nil
        defer { saving = false }
        let form = CommunityEventsAPI.Draft(id: draftID, title: title, description: description, location: location,
            start: start.formatted(.iso8601), end: hasEnd ? end.formatted(.iso8601) : nil, sport: sport, online: online, link: link)
        do {
            let id = try await api.create(form)
            dismiss()
            created(id)
        } catch {
            struct Failure: Decodable { let error: String }
            if let status = error as? SlipSurgeHTTP.Status, let payload = try? JSONDecoder().decode(Failure.self, from: status.data) {
                problem = payload.error
            } else {
                problem = "The event couldn’t be created. Try again."
            }
        }
    }
}

struct AdminCommunityEventsView: View {
    let api: CommunityEventsAPI
    @State private var events: [CommunityEventsAPI.Event]?
    @State private var error: (any Error)?
    @State private var deletion: CommunityEventsAPI.Event?
    @State private var alert = false
    @State private var revision = 0

    var body: some View {
        List {
            if let events {
                if events.isEmpty {
                    ContentUnavailableView("No events yet", systemImage: "calendar")
                }
                ForEach(events) { event in
                    CommunityEventRow(event: event)
                        .swipeActions { Button("Delete", role: .destructive) { deletion = event } }
                        .contextMenu {
                            Button("Delete event", systemImage: "trash", role: .destructive) { deletion = event }
                        }
                }
            } else {
                ResearchToolMessage(title: "Events couldn’t load", error: error) { revision += 1 }
            }
        }
        .navigationTitle("Manage Events")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .confirmationDialog("Delete event?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }),
            titleVisibility: .visible, presenting: deletion) { item in
                Button("Delete", role: .destructive) {
                    Task {
                        do { try await api.remove(item.id); revision += 1 }
                        catch { alert = true }
                    }
                }
            } message: { item in Text("Delete “\(item.title)”?") }
        .alert("Event deletion couldn’t be confirmed", isPresented: $alert) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private func load() async {
        do {
            let current = try await api.administration()
            try Task.checkCancellation()
            events = current
            error = nil
        } catch { if !Task.isCancelled { self.error = error } }
    }
}
