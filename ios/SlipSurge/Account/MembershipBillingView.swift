import StoreKit
import SwiftUI

struct MembershipBillingView: View {
    private enum Offer: String, CaseIterable {
        case monthly, annual, discord

        var title: String { self == .discord ? "Discord offer" : rawValue.capitalized }
    }

    private struct Snapshot: Decodable {
        struct Existing: Decodable {
            struct Quote: Decodable { let id: String; let price: String; let days: Int; let trialDays: Int }
            let purchasedTier: String
            let status: String?
            let currentPeriodEnd: String?
            let cancelAtPeriodEnd: Bool
            let provider: String?
            let planLabel: String?
            let connectedWhop: Bool?
            let betaAccess: Bool?
            let billingOptions: [String: Quote]?
        }

        let id: UUID
        let accessTier: String
        let role: String?
        let membership: Existing
    }

    let account: AccountStore
    let userID: UUID
    let refreshAccount: () async -> Void
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    @State private var snapshot: Snapshot?
    @State private var storefront: String?
    @State private var offer = Offer.monthly
    @State private var expectedState: String?
    @State private var operation = false
    @State private var checkingCheckout = false
    @State private var confirmCancel = false
    @State private var notice: String?
    @State private var error: (any Error)?
    @State private var retry = 0

    init(account: AccountStore, userID: UUID, preferredBillingPeriod: String = "monthly", refreshAccount: @escaping () async -> Void) {
        self.account = account
        self.userID = userID
        self.refreshAccount = refreshAccount
        _offer = State(initialValue: Offer(rawValue: preferredBillingPeriod) ?? .monthly)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let snapshot {
                    membershipCard(snapshot)
                    if snapshot.membership.connectedWhop == false {
                        NavigationLink {
                            AccountConnectionsView(api: .init(account: account, userID: userID), focusedProvider: .whop)
                        } label: {
                            Label { Text("Connect Whop") } icon: {
                                Image("sign-in-whop").resizable().scaledToFit().frame(width: 22, height: 22)
                            }
                        }.buttonStyle(.bordered)
                    }
                    Button("Check membership access", systemImage: "arrow.clockwise") {
                        Task { await checkAccess() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(operation || checkingCheckout)
                    if storefront == "USA", let options = snapshot.membership.billingOptions, !options.isEmpty {
                        choosePlan(options)
                    } else if snapshot.accessTier != "ultimate", snapshot.membership.billingOptions?.isEmpty == false {
                        Label("New subscriptions are currently unavailable in your App Store region.", systemImage: "info.circle")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    NavigationLink {
                        CreatorMembershipsView(api: .init(client: .init(account: account, userID: userID)))
                    } label: { Label("Creator subscriptions", systemImage: "person.2") }
                        .buttonStyle(.bordered)
                } else {
                    ResearchToolMessage(title: "Membership couldn’t load", error: error) { retry += 1 }
                }
                if let notice {
                    Text(notice).font(.subheadline).foregroundStyle(.secondary)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                if checkingCheckout { ProgressView("Checking your membership") }
            }
            .padding(16)
        }
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: retry) { await load() }
        .task {
            for await current in Storefront.updates { storefront = current.countryCode }
        }
        .refreshable { await load(); await refreshAccount() }
        .onChange(of: phase) { _, current in
            if current == .active, expectedState != nil {
                Task { await load(); await refreshAccount() }
            }
        }
        .onOpenURL { url in
            guard url.scheme == ProviderSignIn.scheme, url.host == "checkout", url.path == "/complete",
                  let state = expectedState, url.fragment == nil, url.user == nil, url.password == nil, url.port == nil,
                  URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems == [.init(name: "state", value: state)] else { return }
            expectedState = nil
            Task { await confirmCheckout() }
        }
        .confirmationDialog("Cancel renewal?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel renewal", role: .destructive) { Task { await cancel() } }
        } message: {
            Text("Paid access continues through the end of your billing period. Trial access may end immediately.")
        }
    }

    private func membershipCard(_ snapshot: Snapshot) -> some View {
        ResearchToolCard(color: slipPalette.accent) {
            Label("\(snapshot.accessTier.capitalized) access", systemImage: "bolt.fill").font(.title3.weight(.bold))
        } content: {
            LabeledContent("Purchased plan", value: snapshot.membership.planLabel ?? snapshot.membership.purchasedTier.capitalized)
            if snapshot.membership.provider == "whop" { LabeledContent("Billed through", value: "Whop") }
            if snapshot.role == "admin" {
                Label("Full access as an administrator", systemImage: "checkmark.shield").font(.caption).foregroundStyle(.secondary)
            } else if snapshot.membership.betaAccess == true {
                Text("Beta access is active for included tools. NBA research requires Ultimate.").font(.caption).foregroundStyle(.secondary)
            }
            if let status = snapshot.membership.status {
                LabeledContent("Status", value: status.replacingOccurrences(of: "_", with: " ").capitalized)
            }
            if let date = snapshot.membership.currentPeriodEnd.flatMap(SidelineBoard.timestamp) {
                LabeledContent(snapshot.membership.cancelAtPeriodEnd ? "Access ends" : "Current period ends",
                    value: date.formatted(date: .abbreviated, time: .omitted))
            }
            if snapshot.membership.provider == "whop", snapshot.membership.purchasedTier != "free", !snapshot.membership.cancelAtPeriodEnd {
                Button("Cancel renewal", role: .destructive) { confirmCancel = true }
                    .font(.subheadline.weight(.semibold)).disabled(operation)
            } else if snapshot.membership.provider == nil, snapshot.membership.purchasedTier != "free", !snapshot.membership.cancelAtPeriodEnd {
                Link("Manage Whop billing", destination: URL(string: "https://whop.com/account")!)
            }
        }
    }

    private func choosePlan(_ options: [String: Snapshot.Existing.Quote]) -> some View {
        ResearchToolCard(color: slipPalette.accent) {
            Text("Ultimate").font(.title2.weight(.heavy))
        } content: {
            ResearchToolRail(title: "Billing period", choices: [Offer.monthly, .discord, .annual].filter { options[$0.rawValue] != nil },
                selection: $offer, label: \.title) { offer in
                    switch offer {
                    case .monthly: "calendar"
                    case .discord: "person.2.badge.gearshape"
                    case .annual: "calendar.badge.clock"
                    }
                }
            if let quote = options[offer.rawValue] {
                Text("\(quote.price) every \(quote.days) days").font(.headline.monospacedDigit())
                if quote.trialDays > 0 {
                    Text("\(quote.trialDays)-day free trial for eligible new members.").font(.caption).foregroundStyle(.secondary)
                }
            }
            ForEach(["Full NFL and NBA slates", "The Sideline and The Court", "Odds Boards, player research and ladders"], id: \.self) {
                Label($0, systemImage: "checkmark").font(.subheadline)
            }
            Button {
                Task { await checkout() }
            } label: {
                HStack(spacing: 8) {
                    Image("sign-in-whop").renderingMode(.template).resizable().scaledToFit().frame(width: 21, height: 21)
                    Text(offer == .discord ? "Add Ultimate with Whop" : "Continue with Whop").font(.headline)
                    Spacer()
                    if operation { ProgressView() }
                }
                .padding(.horizontal, 12).frame(minHeight: 47)
                .foregroundStyle(Color(rgb: 0x150E0C)).background(Color(rgb: 0xFA4616), in: .rect(cornerRadius: 12))
            }
            .buttonStyle(SlipSurgePressStyle()).disabled(operation || checkingCheckout || options[offer.rawValue] == nil)
        }
    }

    private func load() async {
        storefront = await Storefront.current?.countryCode
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/account", account: account, userID: userID)
            let result = try JSONDecoder().decode(Snapshot.self, from: data)
            guard result.id == userID else { throw URLError(.cannotParseResponse) }
            if !Task.isCancelled {
                snapshot = result
                if let options = result.membership.billingOptions, options[offer.rawValue] == nil,
                   let available = [Offer.discord, .monthly, .annual].first(where: { options[$0.rawValue] != nil }) { offer = available }
                error = nil
            }
        } catch {
            if !Task.isCancelled { snapshot = nil; self.error = error }
        }
    }

    private func confirmCheckout() async {
        guard !checkingCheckout else { return }
        checkingCheckout = true
        notice = nil
        defer { checkingCheckout = false }
        for attempt in 0..<5 {
            await load()
            guard account.memberID == userID, !Task.isCancelled else { return }
            if snapshot?.membership.purchasedTier == "ultimate", snapshot?.accessTier == "ultimate" {
                await refreshAccount()
                notice = "Ultimate is active."
                return
            }
            if attempt < 4 {
                do { try await Task.sleep(for: .seconds(2)) }
                catch { return }
            }
        }
        notice = "Your access hasn’t updated yet. Use Check membership access after Whop confirms the purchase."
    }

    private func checkAccess() async {
        guard !checkingCheckout, !operation else { return }
        checkingCheckout = true
        notice = nil
        defer { checkingCheckout = false }
        await load()
        guard account.memberID == userID, !Task.isCancelled else { return }
        await refreshAccount()
        guard let snapshot else { return }
        if snapshot.membership.purchasedTier != "free" {
            notice = "\(snapshot.membership.planLabel ?? snapshot.membership.purchasedTier.capitalized) is on this account."
        } else if snapshot.role == "admin" {
            notice = "Ultimate research is available through your administrator account."
        } else if snapshot.membership.connectedWhop == false {
            notice = "If you already subscribed through Whop, connect the Whop account you used for checkout."
        } else {
            notice = "Whop access hasn’t appeared on this account. Check your membership on Whop."
        }
    }

    private func checkout() async {
        guard !operation, !checkingCheckout, storefront == "USA",
              let quote = snapshot?.membership.billingOptions?[offer.rawValue] else { return }
        operation = true
        notice = nil
        defer { operation = false }
        let currentStorefront = await Storefront.current?.countryCode
        guard currentStorefront == "USA" else {
            storefront = currentStorefront
            return
        }
        do {
            struct Checkout: Decodable { let purchaseUrl: URL }
            let state = try ProviderSignIn.randomValue()
            let data = try await send("/api/whop/checkout-session", values: ["planId": quote.id, "state": state])
            let url = try JSONDecoder().decode(Checkout.self, from: data).purchaseUrl
            guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
                  let domain = url.host?.lowercased(), domain == "whop.com" || domain.hasSuffix(".whop.com") else {
                throw URLError(.badURL)
            }
            expectedState = state
            openURL(url) { accepted in
                if !accepted {
                    expectedState = nil
                    notice = "Checkout couldn’t open."
                }
            }
        } catch {
            notice = "Checkout couldn’t start. Refresh your membership and try again."
        }
    }

    private func cancel() async {
        guard !operation else { return }
        operation = true
        notice = nil
        defer { operation = false }
        do {
            _ = try await send("/api/whop/cancel-membership", values: [:])
        } catch {
            notice = "Cancellation couldn’t be confirmed. Check your current status."
        }
        await load()
        await refreshAccount()
    }

    private func send(_ path: String, values: [String: String]) async throws -> Data {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path)
        request.httpMethod = "POST"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(values)
        return try await SlipSurgeHTTP.send(request)
    }
}
