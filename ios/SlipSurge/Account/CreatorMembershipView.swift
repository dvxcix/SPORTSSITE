import StoreKit
import SwiftUI

struct CreatorMembershipView: View {
    let account: AccountStore
    let offer: CreatorMembershipOffer
    let creatorID: UUID?
    var artwork: URL? = nil
    @AppStorage("appearance") private var appearance = Appearance.system
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var phase
    @State private var signIn = false
    @State private var storefront: String?
    @State private var access: CreatorMembershipAPI.Access?
    @State private var error: (any Error)?
    @State private var checkoutState: String?
    @State private var operation = false
    @State private var feedback: String?

    private var client: DiscoverAPI { .init(account: account, userID: account.memberID) }
    private var api: CreatorMembershipAPI { .init(client: client) }
    private var owner: Bool { creatorID != nil && creatorID == account.memberID }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                DiscoverIdentityCard(title: offer.title, subtitle: offer.productType == "one_time" ? "Access pass" : "Creator membership",
                    detail: offer.description, avatar: artwork, banner: nil, symbol: "person.crop.circle", count: nil)
                ResearchToolCard(color: Brand.accent(for: scheme)) { Text("Member access").font(.headline) } content: {
                    if let access, access.active {
                        Label("Access active", systemImage: "checkmark.seal.fill").foregroundStyle(Brand.accent(for: scheme))
                        if let group = access.group {
                            NavigationLink {
                                CommunityDetailView(api: client, group: group, initialMember: true)
                            } label: { Label("Open \(group.name)", systemImage: "person.2") }.buttonStyle(.borderedProminent)
                        }
                    } else if let price = offer.price {
                        Text(price.formatted(.currency(code: offer.currency?.uppercased() ?? "USD"))).font(.title3.weight(.semibold))
                        if let days = offer.billingPeriodDays {
                            Text(offer.productType == "one_time" ? "\(days) days · one payment" : "Every \(days) days").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    membershipActions
                    if let feedback { Text(feedback).font(.subheadline).foregroundStyle(.secondary) }
                    if error != nil { Button("Retry access check") { Task { await load() } }.buttonStyle(.bordered) }
                }
            }.padding(16)
        }
        .navigationTitle(offer.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: account.memberID) {
            storefront = await Storefront.current?.countryCode
            await load()
        }
        .refreshable { await load() }
        .sheet(isPresented: $signIn) { NavigationStack { AccountSignInView(account: account, appearance: $appearance) } }
        .onChange(of: account.memberID) { _, member in if member != nil { signIn = false } }
        .onChange(of: phase) { _, state in if state == .active && checkoutState != nil { Task { await load() } } }
        .onOpenURL { url in
            guard url.scheme == ProviderSignIn.scheme, url.host == "checkout", url.path == "/complete", let checkoutState,
                url.fragment == nil, url.user == nil, url.password == nil, url.port == nil,
                URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems == [.init(name: "state", value: checkoutState)] else { return }
            self.checkoutState = nil
            Task {
                for attempt in 0..<5 {
                    await load()
                    if access?.active == true || Task.isCancelled { return }
                    if attempt < 4 { try? await Task.sleep(for: .seconds(2)) }
                }
                feedback = "Check access again once your payment is confirmed."
            }
        }
    }

    @ViewBuilder
    private var membershipActions: some View {
        if account.memberID == nil {
            Button("Sign in", systemImage: "person.crop.circle") { signIn = true }.buttonStyle(.borderedProminent)
        } else if !owner {
            if access?.active != true && access != nil && storefront == "USA" && (offer.status == nil || offer.status == "active") {
                Button { Task { await checkout() } } label: {
                    HStack(spacing: 8) {
                        Image("sign-in-whop").renderingMode(.template).resizable().scaledToFit().frame(width: 18, height: 18).accessibilityHidden(true)
                        Text(offer.productType == "one_time" ? "Get access" : "Join membership")
                    }
                }.buttonStyle(.borderedProminent).tint(Color(rgb: 0xF96630)).disabled(operation)
            }
            if access?.status != "pending" && access != nil || offer.accessStatus != nil {
                Button("Manage through Whop", systemImage: "creditcard") { Task { await run { openURL(try await api.manage(offer.id)) } } }
                    .buttonStyle(.bordered).disabled(operation)
            }
            if access?.active != true {
                Button("Restore Whop access", systemImage: "arrow.clockwise") { Task { await restore() } }
                    .buttonStyle(.bordered).disabled(operation)
            }
        }
    }

    private func load() async {
        guard account.memberID != nil else { access = nil; return }
        do {
            let result = try await api.access(offer.id)
            if !Task.isCancelled { access = result; error = nil; if result.active { feedback = nil } }
        } catch { if !Task.isCancelled { self.error = error } }
    }

    private func checkout() async {
        guard storefront == "USA" else { return }
        await run {
            let state = try checkoutState ?? ProviderSignIn.randomValue()
            checkoutState = state
            openURL(try await api.checkout(offer.id, state: state))
        }
    }

    private func restore() async {
        await run {
            try await api.restore(offer.id)
            await load()
            if access?.active != true { feedback = "Whop hasn’t confirmed active access for this account." }
        }
    }

    private func run(_ action: () async throws -> Void) async {
        guard !operation else { return }
        operation = true
        feedback = nil
        defer { operation = false }
        do { try await action() }
        catch let error as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            feedback = (try? JSONDecoder().decode(Details.self, from: error.data))?.error ?? "This membership action couldn’t be confirmed."
        } catch { feedback = "This membership action couldn’t be confirmed." }
    }
}

struct CreatorMembershipsView: View {
    let api: CreatorMembershipAPI
    @Environment(\.colorScheme) private var scheme
    @State private var offers: [CreatorMembershipOffer]?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        List {
            if let offers {
                if offers.isEmpty { ContentUnavailableView("No creator memberships", systemImage: "person.2") }
                ForEach(offers) { offer in
                    NavigationLink {
                        CreatorMembershipView(account: api.client.account, offer: offer, creatorID: nil)
                    } label: {
                        LabeledContent(offer.title, value: offer.active == true ? "Active" : (offer.accessStatus?.capitalized ?? ""))
                    }
                    .listRowBackground(Brand.surface(for: scheme))
                }
            } else { ResearchToolMessage(title: "Creator memberships couldn’t load", error: error) { retry += 1 } }
        }
        .navigationTitle("Creator memberships")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: retry) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { offers = try await api.memberships(); error = nil }
        catch { if !Task.isCancelled { self.error = error } }
    }
}
