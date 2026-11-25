import SwiftUI

enum AdminQueue: String, CaseIterable {
    case reports, applications, deletions

    var title: String {
        switch self {
        case .reports: "Moderation reports"
        case .applications: "Creator applications"
        case .deletions: "Deletion requests"
        }
    }

    var icon: String {
        switch self {
        case .reports: "flag"
        case .applications: "person.crop.rectangle"
        case .deletions: "trash"
        }
    }

    var statuses: [String] {
        switch self {
        case .reports: ["pending", "actioned", "dismissed"]
        case .applications: ["pending", "approved", "rejected"]
        case .deletions: ["pending", "reviewing", "blocked", "scheduled", "completed", "canceled"]
        }
    }
}

struct AdminQueueRecord: Decodable, Identifiable {
    struct Person: Decodable {
        let username: String?
        let displayName: String?
        let avatarUrl: URL?
        let email: String?
        let tier: String?
        let accountType: String?
        let creatorCommerceStatus: String?
    }

    let id: UUID
    let userId: UUID?
    let status: String
    let reason: String?
    let details: String?
    let targetType: String?
    let targetId: UUID?
    let whyCreator: String?
    let rejectionReason: String?
    let resolutionNote: String?
    let createdAt: String?
    let requestedAt: String?
    let scheduledFor: String?
    let linkedPostId: UUID?
    let linkedUsername: String?
    let preview: String?
    let person: Person?

    var name: String { person?.displayName ?? person?.username ?? "Member" }
    var date: Date? { (requestedAt ?? createdAt).flatMap(SidelineBoard.timestamp) }
    var context: String? { whyCreator ?? details ?? reason }
}

struct AdminQueueView: View {
    let account: AccountStore
    let userID: UUID
    let queue: AdminQueue

    @Environment(\.colorScheme) private var scheme
    @State private var rows: [AdminQueueRecord]?
    @State private var status = "pending"
    @State private var kind = ""
    @State private var search = ""
    @State private var more = false
    @State private var page = 0
    @State private var loading = false
    @State private var error: (any Error)?
    @State private var revision = 0

    private struct Filters: Equatable { let status: String; let kind: String; let revision: Int }
    private struct Result: Decodable { let rows: [AdminQueueRecord]; let hasMore: Bool }

    var body: some View {
        List {
            Section {
                Picker("Status", selection: $status) {
                    Text("All statuses").tag("")
                    ForEach(queue.statuses, id: \.self) { Text($0.capitalized).tag($0) }
                }
                if queue == .reports {
                    Picker("Content", selection: $kind) {
                        Text("All content").tag("")
                        ForEach(["post", "user", "comment", "blog", "event", "page"], id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }
            }.listRowBackground(Brand.surface(for: scheme))
            if let rows {
                let visible = rows.filter { entry in
                    search.isEmpty || [entry.name, entry.person?.username, entry.reason, entry.preview].compactMap { $0 }
                        .contains { $0.localizedStandardContains(search) }
                }
                ForEach(visible) { entry in
                    NavigationLink {
                        AdminQueueDetailView(account: account, userID: userID, queue: queue, entry: entry) { revision += 1 }
                    } label: { row(entry) }
                }.listRowBackground(Brand.surface(for: scheme))
                if visible.isEmpty { ContentUnavailableView("No matching entries", systemImage: queue.icon) }
                if more {
                    Button("Load more") { Task { await load(append: true) } }.disabled(loading)
                }
            } else {
                ResearchToolMessage(title: "Queue couldn’t load", error: error) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(queue.title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: queue == .reports ? "Reporter or reason" : "Member")
        .task(id: Filters(status: status, kind: kind, revision: revision)) { await load() }
        .refreshable { await load() }
    }

    private func row(_ entry: AdminQueueRecord) -> some View {
        HStack(spacing: 11) {
            ResearchArtwork(urls: entry.person?.avatarUrl.map { [$0] } ?? [], fallback: queue.icon)
                .frame(width: 27, height: 27).clipShape(.circle)
            VStack(alignment: .leading, spacing: 4) {
                Text(queue == .reports ? entry.reason ?? "Report" : entry.name).font(.subheadline.weight(.semibold))
                if let date = entry.date { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(entry.status.capitalized).font(.caption.weight(.semibold))
                .foregroundStyle(entry.status == "pending" ? Brand.accent(for: scheme) : .secondary)
        }
    }

    private func load(append: Bool = false) async {
        if append && loading { return }
        let next = append ? page + 1 : 0
        let requestedStatus = status, requestedKind = kind, requestedRevision = revision
        loading = true
        defer {
            if status == requestedStatus && kind == requestedKind && revision == requestedRevision { loading = false }
        }
        if !append { rows = nil; more = false; error = nil }
        var query: [URLQueryItem] = [.init(name: "queue", value: queue.rawValue), .init(name: "page", value: String(next))]
        if !status.isEmpty { query.append(.init(name: "status", value: status)) }
        if !kind.isEmpty { query.append(.init(name: "kind", value: kind)) }
        do {
            let bytes = try await SlipSurgeHTTP.memberData("/api/mobile/admin/queues", query: query, account: account, userID: userID)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let data = try decoder.decode(Result.self, from: bytes)
            guard status == requestedStatus, kind == requestedKind, revision == requestedRevision else { return }
            let previous = append ? rows ?? [] : []
            let ids = Set(previous.map(\.id))
            rows = previous + data.rows.filter { !ids.contains($0.id) }
            more = data.hasMore
            page = next
        } catch { if !Task.isCancelled { self.error = error } }
    }
}
