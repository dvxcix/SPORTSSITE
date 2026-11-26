import SwiftUI

struct AdminWhopView: View {
    enum Page: String, CaseIterable {
        case activity = "Activity", fees = "Fees", connection = "Connection", verification = "Verification"

        var glyph: String {
            switch self {
            case .activity: "waveform.path"
            case .fees: "creditcard"
            case .connection: "link"
            case .verification: "checkmark.seal"
            }
        }
    }

    private struct Commerce: Decodable {
        struct Counts: Decodable {
            let connectedCreators: Int
            let liveOffers: Int
            let activeMembers: Int
            let receipts: String
        }
        struct Creator: Decodable, Identifiable { let id: UUID; let name: String }
        struct Event: Decodable, Identifiable {
            let id: UUID
            let creator: String?
            let offer: String?
            let event: String
            let amount: Double?
            let currency: String?
            let status: String?
            let createdAt: String
        }
        let counts: Counts
        let creators: [Creator]
        let events: [Event]
    }

    private struct FeeSchedule: Decodable {
        struct Fee: Decodable { let label: String; let percentage: Double?; let fixed: String? }
        let rows: [Fee]
        let checkedAt: String
    }

    private struct PaymentConnection: Decodable {
        struct Platform: Decodable {
            let apiConfigured: Bool
            let companyConfigured: Bool
            let verified: Bool
            let accountMatches: Bool
            let canReadCapabilities: Bool
            var deliveryReady: Bool
        }
        struct Memberships: Decodable { let api: Bool; let webhook: Bool; let addon: Bool; let addonWebhook: Bool }
        var platform: Platform
        let memberships: Memberships
    }

    private struct DeliveryTest: Decodable { let deliveryReady: Bool; let testPassed: Bool; let testStatus: Int? }
    private struct VerificationRequest: Encodable { let targetUserId: String; let expectedPlanId: String }
    private struct APIError: Decodable { let error: String }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @State private var page: Page
    @State private var commerce: Commerce?
    @State private var connection: PaymentConnection?
    @State private var selectedCreator: UUID?
    @State private var fees: FeeSchedule?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var sending = false
    @State private var confirmDelivery = false
    @State private var feedback: String?
    @State private var target = ""
    @State private var plan = ""
    @State private var verification: [String: Bool]?

    private static let path = "/api/mobile/admin/whop"

    init(api: DiscoverAPI, page: Page = .activity) {
        self.api = api
        _page = State(initialValue: page)
    }

    var body: some View {
        List {
            switch page {
            case .activity: activityContent
            case .fees: feeContent
            case .connection: connectionContent
            case .verification: verificationContent
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            ResearchToolRail(title: "Whop section", choices: Page.allCases, selection: $page, label: \.rawValue, glyph: \.glyph)
                .padding(.vertical, 6).background(.bar)
        }
        .navigationTitle("Whop payments")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Link(destination: URL(string: "https://whop.com/dashboard")!) {
                    Image("sign-in-whop").resizable().scaledToFit().frame(width: 19, height: 19)
                }.accessibilityLabel("Open Whop dashboard")
            }
        }
        .task(id: "\(page.rawValue):\(selectedCreator?.uuidString ?? "platform"):\(revision)") { await load() }
        .refreshable { await load() }
        .onChange(of: page) { _, _ in error = nil; feedback = nil }
        .onChange(of: selectedCreator) { _, _ in fees = nil; error = nil }
        .confirmationDialog("Connect and test creator event delivery?", isPresented: $confirmDelivery, titleVisibility: .visible) {
            Button("Connect and test") { Task { await testDelivery() } }
        } message: {
            Text("Whop will receive a signed delivery test for SlipSurge’s creator event connection.")
        }
    }

    @ViewBuilder private var activityContent: some View {
        if let commerce {
            Section("Marketplace activity") {
                LabeledContent("Connected creators", value: commerce.counts.connectedCreators.formatted())
                LabeledContent("Live offers", value: commerce.counts.liveOffers.formatted())
                LabeledContent("Active members", value: commerce.counts.activeMembers.formatted())
                LabeledContent("Recent receipts", value: commerce.counts.receipts)
            }
            Section("Recent Whop commerce") {
                if commerce.events.isEmpty { Text("No Whop commerce events yet").foregroundStyle(.secondary) }
                ForEach(commerce.events) { event in
                    VStack(alignment: .leading, spacing: 5) {
                        LabeledContent(event.offer ?? "Platform event", value: event.amount.map {
                            $0.formatted(.currency(code: (event.currency ?? "USD").uppercased()))
                        } ?? "Recorded").font(.subheadline.weight(.semibold))
                        Text([event.creator, pretty(event.event), event.status.map(pretty)].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                        if let date = SidelineBoard.timestamp(event.createdAt) {
                            Text(date, format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } else {
            ResearchToolMessage(title: "Whop activity couldn’t load", error: error) { revision += 1 }
        }
    }

    @ViewBuilder private var feeContent: some View {
        if let commerce {
            Section {
                Picker("Whop fee account", selection: $selectedCreator) {
                    Text("SlipSurge platform").tag(nil as UUID?)
                    ForEach(commerce.creators) { creator in Text(creator.name).tag(Optional(creator.id)) }
                }
            } footer: { Text("Whop manages the account’s fee schedule.") }
            Section("Effective fee schedule") {
                if let fees {
                    if fees.rows.isEmpty { Text("No fee schedule returned").foregroundStyle(.secondary) }
                    ForEach(fees.rows.indices, id: \.self) { index in
                        let fee = fees.rows[index]
                        let amount = [fee.percentage.map { $0.formatted() + "%" }, fee.fixed].compactMap { $0 }.joined(separator: " · ")
                        LabeledContent(pretty(fee.label), value: amount.isEmpty ? "Unavailable" : amount)
                    }
                    if let date = SidelineBoard.timestamp(fees.checkedAt) {
                        Text("Checked \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    ResearchToolMessage(title: "Whop fees couldn’t load", error: error) { revision += 1 }
                }
            }
        } else {
            ResearchToolMessage(title: "Connected accounts couldn’t load", error: error) { revision += 1 }
        }
    }

    @ViewBuilder private var connectionContent: some View {
        if let connection {
            Section("Creator platform") {
                check("Platform credentials", connection.platform.apiConfigured)
                check("Platform account", connection.platform.companyConfigured)
                check("Account verified", connection.platform.verified && connection.platform.accountMatches)
                check("Capabilities available", connection.platform.canReadCapabilities)
                check("Creator event delivery", connection.platform.deliveryReady)
                Button("Check connection", systemImage: "arrow.clockwise") { revision += 1 }
                Button(connection.platform.deliveryReady ? "Test creator events" : "Connect creator events", systemImage: "waveform.path") {
                    confirmDelivery = true
                }.disabled(sending || !connection.platform.accountMatches)
            }
            Section("SlipSurge memberships") {
                check("Whop API", connection.memberships.api)
                check("Membership webhook", connection.memberships.webhook)
            }
            Section("Ultimate add-on") {
                check("Add-on API", connection.memberships.addon)
                check("Add-on webhook", connection.memberships.addonWebhook)
            }
            if let feedback { Text(feedback).font(.subheadline) }
        } else {
            ResearchToolMessage(title: "Payment connection couldn’t load", error: error) { revision += 1 }
        }
    }

    @ViewBuilder private var verificationContent: some View {
        Section("Billing verification") {
            TextField("Account ID", text: $target).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Expected plan ID", text: $plan).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Check membership", systemImage: "checkmark.shield") { Task { await inspect() } }
                .disabled(sending || UUID(uuidString: target.trimmingCharacters(in: .whitespacesAndNewlines)) == nil || !plan.hasPrefix("plan_"))
            if sending { ProgressView("Checking membership") }
            if let feedback { Text(feedback).font(.subheadline) }
        }
        if let verification {
            Section("Verification results") {
                ForEach(verification.keys.filter { $0 != "ok" }.sorted(), id: \.self) { key in
                    LabeledContent(pretty(key), value: verification[key] == true ? "Confirmed" : "Unconfirmed")
                }
            }
        }
    }

    private func check(_ text: String, _ available: Bool) -> some View {
        LabeledContent(text) {
            Label(available ? "Ready" : "Needs attention", systemImage: available ? "checkmark.circle.fill" : "exclamationmark.circle")
                .foregroundStyle(available ? Brand.signal(1, for: scheme) : .orange)
        }
    }

    private func load() async {
        do {
            switch page {
            case .activity:
                commerce = try await api.memberRead(Commerce.self, path: Self.path)
            case .fees:
                if commerce == nil { commerce = try await api.memberRead(Commerce.self, path: Self.path) }
                try Task.checkCancellation()
                let account = selectedCreator
                let items: [URLQueryItem] = account.map { [.init(name: "creator", value: $0.uuidString.lowercased())] } ?? []
                let response = try await api.memberRead(FeeSchedule.self, path: "/api/admin/creator-fees", query: items)
                if selectedCreator == account { fees = response }
            case .connection:
                connection = try await api.memberRead(PaymentConnection.self, path: Self.path, query: [.init(name: "section", value: "connection")])
            case .verification: break
            }
            try Task.checkCancellation()
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func testDelivery() async {
        guard !sending else { return }
        sending = true
        feedback = nil
        defer { sending = false }
        do {
            let result = try await api.write(DeliveryTest.self, path: "/api/admin/creator-commerce", body: [String: String](), timeout: 55)
            connection?.platform.deliveryReady = result.deliveryReady
            feedback = result.testPassed ? "Signed delivery test passed." : "Creator event delivery couldn’t be verified."
        } catch let status as SlipSurgeHTTP.Status {
            feedback = (try? JSONDecoder().decode(APIError.self, from: status.data))?.error ?? "Creator event delivery couldn’t be verified."
        } catch { feedback = "Creator event delivery couldn’t be verified." }
    }

    private func inspect() async {
        guard !sending else { return }
        sending = true
        feedback = nil
        verification = nil
        defer { sending = false }
        do {
            verification = try await api.write([String: Bool].self, path: "/api/admin/whop-renewal-shape", body:
                VerificationRequest(targetUserId: target.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                                    expectedPlanId: plan.trimmingCharacters(in: .whitespacesAndNewlines)))
        } catch let status as SlipSurgeHTTP.Status where status.code == 403 {
            feedback = "Billing verification requires an administrator’s current two-factor session."
        } catch { feedback = "The membership couldn’t be verified. Check the account and plan IDs." }
    }

    private func pretty(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "([a-z0-9])([A-Z])", with: "$1 $2", options: .regularExpression).capitalized
    }
}
