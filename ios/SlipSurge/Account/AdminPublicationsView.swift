import SwiftUI

struct AdminPublicationsView: View {
    enum Kind: String {
        case articles, pages
        var title: String { self == .articles ? "Manage articles" : "Manage pages" }
        var image: String { self == .articles ? "book" : "rectangle.grid.2x2" }
    }

    private struct Entry: Identifiable, Decodable {
        struct Person: Decodable { let username: String?; let displayName: String? }
        let id: UUID
        let slug: String
        let name: String?
        let title: String?
        let emoji: String?
        let avatarUrl: String?
        let coverImage: String?
        let category: String?
        let sport: String?
        let status: String?
        let isPublished: Bool?
        let isVerified: Bool?
        let followerCount: Int?
        let viewCount: Int?
        let likeCount: Int?
        let createdAt: String?
        let person: Person?

        var label: String { name ?? title ?? slug }
        var artwork: URL? {
            (avatarUrl ?? coverImage).flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
        }
    }

    private struct Verification: Encodable {
        let id: String
        let verified: Bool
        let expected: Bool?
        private enum CodingKeys: CodingKey { case id, action, verified, expected }

        func encode(to encoder: any Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(id, forKey: .id)
            try values.encode("verify", forKey: .action)
            try values.encode(verified, forKey: .verified)
            try values.encode(expected, forKey: .expected)
        }
    }

    let viewer: DiscoverAPI
    let kind: Kind
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var entries: [Entry]?
    @State private var issue: (any Error)?
    @State private var actionIssue = false
    @State private var removing: Entry?
    @State private var pending = Set<UUID>()
    @State private var revision = 0

    private let path = "/api/mobile/admin/publications"
    private var query: [URLQueryItem] { [.init(name: "kind", value: kind.rawValue)] }

    var body: some View {
        List {
            if let entries {
                if entries.isEmpty { ContentUnavailableView("No \(kind.rawValue) to review", systemImage: kind.image) }
                ForEach(entries) { entry in row(entry) }
            } else {
                ResearchToolMessage(title: "Publications couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .confirmationDialog("Delete \(removing?.label ?? "this publication")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { entry in
                Button("Delete", role: .destructive) { Task { await mutate(entry, delete: true) } }
            }
        .alert("Change couldn’t be confirmed", isPresented: $actionIssue) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private func row(_ entry: Entry) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Group {
                if let artwork = entry.artwork { ResearchArtwork(urls: [artwork], fallback: kind.image) }
                else if let emoji = entry.emoji { Text(emoji).font(.title2) }
                else { Image(systemName: kind.image).foregroundStyle(slipPalette.accent) }
            }
            .frame(width: 40, height: 40)
            .background(slipPalette.accent.opacity(0.12), in: .rect(cornerRadius: 9))
            .clipShape(.rect(cornerRadius: 9))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 4) {
                    Text(entry.label).font(.subheadline.bold())
                    if entry.isVerified == true { Image(systemName: "checkmark.seal.fill").foregroundStyle(.blue).accessibilityLabel("Verified") }
                }
                if let person = entry.person, let name = person.displayName ?? person.username { Text(name).font(.caption).foregroundStyle(.secondary) }
                let published = entry.isPublished ?? (entry.status == "published")
                HStack(spacing: 5) {
                    if let sport = entry.sport, let logo = LeagueArtwork.logo(sport) {
                        ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 17, height: 17)
                    }
                    Text([entry.category, published ? "Published" : (entry.status?.capitalized ?? "Draft")].compactMap { $0 }.joined(separator: " · "))
                }
                .font(.caption).foregroundStyle(.secondary)
                if kind == .articles {
                    Text("\((entry.viewCount ?? 0).formatted()) views · \((entry.likeCount ?? 0).formatted()) likes")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("\((entry.followerCount ?? 0).formatted()) followers").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Menu("Publication actions", systemImage: "ellipsis") {
                if kind == .pages {
                    Button(entry.isVerified == true ? "Remove verification" : "Verify page", systemImage: "checkmark.seal") {
                        Task { await mutate(entry, delete: false) }
                    }
                }
                Button("Delete", systemImage: "trash", role: .destructive) { removing = entry }
            }
            .labelStyle(.iconOnly).disabled(pending.contains(entry.id))
        }
        .padding(.vertical, 4)
        .listRowBackground(slipPalette.surface)
    }

    private func load() async {
        struct Index: Decodable { let entries: [Entry] }
        do {
            let result = try await viewer.readPublic(Index.self, path: path, query: query)
            guard !Task.isCancelled else { return }
            entries = result.entries
            issue = nil
        } catch { if !Task.isCancelled { issue = error } }
    }

    private func mutate(_ entry: Entry, delete: Bool) async {
        struct Receipt: Decodable { let id: UUID }
        guard pending.insert(entry.id).inserted else { return }
        defer { pending.remove(entry.id) }
        do {
            let id = entry.id.uuidString.lowercased()
            let receipt: Receipt
            if delete { receipt = try await viewer.write(Receipt.self, path: path, query: query, body: ["id": id, "action": "delete"]) }
            else {
                receipt = try await viewer.write(Receipt.self, path: path, query: query,
                    body: Verification(id: id, verified: entry.isVerified != true, expected: entry.isVerified))
            }
            guard receipt.id == entry.id else { throw URLError(.badServerResponse) }
            await load()
        } catch { actionIssue = true }
    }
}
