import StoreKit
import SwiftUI

struct MembershipBillingView: View {
    private enum Offer: String, CaseIterable {
        case monthly = "Monthly"
        case annual = "Annual"
        case discord = "Discord offer"

        var id: String {
            switch self {
            case .monthly: "plan_2uISqRWL3Re5v"
            case .annual: "plan_Brp4I5MDssXY0"
            case .discord: "plan_Q1Ey6RMgjS9XQ"
            }
        }

        var price: String? {
            switch self {
            case .monthly: "$19.99 every 30 days"
            case .annual: "$199.99 every 365 days"
            case .discord: nil
            }
        }
    }

    private struct Snapshot: Decodable {
        struct Existing: Decodable {
            let purchasedTier: String
            let status: String?
            let currentPeriodEnd: String?
            let cancelAtPeriodEnd: Bool
            let provider: String?
            let discordClaim: Bool?
        }

        let id: UUID
        let accessTier: String
        let membership: Existing
    }

    let account: AccountStore
    let userID: UUID
    let refreshAccount: () async -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var openURL
    @State private var snapshot: Snapshot?
    @State private var storefront: String?
    @State private var offer = Offer.monthly
    @State private var expectedState: String?
    @State private var operation = false
    @State private var confirmCancel = false
    @State private var notice: String?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let snapshot {
                    membershipCard(snapshot)
                    if snapshot.membership.purchasedTier == "free", snapshot.accessTier != "ultimate", storefront == "USA" {
                        choosePlan(discord: snapshot.membership.discordClaim == true)
                    }
                } else {
                    ResearchToolMessage(title: "Membership couldn’t load", error: error) { retry += 1 }
                }
                if let notice {
                    Text(notice).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding(16)
        }
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: retry) { await load() }
        .refreshable { await load() }
        .onChange(of: phase) { _, current in
            if current == .active, expectedState != nil { Task { await load() } }
        }
        .onOpenURL { url in
            guard url.scheme == ProviderSignIn.scheme, url.host == "checkout", url.path == "/complete",
                  let state = expectedState, url.fragment == nil, url.user == nil, url.password == nil, url.port == nil,
                  URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems == [.init(name: "state", value: state)] else { return }
            expectedState = nil
            Task { await load(); await refreshAccount() }
        }
        .confirmationDialog("Cancel renewal?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel renewal", role: .destructive) { Task { await cancel() } }
        } message: {
            Text("Your current benefits stay active through the end of the paid period.")
        }
    }

    private func membershipCard(_ snapshot: Snapshot) -> some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("\(snapshot.accessTier.capitalized) access", systemImage: "bolt.fill").font(.title3.weight(.bold))
        } content: {
            LabeledContent("Purchased plan", value: snapshot.membership.purchasedTier.capitalized)
            if snapshot.membership.provider == "whop" { LabeledContent("Billed through", value: "Whop") }
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
            }
        }
    }

    private func choosePlan(discord: Bool) -> some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Text("Ultimate").font(.title2.weight(.heavy))
        } content: {
            ResearchToolRail(title: "Billing period", choices: discord ? [.discord, .annual] : [.monthly, .annual],
                selection: $offer, label: \.rawValue) { $0 == .discord ? "person.2" : "calendar" }
            if let price = offer.price { Text(price).font(.headline.monospacedDigit()) }
            if offer == .monthly { Text("3-day free trial for eligible new members.").font(.caption).foregroundStyle(.secondary) }
            ForEach(["Full NFL and NBA slates", "The Sideline and The Court", "Odds Boards, player research and ladders"], id: \.self) {
                Label($0, systemImage: "checkmark").font(.subheadline)
            }
            Button {
                Task { await checkout() }
            } label: {
                HStack(spacing: 8) {
                    Image("sign-in-whop").renderingMode(.template).resizable().scaledToFit().frame(width: 21, height: 21)
                    Text("Continue with Whop").font(.headline)
                    Spacer()
                    if operation { ProgressView() }
                }
                .padding(.horizontal, 12).frame(minHeight: 47)
                .foregroundStyle(Color(rgb: 0x150E0C)).background(Color(rgb: 0xFA4616), in: .rect(cornerRadius: 12))
            }
            .buttonStyle(SlipSurgePressStyle()).disabled(operation)
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
                if offer == .monthly, result.membership.discordClaim == true { offer = .discord }
                error = nil
            }
        } catch {
            if !Task.isCancelled { snapshot = nil; self.error = error }
        }
    }

    private func checkout() async {
        guard !operation, storefront == "USA" else { return }
        operation = true
        notice = nil
        defer { operation = false }
        do {
            struct Checkout: Decodable { let purchaseUrl: URL }
            let state = try ProviderSignIn.randomValue()
            let data = try await send("/api/whop/checkout-session", values: ["planId": offer.id, "state": state])
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
