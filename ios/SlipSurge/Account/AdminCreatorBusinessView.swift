import SwiftUI

struct AdminCreatorBusinessView: View {
    private enum Panel: String, CaseIterable {
        case people = "Creators", offers = "Offers", access = "Access", promotions = "Promotion", events = "Payments"
        var icon: String {
            switch self { case .people: "person.2"; case .offers: "storefront"; case .access: "lock"; case .promotions: "megaphone"; case .events: "creditcard" }
        }
    }

    private enum CreatorFilter: String, CaseIterable { case all = "All creators", free = "Free communities", paid = "Paid offers", setup = "Payment setup" }

    private struct Management: Identifiable {
        let id: UUID
        let action: String
        let title: String
        let target: String
        var status: String? = nil
        var needsReason = false
    }

    typealias Data = AdminCreatorBusinessData
    let api: AdminCreatorBusinessAPI
    @Environment(\.colorScheme) private var scheme
    @State private var data: Data?
    @State private var failure: (any Error)?
    @State private var selected: UUID?
    @State private var panel = Panel.people
    @State private var filter = CreatorFilter.all
    @State private var search = ""
    @State private var revision = 0
    @State private var management: Management?
    @State private var promotion: Data.Promotion?
    @State private var feedback: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let data {
                    controls(data)
                    if let feedback { Text(feedback).font(.subheadline).foregroundStyle(.secondary) }
                    switch panel {
                    case .people: people(data)
                    case .offers: offers(data)
                    case .access: memberships(data)
                    case .promotions: promotions(data)
                    case .events: events(data)
                    }
                } else if let error = failure as? SlipSurgeHTTP.Status, [401, 403].contains(error.code) {
                    ContentUnavailableView("Admin access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Creator operations couldn’t load", error: failure) { revision += 1 }
                }
            }.padding(16)
        }
        .navigationTitle("Creator Operations")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $management) { change in
            AdminCreatorDecision(title: change.title, target: change.target, needsReason: change.needsReason,
                destructive: change.action == "revoke_entitlement" || change.status == "paused") { reason in
                try await api.manage(.init(action: change.action, id: change.id, status: change.status, reason: reason))
                feedback = "Creator operation saved."
                await load()
            }
        }
        .sheet(item: $promotion) { store in
            AdminCreatorPromotionEdit(store: store) { placement in
                try await api.promote(placement)
                feedback = "Promotion updated."
                await load()
            }
        }
    }

    private func controls(_ data: Data) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ResearchToolValues(items: [
                .init(label: "Creators", text: data.creators.count.formatted()),
                .init(label: "Live offers", text: data.offers.filter { $0.status == "active" }.count.formatted()),
                .init(label: "Paid members", text: data.members.filter(\.active).count.formatted()),
            ])
            ResearchToolRail(title: "Creator administration", choices: Panel.allCases, selection: $panel, label: \.rawValue, glyph: \.icon)
            if panel != .promotions {
                ResearchArtworkPicker(title: "Creator", options: [.init(id: "all", title: "All creators", icon: "person.2")] +
                    data.creators.map { .init(id: $0.id.uuidString, title: $0.name, url: $0.avatarUrl, icon: "person.crop.circle") },
                    selection: Binding(get: { selected?.uuidString ?? "all" }, set: { selected = UUID(uuidString: $0) }))
            }
        }
    }

    @ViewBuilder private func people(_ data: Data) -> some View {
        TextField("Find a creator or community", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        Picker("Creator type", selection: $filter) {
            ForEach(CreatorFilter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
        let creators = data.creators.filter { inScope($0.id) && matches($0, data: data) }
        if creators.isEmpty { ContentUnavailableView("No matching creators", systemImage: "person.2") }
        ForEach(creators) { creator in
            let communities = data.groups.filter { $0.ownerId == creator.id }
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                DiscoverIdentityCard(title: creator.name, subtitle: "@\(creator.username)", detail: creator.email,
                    avatar: creator.avatarUrl, banner: nil, symbol: "person.crop.circle", count: nil)
            } content: {
                Label(creator.linked ? pretty(creator.creatorCommerceStatus ?? "Needs check") : "Whop not connected",
                    systemImage: "creditcard").font(.caption.weight(.semibold))
                if let verifiedAt = creator.creatorCommerceUpdatedAt.flatMap(SidelineBoard.timestamp) {
                    Text("Checked \(verifiedAt.formatted(date: .abbreviated, time: .omitted))").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(communities) { group in
                    NavigationLink {
                        AdminOperationsView(viewer: api.viewer, mode: .groups, ownerID: creator.id)
                    } label: { Label(group.name, systemImage: "person.3") }.buttonStyle(.bordered)
                }
                Button("View offers", systemImage: "storefront") { selected = creator.id; panel = .offers }.buttonStyle(.bordered)
                if creator.linked {
                    Button("Check Whop connection", systemImage: "arrow.clockwise") {
                        management = .init(id: creator.id, action: "check_creator", title: "Check Whop connection", target: creator.name)
                    }.buttonStyle(.bordered)
                }
            }
        }
        NavigationLink {
            if let userID = api.viewer.userID { AdminQueueView(account: api.viewer.account, userID: userID, queue: .applications) }
        } label: { Label("Creator applications", systemImage: "person.badge.plus") }.buttonStyle(.bordered)
    }

    @ViewBuilder private func offers(_ data: Data) -> some View {
        let offers = data.offers.filter { inScope($0.creatorId) }
        if offers.isEmpty { ContentUnavailableView("No offers", systemImage: "storefront") }
        ForEach(offers) { offer in
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                ResearchSectionTitle(title: offer.title)
            } content: {
                LabeledContent(pretty(offer.status), value: offer.price.formatted(.currency(code: offer.currency)))
                if let days = offer.billingPeriodDays { Text(offer.productType == "membership" ? "Every \(days) days" : "\(days) days access").font(.caption) }
                if let creator = data.creators.first(where: { $0.id == offer.creatorId }) { Text("@\(creator.username)").font(.caption).foregroundStyle(.secondary) }
                if offer.status == "active" {
                    NavigationLink {
                        LinkedCreatorOfferView(api: .init(client: api.viewer), id: offer.id)
                    } label: { Label("View membership", systemImage: "arrow.up.right") }.buttonStyle(.bordered)
                }
                if offer.status != "archived" {
                    let pause = offer.status == "active"
                    Button(pause ? "Pause offer" : "Publish offer", systemImage: pause ? "pause.circle" : "checkmark.circle",
                        role: pause ? .destructive : nil) {
                        management = .init(id: offer.id, action: "set_product_status", title: pause ? "Pause offer" : "Publish offer", target: offer.title,
                            status: pause ? "paused" : "active")
                    }.buttonStyle(.bordered)
                }
            }
        }
    }

    @ViewBuilder private func memberships(_ data: Data) -> some View {
        let members = data.members.filter { inScope($0.creatorId) }
        if members.isEmpty { ContentUnavailableView("No memberships", systemImage: "person.2") }
        ForEach(members) { member in
            ResearchToolCard(color: member.held ? .orange : Brand.accent(for: scheme)) {
                ResearchSectionTitle(title: member.name)
            } content: {
                LabeledContent(data.offers.first(where: { $0.id == member.productId })?.title ?? "Creator membership", value: member.held ? "Held" : pretty(member.status))
                if let date = member.currentPeriodEnd.flatMap(SidelineBoard.timestamp) {
                    Text("Paid through \(date.formatted(date: .abbreviated, time: .omitted))").font(.caption)
                }
                if let reason = member.adminRevokedReason { Text(reason).font(.caption).foregroundStyle(.secondary) }
                Button(member.held ? "Verify & restore access" : "Place access hold", systemImage: member.held ? "arrow.uturn.backward" : "pause.circle",
                    role: member.held ? nil : .destructive) {
                    management = .init(id: member.id, action: member.held ? "restore_entitlement" : "revoke_entitlement",
                        title: member.held ? "Restore access" : "Hold access", target: member.name, needsReason: true)
                }.buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder private func promotions(_ data: Data) -> some View {
        if data.promotions.isEmpty { ContentUnavailableView("No published stores", systemImage: "megaphone") }
        ForEach(data.promotions) { store in
            Button { promotion = store } label: {
                DiscoverIdentityCard(title: store.name, subtitle: store.featured ? "Featured · Rank \(store.featuredRank)" : "Published", detail: nil,
                    avatar: store.logoUrl, banner: nil, symbol: "storefront", count: nil)
            }.buttonStyle(SlipSurgePressStyle())
        }
    }

    @ViewBuilder private func events(_ data: Data) -> some View {
        let events = data.events.filter { inScope($0.creatorId) }
        if events.isEmpty { ContentUnavailableView("No payment activity", systemImage: "creditcard") }
        ForEach(events) { event in
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                Text(pretty(event.eventType)).font(.headline)
            } content: {
                LabeledContent(pretty(event.status ?? "Record"), value: event.amount.map { $0.formatted(.currency(code: (event.currency ?? "USD").uppercased())) } ?? "—")
                if let date = SidelineBoard.timestamp(event.createdAt) { Text(date.formatted()).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }

    private func inScope(_ id: UUID) -> Bool { selected == nil || selected == id }

    private func matches(_ creator: Data.Creator, data: Data) -> Bool {
        let group = data.groups.filter { $0.ownerId == creator.id }
        let offers = data.offers.filter { $0.creatorId == creator.id }
        let available = [creator.name, creator.username, creator.email ?? ""] + group.map(\.name) + offers.map(\.title)
        guard search.isEmpty || available.contains(where: { $0.localizedStandardContains(search) }) else { return false }
        return switch filter {
        case .all: true
        case .free: group.contains { $0.accessType == "free" }
        case .paid: !offers.isEmpty
        case .setup: !offers.isEmpty && creator.creatorCommerceStatus != "ready"
        }
    }

    private func pretty(_ value: String) -> String { value.replacingOccurrences(of: #"[_.]"#, with: " ", options: .regularExpression).capitalized }

    private func load() async {
        failure = nil
        do {
            let result = try await api.fetch()
            try Task.checkCancellation()
            data = result
        } catch {
            if !Task.isCancelled { failure = error }
        }
    }
}

private struct AdminCreatorDecision: View {
    let title: String
    let target: String
    let needsReason: Bool
    let destructive: Bool
    let apply: (String?) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var problem: String?
    @State private var running = false
    private var explanation: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Text(target).font(.headline)
                if needsReason {
                    TextField("Reason", text: $reason, axis: .vertical).lineLimit(3...6)
                        .onChange(of: reason) { if reason.count > 500 { reason = String(reason.prefix(500)) } }
                }
                if let problem { Label(problem, systemImage: "exclamationmark.circle") }
                Button(title, role: destructive ? .destructive : nil) { Task { await confirm() } }
                    .disabled(running || needsReason && explanation.count < 3)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() }.disabled(running) } }
            .interactiveDismissDisabled(running)
        }.presentationDetents([.medium, .large])
    }

    private func confirm() async {
        guard !running else { return }
        running = true
        problem = nil
        defer { running = false }
        do {
            try await apply(needsReason ? explanation : nil)
            dismiss()
        } catch { problem = creatorActionError(error) }
    }
}

private struct AdminCreatorPromotionEdit: View {
    let store: AdminCreatorBusinessData.Promotion
    let apply: (AdminCreatorBusinessAPI.Placement) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var featured: Bool
    @State private var rank: Int
    @State private var problem: String?
    @State private var running = false

    init(store: AdminCreatorBusinessData.Promotion, apply: @escaping (AdminCreatorBusinessAPI.Placement) async throws -> Void) {
        self.store = store
        self.apply = apply
        _featured = State(initialValue: store.featured)
        _rank = State(initialValue: min(max(store.featuredRank, 0), 999))
    }

    var body: some View {
        NavigationStack {
            Form {
                Text(store.name).font(.headline)
                Toggle("Featured in discovery", isOn: $featured)
                Stepper("Placement \(rank)", value: $rank, in: 0...999)
                if let problem { Label(problem, systemImage: "exclamationmark.circle") }
            }
            .disabled(running)
            .navigationTitle("Promotion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() }.disabled(running) }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } }.disabled(running) }
            }
            .interactiveDismissDisabled(running)
        }.presentationDetents([.medium, .large])
    }

    private func save() async {
        guard !running else { return }
        running = true
        problem = nil
        defer { running = false }
        do {
            try await apply(.init(creatorId: store.id, featured: featured, rank: rank))
            dismiss()
        } catch { problem = creatorActionError(error) }
    }
}

private func creatorActionError(_ error: any Error) -> String {
    struct Details: Decodable { let error: String }
    if let status = error as? SlipSurgeHTTP.Status, let result = try? JSONDecoder().decode(Details.self, from: status.data) { return result.error }
    return "The change couldn’t be confirmed. Refresh before trying again."
}
