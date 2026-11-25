import SwiftUI

struct AccountWorkspaceView: View {
    enum Workspace: String {
        case studio, admin
        var title: String { self == .admin ? "Admin" : "Creator Studio" }
    }

    private struct Studio: Decodable {
        struct Offer: Decodable, Identifiable {
            let id: UUID
            let title: String
            let description: String?
            let status: String
            let price: Double
            let currency: String?
            let billingPeriodDays: Int?
        }

        struct Community: Decodable, Identifiable {
            let id: UUID
            let name: String
            let description: String?
            let sport: String?
            let avatarUrl: URL?
            let memberCount: Int?
            let accessType: String
        }

        struct Draft: Decodable, Identifiable {
            let id: UUID
            let content: String?
            let scheduledFor: String?
            let status: String
            let sport: String?
        }

        struct Storefront: Decodable {
            let name: String
            let status: String
            let logoUrl: URL?
        }

        let displayName: String
        let paymentStatus: String?
        let followers: Int?
        let activeMembers: Int?
        let offers: [Offer]
        let groups: [Community]
        let drafts: [Draft]
        let storefront: Storefront?
    }

    private struct Admin: Decodable {
        struct Pipeline: Decodable, Identifiable {
            let id: String
            let label: String
            let at: String?
            let status: String
        }

        let counts: [String: Int?]
        let queues: [String: Int?]
        let pipelines: [Pipeline]
    }

    private enum StudioTab: String, CaseIterable { case offers = "Memberships", groups = "Communities", drafts = "Scheduled posts" }
    private enum AdminTab: String, CaseIterable { case moderation = "Queues", delivery = "System health" }

    let account: AccountStore
    let userID: UUID
    let workspace: Workspace
    @Environment(\.colorScheme) private var scheme
    @State private var studio: Studio?
    @State private var admin: Admin?
    @State private var studioTab = StudioTab.offers
    @State private var adminTab = AdminTab.moderation
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 11) {
                if let studio {
                    studioContent(studio)
                } else if let admin {
                    adminContent(admin)
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView("Workspace access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Workspace couldn’t load", error: error) { retry += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle(workspace.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: retry) { await load() }
        .refreshable { await load() }
    }

    private func studioContent(_ studio: Studio) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            DiscoverIdentityCard(title: studio.storefront?.name ?? studio.displayName,
                subtitle: studio.storefront?.status.capitalized ?? "Creator Studio", detail: nil,
                avatar: studio.storefront?.logoUrl, banner: nil, symbol: "person.crop.circle",
                count: studio.followers.map { "\($0.formatted()) followers" })
            ResearchToolValues(items: [
                .init(label: "Active members", text: count(studio.activeMembers)),
                .init(label: "Offers", text: count(studio.offers.count)),
                .init(label: "Communities", text: count(studio.groups.count)),
            ])
            if let state = studio.paymentStatus {
                Label(pretty(state), systemImage: "creditcard").font(.subheadline)
            }
            ResearchToolRail(title: "Creator Studio", choices: StudioTab.allCases, selection: $studioTab, label: \.rawValue)
            switch studioTab {
            case .offers:
                if studio.offers.isEmpty { ContentUnavailableView("No membership offers", systemImage: "creditcard") }
                ForEach(studio.offers) { offer in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(offer.title).font(.headline)
                    } content: {
                        if let description = offer.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
                        Text(offer.price.formatted(.currency(code: offer.currency?.uppercased() ?? "USD")) + (offer.billingPeriodDays.map { " / \($0) days" } ?? ""))
                            .font(.subheadline.weight(.semibold))
                        Text(pretty(offer.status)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            case .groups:
                if studio.groups.isEmpty { ContentUnavailableView("No communities", systemImage: "person.2") }
                ForEach(studio.groups) { group in
                    DiscoverIdentityCard(title: group.name, subtitle: group.sport.map(LeagueArtwork.label) ?? pretty(group.accessType),
                        detail: group.description, avatar: group.avatarUrl, banner: nil, symbol: "person.2",
                        count: group.memberCount.map { "\($0.formatted()) members" })
                }
            case .drafts:
                if studio.drafts.isEmpty { ContentUnavailableView("No drafts or scheduled posts", systemImage: "calendar") }
                ForEach(studio.drafts) { draft in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(pretty(draft.status)).font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                    } content: {
                        if let body = draft.content { Text(body).font(.subheadline) }
                        if let date = draft.scheduledFor.flatMap(SidelineBoard.timestamp) {
                            Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func adminContent(_ admin: Admin) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ResearchToolValues(items: [
                .init(label: "Members", text: count(admin.counts["users"] ?? nil)),
                .init(label: "Published posts", text: count(admin.counts["posts"] ?? nil)),
                .init(label: "Communities", text: count(admin.counts["groups"] ?? nil)),
            ])
            ResearchToolRail(title: "Admin", choices: AdminTab.allCases, selection: $adminTab, label: \.rawValue)
            if adminTab == .moderation {
                ResearchToolCard(color: Brand.accent(for: scheme)) {
                    Text("Awaiting review").font(.headline)
                } content: {
                    ForEach([("reports", "Moderation reports"), ("applications", "Creator applications"),
                        ("deletions", "Deletion requests"), ("webhooks", "Webhook failures"), ("delivery", "Delivery failures")], id: \.0) { key, label in
                        LabeledContent(label, value: count(admin.queues[key] ?? nil))
                    }
                }
            } else {
                ForEach(admin.pipelines) { pipeline in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(pipeline.label).font(.headline)
                    } content: {
                        Label(pretty(pipeline.status), systemImage: pipeline.status == "succeeded" ? "checkmark.circle" : "waveform")
                            .font(.subheadline.weight(.medium))
                        if let date = pipeline.at.flatMap(SidelineBoard.timestamp) {
                            Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func count(_ amount: Int?) -> String { amount?.formatted() ?? "—" }

    private func pretty(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }

    private func load() async {
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/workspaces",
                query: [.init(name: "workspace", value: workspace.rawValue)], account: account, userID: userID)
            guard !Task.isCancelled else { return }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            switch workspace {
            case .studio: studio = try decoder.decode(Studio.self, from: data)
            case .admin: admin = try decoder.decode(Admin.self, from: data)
            }
        } catch {
            if !Task.isCancelled { studio = nil; admin = nil; self.error = error }
        }
    }
}
