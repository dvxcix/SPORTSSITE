import SwiftUI

struct AccountWorkspaceView: View {
    enum Workspace: String {
        case studio, admin
        var title: String { self == .admin ? "Admin" : "Creator Studio" }
    }

    enum StudioSection: String {
        case overview, products, communities, members, content, promotion, analytics, settings
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
            let providerReady: Bool?
        }

        struct Community: Decodable, Identifiable {
            let id: UUID
            let name: String
            let description: String?
            let sport: String?
            let avatarUrl: URL?
            let memberCount: Int?
            let accessType: String
            let creatorProductId: UUID?
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

    private enum StudioTab: String, CaseIterable {
        case offers = "Memberships", groups = "Communities", drafts = "Scheduled posts"

        var glyph: String {
            switch self {
            case .offers: "person.badge.key"
            case .groups: SlipGlyph.community.rawValue
            case .drafts: "calendar.badge.clock"
            }
        }
    }
    private enum AdminTab: String, CaseIterable {
        case moderation = "Queues", members = "Members", delivery = "System health", settings = "Settings"

        var glyph: String {
            switch self {
            case .moderation: "list.bullet.clipboard"
            case .members: "person.2"
            case .delivery: "waveform.path.ecg"
            case .settings: "gearshape"
            }
        }
    }

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
    @State private var newOffer = false
    @State private var newCommunity: CommunityDraft?

    private struct Editor: Identifiable {
        let id = UUID()
        let post: CreatorScheduledPost?
    }
    private struct Removal: Identifiable {
        let post: CreatorScheduledPost
        let isDelete: Bool
        var id: UUID { post.id }
    }
    private struct CommunityDraft: Identifiable {
        let id = UUID()
        let offer: UUID?
    }
    private var scheduleAPI: CreatorScheduleAPI { .init(account: account, userID: userID) }

    init(account: AccountStore, userID: UUID, workspace: Workspace, studioSection: StudioSection = .overview) {
        self.account = account
        self.userID = userID
        self.workspace = workspace
        let initialTab: StudioTab = switch studioSection {
        case .communities: .groups
        case .content: .drafts
        default: .offers
        }
        _studioTab = State(initialValue: initialTab)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 11) {
                if let studio {
                    studioContent(studio)
                } else if let admin {
                    adminContent(admin)
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    if workspace == .studio {
                        NavigationLink {
                            CreatorStoreView(api: .init(account: account, userID: userID))
                        } label: { Label("Set up your storefront", systemImage: "storefront") }.buttonStyle(.borderedProminent)
                    } else { ContentUnavailableView("Workspace access required", systemImage: "lock") }
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
        .sheet(isPresented: $newOffer) {
            CreatorOfferEditor(api: .init(account: account, userID: userID)) { _ in await load() }
        }
        .sheet(item: $newCommunity) { draft in
            NavigationStack {
                CommunityCreateView(api: .init(account: account, userID: userID), initialOffer: draft.offer, completed: { await load() })
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { newCommunity = nil } } }
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
                CreatorAnalyticsView(api: .init(account: account, userID: userID))
            } label: { Label("Analytics", systemImage: "chart.bar.xaxis") }
                .buttonStyle(.bordered)
            NavigationLink {
                CreatorBusinessView(api: .init(account: account, userID: userID), section: .promotion)
            } label: { Label("Promotion", systemImage: "megaphone") }
                .buttonStyle(.bordered)
            NavigationLink {
                CreatorWalletView(api: .init(account: account, userID: userID))
            } label: { Label("Balance & payouts", systemImage: "wallet.bifold") }
            .buttonStyle(.bordered)
            ResearchToolRail(title: "Creator Studio", choices: StudioTab.allCases, selection: $studioTab, label: \.rawValue, glyph: \.glyph, compact: true)
            switch studioTab {
            case .offers:
                Button("New product", systemImage: "plus") { newOffer = true }.buttonStyle(.borderedProminent)
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
                        if let group = studio.groups.first(where: { $0.creatorProductId == offer.id }) {
                            NavigationLink {
                                CommunitySettingsView(api: .init(account: account, userID: userID, groupID: group.id))
                            } label: { Label(group.name, systemImage: "person.2") }.buttonStyle(.bordered)
                        } else if offer.providerReady == true, ["draft", "active"].contains(offer.status) {
                            Button("Connect community", systemImage: "plus.circle") { newCommunity = .init(offer: offer.id) }
                                .buttonStyle(.bordered)
                        }
                        if ["active", "paused", "draft"].contains(offer.status) {
                            Button(offer.status == "active" ? "Pause offer" : "Publish offer", systemImage: offer.status == "active" ? "pause.circle" : "arrow.up.circle") {
                                changingOffer = offer
                            }.buttonStyle(.bordered).disabled(offerBusy)
                        }
                    }
                }
            case .groups:
                Button("New community", systemImage: "plus.circle") { newCommunity = .init(offer: nil) }.buttonStyle(.borderedProminent)
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
            ResearchToolRail(title: "Admin", choices: AdminTab.allCases, selection: $adminTab, label: \.rawValue, glyph: \.glyph)
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
                    NavigationLink { AdminEmojiStudio(viewer: .init(account: account, userID: userID)) } label: {
                        Label("Custom emoji", systemImage: "face.smiling")
                    }
                    NavigationLink { AdminSocialContent(viewer: .init(account: account, userID: userID), kind: .posts) } label: {
                        Label("Manage posts", systemImage: "text.bubble")
                    }
                    NavigationLink { AdminSocialContent(viewer: .init(account: account, userID: userID), kind: .stories) } label: {
                        Label("Manage stories", systemImage: "circle.dashed.inset.filled")
                    }
                    NavigationLink { AdminOperationsView(viewer: .init(account: account, userID: userID), mode: .groups) } label: {
                        Label("Manage communities", systemImage: "person.3")
                    }
                    NavigationLink { AdminMatrixMarketplaceView(api: .init(account: account, userID: userID)) } label: {
                        Label("Matrix Marketplace", systemImage: "square.grid.3x3")
                    }
                    NavigationLink { AdminCreatorBusinessView(api: .init(viewer: .init(account: account, userID: userID))) } label: {
                        Label("Creator operations", systemImage: "storefront")
                    }
                }
            } else if adminTab == .members {
                NavigationLink {
                    AdminMembersView(api: .init(account: account, userID: userID))
                } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Manage members", systemImage: "person.2") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminBadgeStudio(viewer: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Badge studio", systemImage: "rosette") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminNflAccessView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("NFL early access", systemImage: "football") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminRecentSignInsView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Recent sign-ins", systemImage: "clock.badge.checkmark") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
            } else if adminTab == .settings {
                NavigationLink { AdminDesignSystemView() } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Design system", systemImage: "swatchpalette") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                ForEach(AdminPlatformSettingsView.Page.allCases) { page in
                    NavigationLink { AdminPlatformSettingsView(api: .init(account: account, userID: userID), page: page) } label: {
                        ResearchToolCard(color: Brand.accent(for: scheme)) { Label(page.title, systemImage: page.icon) } content: {}
                    }.buttonStyle(SlipSurgePressStyle())
                }
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
                NavigationLink { AdminOperationsView(viewer: .init(account: account, userID: userID), mode: .audit) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Audit log", systemImage: "list.bullet.rectangle") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminOperationsView(viewer: .init(account: account, userID: userID), mode: .notifications) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Notification history", systemImage: "bell") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminSocialPlatformsView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Social platforms", systemImage: "at") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminEmailOperationsView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Email operations", systemImage: "envelope.badge.shield.half.filled") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminWhopView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Color(rgb: 0xFA4616)) {
                        Label {
                            Text("Whop payments")
                        } icon: {
                            Image("sign-in-whop").resizable().scaledToFit().frame(width: 22, height: 22)
                        }
                    } content: {}
                }.buttonStyle(SlipSurgePressStyle())
            } else {
                NavigationLink { AdminPipelineHealthView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Pipeline health", systemImage: "waveform.path") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminExperienceAuditView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Experience audit", systemImage: "checklist") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminMlbArchiveView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("MLB archive", systemImage: "archivebox") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminMatrixBacktestView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Matrix backtest", systemImage: "chart.line.uptrend.xyaxis") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminHrIntelligenceView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("HR Intelligence", systemImage: "scope") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminContactRecapView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Daily Contact Recap", systemImage: "film.stack") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminBrowserAutomationView(api: .init(account: account, userID: userID)) } label: {
                    ResearchToolCard(color: Brand.accent(for: scheme)) { Label("Browser automation", systemImage: "cloud") } content: {}
                }.buttonStyle(SlipSurgePressStyle())
                NavigationLink { AdminDiscordView(api: .init(viewer: .init(account: account, userID: userID))) } label: {
                    ResearchToolCard(color: Color(rgb: 0x5865F2)) {
                        HStack(spacing: 8) {
                            Image("sign-in-discord").resizable().scaledToFit().frame(width: 23, height: 23).accessibilityHidden(true)
                            Text("Discord Bot")
                        }
                    } content: {}
                }.buttonStyle(SlipSurgePressStyle())
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
