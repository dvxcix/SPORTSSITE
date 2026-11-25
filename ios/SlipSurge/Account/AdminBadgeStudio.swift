import SwiftUI

private struct BadgeStudioAPI {
    struct Badge: Decodable, Identifiable {
        struct Count: Decodable { let count: Int }
        let id: UUID
        let name: String
        let description: String
        let iconUrl: String
        let cardImageUrl: String?
        let userBadges: [Count]?
        var icon: URL? { URL(string: iconUrl).flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
        var card: URL? { cardImageUrl.flatMap(URL.init(string:)).flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
    }

    struct Person: Decodable, Identifiable {
        let id: UUID
        let username: String?
        let displayName: String?
        let avatarUrl: URL?
        var name: String { displayName ?? username ?? "SlipSurge member" }
    }

    struct ListPage: Decodable { let badges: [Badge]; let next: Int? }
    struct Members: Decodable { let members: [Person]; let next: Int? }
    struct Receipt: Decodable { let id: UUID; let awarded: Int? }

    let viewer: DiscoverAPI
    private let path = "/api/mobile/admin/badges"

    func badges(offset: Int = 0) async throws -> ListPage {
        try await viewer.readPublic(ListPage.self, path: path, query: [.init(name: "offset", value: String(offset))])
    }

    func members(_ badge: UUID, offset: Int = 0) async throws -> Members {
        try await viewer.readPublic(Members.self, path: path, query: query("members", badge) + [.init(name: "offset", value: String(offset))])
    }

    func search(_ term: String, badge: UUID) async throws -> [Person] {
        try await viewer.readPublic(Members.self, path: path, query: query("search", badge) + [.init(name: "q", value: term)]).members
    }

    func eligible(_ badge: UUID) async throws -> [UUID] {
        struct Eligibility: Decodable { let eligible: [UUID] }
        return try await viewer.readPublic(Eligibility.self, path: path, query: query("bulk", badge)).eligible
    }

    func send<Payload: Encodable>(_ payload: Payload, id: UUID) async throws -> Receipt {
        let receipt = try await viewer.write(Receipt.self, path: path, body: payload)
        guard receipt.id == id else { throw URLError(.badServerResponse) }
        return receipt
    }

    private func query(_ view: String, _ id: UUID) -> [URLQueryItem] {
        [.init(name: "view", value: view), .init(name: "id", value: id.uuidString.lowercased())]
    }
}

struct AdminBadgeStudio: View {
    let viewer: DiscoverAPI
    private struct Editor: Identifiable { let id = UUID(); var badge: BadgeStudioAPI.Badge? }
    @Environment(\.colorScheme) private var scheme
    @State private var badges: [BadgeStudioAPI.Badge]?
    @State private var next: Int?
    @State private var issue: (any Error)?
    @State private var edit: Editor?
    @State private var removing: BadgeStudioAPI.Badge?
    @State private var revision = 0
    @State private var working = false
    @State private var error = false

    private var api: BadgeStudioAPI { .init(viewer: viewer) }

    var body: some View {
        List {
            if let badges {
                if badges.isEmpty { ContentUnavailableView("No badges yet", systemImage: "rosette") }
                ForEach(badges) { badge in
                    HStack(spacing: 10) {
                        ResearchArtwork(urls: [badge.icon].compactMap { $0 }, fallback: "rosette").frame(width: 38, height: 38)
                        NavigationLink {
                            AdminBadgeMembers(api: api, badge: badge)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(badge.name).font(.headline)
                                Text(badge.description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                if let count = badge.userBadges?.first?.count { Text("\(count) members").font(.caption2).foregroundStyle(.secondary) }
                            }
                        }
                        Menu("Badge actions", systemImage: "ellipsis") {
                            Button("Edit badge", systemImage: "pencil") { edit = .init(badge: badge) }
                            Button("Delete badge", systemImage: "trash", role: .destructive) { removing = badge }
                        }
                        .labelStyle(.iconOnly).disabled(working)
                    }
                }
                if let next {
                    Button("More badges") { Task { await load(offset: next) } }.disabled(working)
                }
            } else {
                ResearchToolMessage(title: "Badges couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .navigationTitle("Badge studio")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("New badge", systemImage: "plus") { edit = .init() } } }
        .sheet(item: $edit) { context in
            NavigationStack { BadgeEditor(api: api, badge: context.badge) { revision += 1 } }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .confirmationDialog("Delete \(removing?.name ?? "this badge")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { badge in
                Button("Delete badge", role: .destructive) { Task { await remove(badge.id) } }
            } message: { _ in Text("Deleting this badge removes it from every member who has it.") }
        .alert("Badge deletion couldn’t be confirmed", isPresented: $error) { Button("Close", role: .cancel) {} }
    }

    private func load(offset: Int = 0) async {
        do {
            let result = try await api.badges(offset: offset)
            guard !Task.isCancelled, offset == 0 || offset == next else { return }
            let current = offset == 0 ? [] : badges ?? []
            let ids = Set(current.map(\.id))
            badges = current + result.badges.filter { !ids.contains($0.id) }
            next = result.next
            issue = nil
        } catch { if !Task.isCancelled { issue = error } }
    }

    private func remove(_ id: UUID) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            _ = try await api.send(["id": id.uuidString.lowercased(), "action": "delete"], id: id)
            await load()
        } catch { self.error = true }
    }
}

private struct BadgeEditor: View {
    let api: BadgeStudioAPI
    let badge: BadgeStudioAPI.Badge?
    let saved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var identifier = UUID()
    @State private var name = ""
    @State private var description = ""
    @State private var icon: URL?
    @State private var card: URL?
    @State private var iconUploading = false
    @State private var cardUploading = false
    @State private var removeCard = false
    @State private var working = false
    @State private var problem: String?

    private struct Write: Encodable {
        struct Existing: Encodable {
            let name: String; let description: String; let icon: String; let card: String?
            enum CodingKeys: CodingKey { case name, description, icon, card }
            func encode(to encoder: any Encoder) throws {
                var fields = encoder.container(keyedBy: CodingKeys.self)
                try fields.encode(name, forKey: .name)
                try fields.encode(description, forKey: .description)
                try fields.encode(icon, forKey: .icon)
                try fields.encode(card, forKey: .card)
            }
        }
        let id: String; let action: String; let name: String; let description: String
        let icon: URL?; let card: URL?; let removeCard: Bool; let expected: Existing?
    }

    var body: some View {
        Form {
            Section("Badge details") {
                TextField("Name", text: $name)
                TextField("Description", text: $description, axis: .vertical).lineLimit(2...5)
            }
            if let userID = api.viewer.userID {
                Section("Artwork") {
                    NativePhotoPicker(title: "Choose icon", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .badges, account: api.viewer.account, userID: userID)
                    }, url: $icon, uploading: $iconUploading)
                    if let url = icon ?? badge?.icon { ResearchArtwork(urls: [url], fallback: "rosette").frame(height: 62) }
                    NativePhotoPicker(title: "Choose badge card", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .badgeCards, account: api.viewer.account, userID: userID)
                    }, url: $card, uploading: $cardUploading)
                    if !removeCard, let url = card ?? badge?.card {
                        ResearchArtwork(urls: [url], fallback: "photo").frame(height: 115)
                        Button("Remove card", role: .destructive) { card = nil; removeCard = true }
                    }
                }
            }
            if let problem { Text(problem).foregroundStyle(.secondary) }
        }
        .navigationTitle(badge == nil ? "New badge" : "Edit badge")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(working) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .disabled(working || iconUploading || cardUploading || name.isEmpty || description.isEmpty || badge == nil && icon == nil)
            }
        }
        .onAppear { if let badge { name = badge.name; description = badge.description } }
        .onChange(of: card) { _, value in if value != nil { removeCard = false } }
        .interactiveDismissDisabled(working)
    }

    private func save() async {
        working = true
        defer { working = false }
        let id = badge?.id ?? identifier
        let input = Write(id: id.uuidString.lowercased(), action: badge == nil ? "create" : "edit", name: name,
            description: description, icon: icon, card: card, removeCard: removeCard,
            expected: badge.map { .init(name: $0.name, description: $0.description, icon: $0.iconUrl, card: $0.cardImageUrl) })
        do {
            _ = try await api.send(input, id: id)
            saved()
            dismiss()
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            problem = "The badge changed or the name is already in use. Reload before trying again."
        } catch { problem = "The badge couldn’t be saved. Check its details and artwork." }
    }
}

private struct AdminBadgeMembers: View {
    let api: BadgeStudioAPI
    let badge: BadgeStudioAPI.Badge
    @State private var members: [BadgeStudioAPI.Person] = []
    @State private var matches: [BadgeStudioAPI.Person] = []
    @State private var next: Int?
    @State private var query = ""
    @State private var eligible: [UUID] = []
    @State private var bulk = false
    @State private var revoking: BadgeStudioAPI.Person?
    @State private var working = false
    @State private var problem: String?

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
                Section("Award to a member") {
                    if matches.isEmpty { Text("No eligible members found").foregroundStyle(.secondary) }
                    ForEach(matches) { person in
                        Button { Task { await change("award", member: person.id) } } label: { personLabel(person, action: "plus.circle") }
                            .disabled(working)
                    }
                }
            } else {
                Section("Current members") {
                    if members.isEmpty { Text("No assignments yet").foregroundStyle(.secondary) }
                    ForEach(members) { person in
                        Button(role: .destructive) { revoking = person } label: { personLabel(person, action: "minus.circle") }
                            .disabled(working)
                    }
                    if let next { Button("More members") { Task { await load(offset: next) } }.disabled(working) }
                }
            }
            Section {
                Button("Award to eligible members", systemImage: "person.3") { Task { await prepareBulk() } }.disabled(working)
            }
            if let problem { Text(problem).font(.subheadline).foregroundStyle(.secondary) }
        }
        .navigationTitle(badge.name)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search members to award")
        .task { await load() }
        .refreshable { await load() }
        .task(id: query) { await search() }
        .confirmationDialog("Award this badge to \(eligible.count) members?", isPresented: $bulk, titleVisibility: .visible) {
            Button("Award badge") { Task { await change("awardBulk", member: nil) } }
        } message: {
            Text("This award applies to the current selection. Future sign-ups won’t receive it automatically.")
        }
        .confirmationDialog("Remove this badge from \(revoking?.name ?? "this member")?",
            isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
            titleVisibility: .visible, presenting: revoking) { person in
                Button("Remove badge", role: .destructive) { Task { await change("revoke", member: person.id) } }
            }
    }

    private func personLabel(_ person: BadgeStudioAPI.Person, action: String) -> some View {
        HStack(spacing: 9) {
            ResearchArtwork(urls: [person.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                .frame(width: 34, height: 34).clipShape(.circle)
            Text(person.name)
            Spacer()
            Image(systemName: action)
        }
    }

    private func load(offset: Int = 0) async {
        do {
            let result = try await api.members(badge.id, offset: offset)
            guard !Task.isCancelled, offset == 0 || offset == next else { return }
            let prior = offset == 0 ? [] : members
            let ids = Set(prior.map(\.id))
            members = prior + result.members.filter { !ids.contains($0.id) }
            next = result.next
        } catch { if !Task.isCancelled { problem = "Assigned members couldn’t load." } }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.count >= 2 else { matches = []; return }
        do {
            try await Task.sleep(for: .milliseconds(240))
            let result = try await api.search(term, badge: badge.id)
            guard !Task.isCancelled, term == query.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            matches = result
        } catch { if !Task.isCancelled { problem = "Member search couldn’t load." } }
    }

    private func prepareBulk() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            eligible = try await api.eligible(badge.id)
            if eligible.isEmpty { problem = "There are no remaining eligible members." }
            else { bulk = true }
        } catch { problem = "Eligible members couldn’t load." }
    }

    private func change(_ action: String, member: UUID?) async {
        struct Write: Encodable { let action: String; let id: String; let member: String?; let members: [String]? }
        guard !working else { return }
        working = true
        defer { working = false }
        let payload = Write(action: action, id: badge.id.uuidString.lowercased(), member: member?.uuidString.lowercased(),
            members: action == "awardBulk" ? eligible.map { $0.uuidString.lowercased() } : nil)
        do {
            let receipt = try await api.send(payload, id: badge.id)
            problem = action == "awardBulk" ? "Awarded to \(receipt.awarded ?? 0) members." : nil
            if let member { matches.removeAll { $0.id == member } }
            await load()
        } catch { problem = "This assignment couldn’t be confirmed." }
    }
}
