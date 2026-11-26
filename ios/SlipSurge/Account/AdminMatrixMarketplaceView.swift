import SwiftUI

struct AdminMatrixMarketplaceView: View {
    private enum Status: String, CaseIterable, Codable, Identifiable {
        case published, unlisted, removed
        var id: Self { self }
        var visibleLabel: String { rawValue.capitalized }
    }

    private struct Listing: Decodable, Identifiable {
        struct Author: Decodable {
            let username: String?
            let displayName: String?
            let avatarUrl: URL?
            let isVerified: Bool?
        }

        let id: UUID
        let title: String
        let description: String?
        let tags: [String]?
        let matrixType: String
        let color: String?
        let status: Status
        let copyCount: Int
        let publishedAt: String?
        let updatedAt: String
        let author: Author?

        var willRemove: Bool { status != .removed }
    }

    private struct Query: Equatable {
        let term: String
        let status: Status?
        let revision: Int
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var status: Status?
    @State private var search = ""
    @State private var revision = 0
    @State private var rows: (Query, [Listing])?
    @State private var failure: (Query, any Error)?
    @State private var confirmation: Listing?
    @State private var notice: String?
    @State private var busy = false

    private static let path = "/api/mobile/admin/marketplace"
    private var query: Query { .init(term: String(search.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)), status: status, revision: revision) }

    var body: some View {
        let requested = query
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("Publication status", selection: $status) {
                    Text("All statuses").tag(nil as Status?)
                    ForEach(Status.allCases) { Text($0.visibleLabel).tag(Optional($0)) }
                }.pickerStyle(.segmented)
                if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
                if let rows, rows.0 == requested {
                    if rows.1.isEmpty { ContentUnavailableView("No matching publications", systemImage: "square.grid.3x3") }
                    ForEach(rows.1, content: card)
                } else if let failure, failure.0 == requested, let status = failure.1 as? SlipSurgeHTTP.Status, [401, 403].contains(status.code) {
                    ContentUnavailableView("Admin access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Matrix listings couldn’t load", error: failure.flatMap { $0.0 == requested ? $0.1 : nil }) { revision += 1 }
                }
            }.padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Matrix Marketplace")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Find a publication")
        .task(id: requested) {
            if !requested.term.isEmpty { try? await Task.sleep(for: .milliseconds(220)) }
            if !Task.isCancelled { await load(requested) }
        }
        .refreshable { await load(requested) }
        .confirmationDialog(confirmation?.willRemove == true ? "Remove this publication?" : "Restore this publication?",
            isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible,
            presenting: confirmation) { listing in
            Button(listing.willRemove ? "Remove from marketplace" : "Restore publication", role: listing.willRemove ? .destructive : nil) {
                Task { await moderate(listing) }
            }
        } message: { listing in
            if listing.willRemove { Text("\(listing.title) will be removed from the marketplace. The member keeps their original Matrix.") }
        }
    }

    private func card(_ listing: Listing) -> some View {
        ResearchToolCard(color: Color(hex: listing.color) ?? slipPalette.accent) {
            HStack(alignment: .firstTextBaseline) {
                Text(listing.title).font(.headline)
                Spacer()
                Text(listing.status.visibleLabel).font(.caption.weight(.semibold)).foregroundStyle(listing.status == .published ? slipPalette.accent : .secondary)
            }
        } content: {
            if let author = listing.author {
                HStack(spacing: 7) {
                    ResearchArtwork(urls: [author.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                        .frame(width: 25, height: 25)
                    Text(author.displayName ?? author.username ?? "Member").font(.subheadline)
                    if author.isVerified == true { Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified") }
                }
            }
            if let description = listing.description, !description.isEmpty { Text(description).font(.subheadline).foregroundStyle(.secondary) }
            if let tags = listing.tags, !tags.isEmpty { Text(tags.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
            let date = listing.publishedAt.flatMap(SidelineBoard.timestamp).map { $0.formatted(date: .abbreviated, time: .omitted) }
            Label([listing.matrixType.capitalized, "\(listing.copyCount.formatted()) adds", date].compactMap { $0 }.joined(separator: " · "),
                systemImage: "square.grid.3x3").font(.caption).foregroundStyle(.secondary)
            Button(listing.willRemove ? "Remove" : "Restore", systemImage: listing.willRemove ? "minus.circle" : "arrow.uturn.backward",
                role: listing.willRemove ? .destructive : nil) { confirmation = listing }
                .buttonStyle(.bordered).disabled(busy)
        }
    }

    private func load(_ requested: Query) async {
        struct Page: Decodable { let listings: [Listing] }
        failure = nil
        let parameters = [requested.status.map { URLQueryItem(name: "status", value: $0.rawValue) },
            requested.term.isEmpty ? nil : URLQueryItem(name: "q", value: requested.term)].compactMap { $0 }
        do {
            let page = try await api.readPublic(Page.self, path: Self.path, query: parameters)
            try Task.checkCancellation()
            if query == requested { rows = (requested, page.listings) }
        } catch {
            if !Task.isCancelled, query == requested { failure = (requested, error) }
        }
    }

    private func moderate(_ listing: Listing) async {
        struct Change: Encodable { let id: UUID; let expectedStatus: Status; let expectedUpdatedAt: String; let status: Status }
        guard let userID = api.userID, !busy else { return }
        busy = true
        defer { busy = false }
        notice = nil
        do {
            let token = try await api.account.accessToken(for: userID)
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path)
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(Change(id: listing.id, expectedStatus: listing.status,
                expectedUpdatedAt: listing.updatedAt, status: listing.willRemove ? .removed : .published))
            _ = try await SlipSurgeHTTP.send(request)
            guard api.account.memberID == userID else { return }
            notice = listing.willRemove ? "Publication removed." : "Publication restored."
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            notice = "This listing changed. Review the newest version."
        } catch { notice = "The change couldn’t be confirmed." }
        await load(query)
    }
}
