import StoreKit
import SwiftUI

struct NativeMembershipOverview: View {
    private struct Catalog: Decodable {
        struct Billing: Decodable { let price: String; let days: Int }
        struct Feature: Decodable, Identifiable {
            let label: String
            let free: Bool
            var id: String { label }
        }

        let billing: [String: Billing]
        let features: [Feature]
    }

    let account: AccountStore
    @Environment(\.slipPalette) private var slipPalette
    @AppStorage("appearance") private var appearance = Appearance.color
    @State private var catalog: Catalog?
    @State private var billingPeriod = "monthly"
    @State private var canShowWhop = false
    @State private var problem: (any Error)?
    @State private var retry = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                previews
                if let catalog {
                    if canShowWhop {
                        Picker("Billing period", selection: $billingPeriod) {
                            Text("Monthly").tag("monthly")
                            Text("Annual").tag("annual")
                        }.pickerStyle(.segmented)
                    }
                    plan(catalog, ultimate: true)
                    plan(catalog, ultimate: false)
                } else {
                    ResearchToolMessage(title: "Memberships couldn’t load", error: problem) { retry += 1 }
                }
            }.padding(16).frame(maxWidth: 530).frame(maxWidth: .infinity)
        }
        .navigationTitle("Memberships")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: retry) { await load() }
        .refreshable { await load() }
    }

    private var previews: some View {
        HStack(spacing: 9) {
            NavigationLink { CourtView(scope: .preview) } label: { previewLabel("NBA") }
            NavigationLink { SidelineView(api: SidelineAPI()) } label: { previewLabel("NFL") }
        }.buttonStyle(.bordered)
    }

    private func previewLabel(_ sport: String) -> some View {
        HStack(spacing: 6) {
            ResearchArtwork(urls: LeagueArtwork.logo(sport).map { [$0] } ?? [], fallback: "sportscourt")
                .frame(width: 22, height: 22)
            Text("\(sport) preview").font(.subheadline.weight(.semibold))
        }.frame(maxWidth: .infinity, minHeight: 36)
    }

    private func plan(_ catalog: Catalog, ultimate: Bool) -> some View {
        ResearchToolCard(color: ultimate ? slipPalette.accent : slipPalette.surface) {
            HStack {
                Label(ultimate ? "Ultimate" : "Free", systemImage: ultimate ? "bolt.fill" : "person.crop.circle")
                    .font(.title2.weight(.bold))
                Spacer(minLength: 0)
                if !ultimate { Text("$0").font(.headline.monospacedDigit()) }
                if ultimate, canShowWhop, let quote = catalog.billing[billingPeriod] {
                    VStack(alignment: .trailing) {
                        Text(verbatim: quote.price).font(.headline.monospacedDigit())
                        Text("Every \(quote.days) days").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        } content: {
            ForEach(catalog.features.filter { ultimate || $0.free }) { feature in
                Label(feature.label, systemImage: "checkmark").font(.subheadline)
            }
            if ultimate {
                NavigationLink {
                    if let userID = account.memberID {
                        MembershipBillingView(account: account, userID: userID, preferredBillingPeriod: billingPeriod, refreshAccount: {})
                    } else {
                        AccountSignInView(account: account, appearance: $appearance)
                    }
                } label: { Text(account.memberID == nil ? "Sign in for Ultimate" : "Manage membership") }
                .buttonStyle(.borderedProminent)
            } else if account.memberID == nil {
                NavigationLink {
                    EmailAccountForm(account: account, flow: .registration)
                } label: { Text("Sign up free") }
                .buttonStyle(.bordered)
            }
        }
    }

    private func load() async {
        canShowWhop = await Storefront.current?.countryCode == "USA"
        do {
            let data: Catalog = try await SlipSurgeHTTP.get("/api/mobile/information", query: [.init(name: "page", value: "membership")])
            catalog = data
            problem = nil
        } catch { if !Task.isCancelled { problem = error } }
    }
}
