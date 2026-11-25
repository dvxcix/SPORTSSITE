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
        let drafts: [CreatorScheduledPost]
        let storefront: Storefront?
        let allowMlb: Bool?
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
    private enum AdminTab: String, CaseIterable { case moderation = "Queues", members = "Members", delivery = "System health", settings = "Settings" }

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
    @State private var editing: Editor?
    @State private var removing: Removal?
    @State private var scheduleProblem: String?
    @State private var changingSchedule = false
    @State private var changingOffer: Studio.Offer?
    @State private var offerBusy = false
    @State private var offerProblem: String?

    private struct Editor: Identifiable {
        let id = UUID()
        let post: CreatorScheduledPost?
    }
    private struct Removal: Identifiable {
        let post: CreatorScheduledPost
        let isDelete: Bool
        var id: UUID { post.id }
    }
    private var scheduleAPI: CreatorScheduleAPI { .init(account: account, userID: userID) }

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
        .sheet(item: $editing) { editor in
            if let studio {
                CreatorScheduleEditor(api: scheduleAPI, existing: editor.post,
                    targets: studio.groups.map { .init(id: $0.id, name: $0.name, avatar: $0.avatarUrl) },
                    allowMLB: studio.allowMlb == true) { await load() }
            }
        }
        .confirmationDialog(removing?.isDelete == true ? "Delete this draft?" : "Cancel this scheduled post?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible, presenting: removing) { removal in
            Button(removal.isDelete ? "Delete draft" : "Cancel scheduled post", role: .destructive) { Task { await remove(removal) } }
        }
        .confirmationDialog(changingOffer?.status == "active" ? "Pause this offer?" : "Publish this offer?",
            isPresented: Binding(get: { changingOffer != nil }, set: { if !$0 { changingOffer = nil } }),
            titleVisibility: .visible, presenting: changingOffer) { offer in
            if offer.status == "active" {
                Button("Pause offer", role: .destructive) { Task { await updateOffer(offer, status: "paused") } }
            } else {
                Button("Publish offer") { Task { await updateOffer(offer, status: "active") } }
            }
        }
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
            NavigationLink {
                CreatorStoreView(api: .init(account: account, userID: userID))
            } label: { Label("Storefront", systemImage: "storefront") }
            .buttonStyle(.bordered)
            NavigationLink {
                CreatorWalletView(api: .init(account: account, userID: userID))
            } label: { Label("Balance & payouts", systemImage: "wallet.bifold") }
            .buttonStyle(.bordered)
            ResearchToolRail(title: "Creator Studio", choices: StudioTab.allCases, selection: $studioTab, label: \.rawValue, compact: true)
            switch studioTab {
            case .offers:
                NavigationLink {
                    CreatorMembersView(account: account, userID: userID)
                } label: { Label("View members", systemImage: "person.2") }
                .buttonStyle(.bordered)
                if studio.offers.isEmpty { ContentUnavailableView("No membership offers", systemImage: "creditcard") }
                if let offerProblem { Text(offerProblem).font(.subheadline).foregroundStyle(.red) }
                ForEach(studio.offers) { offer in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(offer.title).font(.headline)
                    } content: {
                        if let description = offer.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
                        Text(offer.price.formatted(.currency(code: offer.currency?.uppercased() ?? "USD")) + (offer.billingPeriodDays.map { " / \($0) days" } ?? ""))
                            .font(.subheadline.weight(.semibold))
                        Text(pretty(offer.status)).font(.caption).foregroundStyle(.secondary)
                        if ["active", "paused", "draft"].contains(offer.status) {
                            Button(offer.status == "active" ? "Pause offer" : "Publish offer", systemImage: offer.status == "active" ? "pause.circle" : "arrow.up.circle") {
                                changingOffer = offer
                            }.buttonStyle(.bordered).disabled(offerBusy)
                        }
                    }
                }
            case .groups:
                if studio.groups.isEmpty { ContentUnavailableView("No communities", systemImage: "person.2") }
                ForEach(studio.groups) { group in
                    NavigationLink {
                        CommunitySettingsView(api: .init(account: account, userID: userID, groupID: group.id))
                    } label: {
                        DiscoverIdentityCard(title: group.name, subtitle: group.sport.map(LeagueArtwork.label) ?? pretty(group.accessType),
                            detail: group.description, avatar: group.avatarUrl, banner: nil, symbol: "person.2",
                            count: group.memberCount.map { "\($0.formatted()) members" })
                    }.buttonStyle(SlipSurgePressStyle())
                }
            case .drafts:
                Button("New scheduled post", systemImage: "square.and.pencil") { editing = Editor(post: nil) }
                    .buttonStyle(.borderedProminent).disabled(changingSchedule)
                if let scheduleProblem { Text(scheduleProblem).font(.subheadline).foregroundStyle(.red) }
                if studio.drafts.isEmpty { ContentUnavailableView("No drafts or scheduled posts", systemImage: "calendar") }
                ForEach(studio.drafts) { draft in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        HStack {
                            Text(pretty(draft.status)).font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                            Spacer()
                            Menu("Scheduled post actions", systemImage: "ellipsis") {
                                Button("Edit", systemImage: "pencil") { editing = Editor(post: draft) }
                                if draft.status == "scheduled" {
                                    Button("Cancel scheduled post", systemImage: "calendar.badge.minus", role: .destructive) {
                                        removing = Removal(post: draft, isDelete: false)
                                    }
                                } else {
                                    Button("Delete draft", systemImage: "trash", role: .destructive) {
                                        removing = Removal(post: draft, isDelete: true)
                                    }
                                }
                            }.labelStyle(.iconOnly).disabled(changingSchedule || draft.updatedAt == nil)
                        }
                    } content: {
                        if let body = draft.content { Text(body).font(.subheadline) }
                        if draft.status != "draft", let date = draft.scheduledFor.flatMap(SidelineBoard.timestamp) {
                            Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func updateOffer(_ offer: Studio.Offer, status: String) async {
        guard !offerBusy else { return }
        offerBusy = true
        offerProblem = nil
        defer { offerBusy = false }
        do {
            try await CreatorStoreAPI(account: account, userID: userID).setOffer(offer.id, status: status)
            await load()
        } catch let error as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            offerProblem = (try? JSONDecoder().decode(Details.self, from: error.data))?.error ?? "This offer change couldn’t be confirmed."
        } catch { offerProblem = "This offer change couldn’t be confirmed." }
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
                    ForEach(AdminQueue.allCases, id: \.self) { queue in
                        NavigationLink {
                            AdminQueueView(account: account, userID: userID, queue: queue)
                        } label: {
                            LabeledContent {
                                Text(count(admin.queues[queue.rawValue] ?? nil)).monospacedDigit()
                            } label: { Label(queue.title, systemImage: queue.icon) }
                        }.buttonStyle(.plain)
                    }
                    ForEach([("webhooks", "Webhook failures"), ("delivery", "Delivery failures")], id: \.0) { key, label in
                        LabeledContent(label, value: count(admin.queues[key] ?? nil))
                    }
                    NavigationLink {
                        AdminCommunityEventsView(api: .init(viewer: .init(account: account, userID: userID)))
                    } label: { Label("Manage events", systemImage: "calendar.badge.clock") }
                    NavigationLink {
                        AdminForumView(api: .init(viewer: .init(account: account, userID: userID)))
                    } label: { Label("Manage discussions", systemImage: "bubble.left.and.bubble.right") }
                    NavigationLink {
                        AdminPublicationsView(viewer: .init(account: account, userID: userID), kind: .articles)
                    } label: { Label("Manage articles", systemImage: "book") }
                    NavigationLink {
                        AdminPublicationsView(viewer: .init(account: account, userID: userID), kind: .pages)
                    } label: { Label("Manage pages", systemImage: "rectangle.grid.2x2") }
                }
            } else if adminTab == .members {
                NavigationLink {
                    AdminMembersView(api: .init(account: account, userID: userID))
                } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Manage members", systemImage: "person.2") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
            } else if adminTab == .settings {
                NavigationLink {
                    AdminFeatureRollouts(account: account, userID: userID)
                } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Feature rollouts", systemImage: "switch.2") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink {
                    AdminAnnouncementsView(account: account, userID: userID)
                } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Announcements", systemImage: "megaphone") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
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

    private func remove(_ removal: Removal) async {
        guard !changingSchedule else { return }
        changingSchedule = true
        scheduleProblem = nil
        defer { changingSchedule = false }
        do {
            if removal.isDelete { try await scheduleAPI.delete(removal.post) }
            else {
                try await scheduleAPI.save(.init(id: removal.post.id, action: "cancel", expectedUpdatedAt: removal.post.updatedAt))
            }
            await load()
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            await load()
            scheduleProblem = "This post changed. Check its current status."
        } catch { scheduleProblem = "The change couldn’t be confirmed. Try again." }
    }

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
