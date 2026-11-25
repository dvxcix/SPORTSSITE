import SwiftUI

struct AdminOperationsView: View {
    enum Mode: String {
        case audit, notifications, groups
        var title: String {
            switch self {
            case .audit: "Audit log"
            case .notifications: "Notification history"
            case .groups: "Manage communities"
            }
        }
    }

    private struct Identity: Decodable {
        let username: String?
        let displayName: String?
    }

    private struct AuditEvent: Decodable, Identifiable {
        let id: Int64
        let action: String
        let targetType: String
        let targetId: String?
        let details: String
        let requestId: String?
        let ipAddress: String?
        let createdAt: String
        let actor: Identity?
    }

    private struct Delivery: Decodable, Identifiable {
        let id: UUID
        let type: String
        let message: String?
        let body: String?
        let read: Bool?
        let createdAt: String
        let user: Identity?
        let actor: Identity?
    }

    private struct Community: Decodable, Identifiable {
        let id: UUID
        let name: String
        let slug: String
        let ownerId: UUID?
        let sport: String?
        let emoji: String?
        let avatarUrl: URL?
        let isPublic: Bool?
        let accessType: String?
        let memberCount: Int?
        let owner: Identity?
    }

    private struct Index: Decodable {
        let events: [AuditEvent]?
        let actions: [String]?
        let notifications: [Delivery]?
        let groups: [Community]?
    }

    private struct Selection: Equatable { let query: String; let filter: String; let from: Date?; let to: Date?; let revision: Int }

    let viewer: DiscoverAPI
    let mode: Mode
    var ownerID: UUID?
    @Environment(\.colorScheme) private var scheme
    @State private var index: Index?
    @State private var query = ""
    @State private var filter = ""
    @State private var from: Date?
    @State private var to: Date?
    @State private var issue: (any Error)?
    @State private var filters = false
    @State private var deleting: Community?
    @State private var selectedGroup: UUID?
    @State private var member: String?
    @State private var busy = false
    @State private var removeFailed = false
    @State private var revision = 0
    @State private var version = 0

    private let path = "/api/mobile/admin/operations"
    private let notificationTypes = ["follow", "reaction", "comment", "mention", "pick_result", "subscription", "message", "repost", "group_invite", "new_pick"]
    private var request: Selection { .init(query: query, filter: filter, from: from, to: to, revision: revision) }

    var body: some View {
        Group {
            if mode == .groups { records }
            else { records.searchable(text: $query, prompt: mode == .audit ? "Action, target or request ID" : "Recipient or actor") }
        }
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if mode != .groups {
                ToolbarItem(placement: .topBarTrailing) { Button("Filters", systemImage: "line.3.horizontal.decrease") { filters = true } }
            }
        }
        .task(id: request) {
            if !query.isEmpty { do { try await Task.sleep(for: .milliseconds(250)) } catch { return } }
            await load()
        }
        .refreshable { await load() }
        .sheet(isPresented: $filters) { NavigationStack { filterForm } }
        .navigationDestination(item: $member) { MemberProfileView(api: viewer, target: $0) }
        .navigationDestination(item: $selectedGroup) { id in
            AdminCommunityDestination(viewer: viewer, id: id, name: index?.groups?.first { $0.id == id }?.name ?? "Community")
        }
        .confirmationDialog("Delete \(deleting?.name ?? "this community")?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { group in
                Button("Delete community", role: .destructive) { Task { await delete(group.id) } }
            } message: { _ in Text("This removes the community permanently.") }
        .alert("Community deletion couldn’t be confirmed", isPresented: $removeFailed) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private var records: some View {
        List {
            if let index {
                switch mode {
                case .audit:
                    if index.events?.isEmpty != false { ContentUnavailableView("No audit events match", systemImage: "list.bullet.rectangle") }
                    ForEach(index.events ?? []) { event in auditRow(event) }
                case .notifications:
                    if index.notifications?.isEmpty != false { ContentUnavailableView("No notifications match", systemImage: "bell") }
                    ForEach(index.notifications ?? []) { item in notificationRow(item) }
                case .groups:
                    if index.groups?.isEmpty != false { ContentUnavailableView("No communities yet", systemImage: "person.3") }
                    ForEach(index.groups ?? []) { group in communityRow(group) }
                }
            } else {
                ResearchToolMessage(title: "\(mode.title) couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
    }

    private func auditRow(_ event: AuditEvent) -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 7) {
                if let target = event.targetId { LabeledContent("Target", value: target).textSelection(.enabled) }
                if let request = event.requestId { LabeledContent("Request", value: request).textSelection(.enabled) }
                if let ip = event.ipAddress { LabeledContent("IP address", value: ip).textSelection(.enabled) }
                if event.details != "{}" { Text(event.details).font(.caption.monospaced()).textSelection(.enabled) }
            }
            .font(.footnote)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(event.action).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                Text("\(event.actor?.displayName ?? event.actor?.username ?? "System") · \(event.targetType)")
                    .font(.caption).foregroundStyle(.secondary)
                if let date = SidelineBoard.timestamp(event.createdAt) { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption2) }
            }
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    private func notificationRow(_ item: Delivery) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: item.read == true ? "circle" : "circle.fill")
                .font(.caption2).foregroundStyle(item.read == true ? .secondary : Brand.accent(for: scheme))
                .padding(.top, 5).accessibilityLabel(item.read == true ? "Read" : "Unread")
            VStack(alignment: .leading, spacing: 4) {
                Text(displayName(item.type)).font(.subheadline.bold())
                Text("\(item.actor?.username.map { "@\($0)" } ?? "System") → \(item.user?.username.map { "@\($0)" } ?? "Member")")
                    .font(.caption).foregroundStyle(.secondary)
                if let body = item.message ?? item.body, !body.isEmpty { Text(body).font(.subheadline) }
                if let date = SidelineBoard.timestamp(item.createdAt) { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption2) }
            }
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    private func communityRow(_ group: Community) -> some View {
        HStack(alignment: .center, spacing: 9) {
            if let image = group.avatarUrl, FeedPostCard.allowedMedia(image) {
                ResearchArtwork(urls: [image], fallback: "person.3").frame(width: 40, height: 40).clipShape(.circle)
            } else { Text(group.emoji ?? "💬").frame(width: 40, height: 40) }
            Button { selectedGroup = group.id } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 5) {
                        Text(group.name).font(.subheadline.bold())
                        if let sport = group.sport, let logo = LeagueArtwork.logo(sport) {
                            ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 18, height: 18)
                        }
                    }
                    Text(group.accessType == "paid" ? "Paid" : (group.isPublic == true ? "Free · public" : "Free · private"))
                        .font(.caption).foregroundStyle(.secondary)
                    Text("\((group.memberCount ?? 0).formatted()) members").font(.caption2).foregroundStyle(.secondary)
                }
            }.buttonStyle(SlipSurgePressStyle())
            Spacer()
            Menu("Community actions", systemImage: "ellipsis") {
                if let owner = group.owner?.username {
                    Button("Open owner profile", systemImage: "person.crop.circle") { member = owner }
                }
                Button("Delete community", systemImage: "trash", role: .destructive) { deleting = group }
            }.labelStyle(.iconOnly).disabled(busy)
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    private var filterForm: some View {
        Form {
            Picker(mode == .audit ? "Action" : "Type", selection: $filter) {
                Text(mode == .audit ? "All actions" : "All types").tag("")
                ForEach(mode == .audit ? index?.actions ?? [] : notificationTypes, id: \.self) { option in
                    Text(mode == .audit ? option : displayName(option)).tag(option)
                }
            }
            if mode == .notifications {
                dateField("From", date: $from)
                dateField("To", date: $to)
            }
            Button("Clear filters") { filter = ""; query = ""; from = nil; to = nil }
        }
        .navigationTitle("Filters")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { filters = false } } }
    }

    private func dateField(_ title: String, date: Binding<Date?>) -> some View {
        Group {
            if date.wrappedValue == nil {
                Button("Add \(title.lowercased()) date", systemImage: "calendar") { date.wrappedValue = .now }
            } else {
                DatePicker(title, selection: Binding(get: { date.wrappedValue ?? .now }, set: { date.wrappedValue = $0 }), displayedComponents: .date)
                Button("Clear \(title.lowercased()) date") { date.wrappedValue = nil }
            }
        }
        .environment(\.timeZone, TimeZone(secondsFromGMT: 0) ?? .current)
    }

    private func displayName(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }

    private func load() async {
        version += 1
        let current = version
        var params: [URLQueryItem] = [.init(name: "kind", value: mode.rawValue)]
        if let ownerID, mode == .groups { params.append(.init(name: "owner", value: ownerID.uuidString.lowercased())) }
        if mode != .groups, !query.isEmpty { params.append(.init(name: "q", value: query)) }
        if !filter.isEmpty { params.append(.init(name: mode == .audit ? "action" : "type", value: filter)) }
        if mode == .notifications {
            let format = Date.ISO8601FormatStyle(timeZone: TimeZone(secondsFromGMT: 0) ?? .current).year().month().day().dateSeparator(.dash)
            if let from { params.append(.init(name: "from", value: from.formatted(format))) }
            if let to { params.append(.init(name: "to", value: to.formatted(format))) }
        }
        do {
            let results = try await viewer.readPublic(Index.self, path: path, query: params)
            guard !Task.isCancelled, current == version else { return }
            index = results
            issue = nil
        } catch {
            if !Task.isCancelled, current == version { index = nil; issue = error }
        }
    }

    private func delete(_ id: UUID) async {
        guard !busy, let userID = viewer.userID else { return }
        busy = true
        defer { busy = false }
        do {
            struct Receipt: Decodable { let id: UUID }
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path,
                query: [.init(name: "kind", value: "groups"), .init(name: "id", value: id.uuidString.lowercased())])
            request.httpMethod = "DELETE"
            request.setValue("Bearer \(try await viewer.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
            let removed = try JSONDecoder().decode(Receipt.self, from: await SlipSurgeHTTP.send(request))
            guard removed.id == id else { throw URLError(.badServerResponse) }
            await load()
        } catch { removeFailed = true }
    }
}

private struct AdminCommunityDestination: View {
    let viewer: DiscoverAPI
    let id: UUID
    let name: String
    @State private var directory: DiscoverAPI.Communities?
    @State private var issue: (any Error)?

    var body: some View {
        Group {
            if let directory {
                if let group = (directory.groups + directory.invitations).first(where: { $0.id == id }) {
                    CommunityDetailView(api: viewer, group: group, initialMember: directory.joinedIds.contains(id))
                } else {
                    ContentUnavailableView("Community posts unavailable", systemImage: "lock",
                        description: Text("This account does not have access to this community’s feed."))
                }
            } else {
                ResearchToolMessage(title: "Community couldn’t load", error: issue) { Task { await load() } }
            }
        }
        .navigationTitle(name)
        .task { await load() }
    }

    private func load() async {
        do { directory = try await viewer.read(DiscoverAPI.Communities.self, resource: "communities") }
        catch { if !Task.isCancelled { issue = error } }
    }
}
