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
    @Environment(\.dynamicTypeSize) private var textSize
    @AppStorage("appearance") private var appearance = Appearance.color
    @State private var catalog: Catalog?
    @State private var billingPeriod = "monthly"
    @State private var canShowWhop = false
    @State private var problem: (any Error)?
    @State private var retry = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let catalog {
                    if canShowWhop && account.memberID == nil {
                        if textSize.isAccessibilitySize { billingPicker.pickerStyle(.menu) }
                        else { billingPicker.pickerStyle(.segmented) }
                    }
                    plan(catalog, ultimate: true)
                    plan(catalog, ultimate: false)
                } else {
                    ResearchToolMessage(title: "Memberships couldn’t load", error: problem) { retry += 1 }
                }
                previews
            }.padding(16).frame(maxWidth: 530).frame(maxWidth: .infinity)
        }
        .navigationTitle("Memberships")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: retry) { await load() }
        .task {
            for await storefront in Storefront.updates {
                canShowWhop = storefront.countryCode == "USA"
            }
        }
        .refreshable { await load() }
    }

    private var billingPicker: some View {
        Picker("Billing period", selection: $billingPeriod) {
            Text("Monthly").tag("monthly")
            Text("Annual").tag("annual")
        }
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
            planHeading(catalog, ultimate: ultimate)
        } content: {
            Text(ultimate ? "Full slates, player trends and sportsbook comparisons." : "Research previews and the community feed.")
                .font(.subheadline).foregroundStyle(slipPalette.text.opacity(0.76))
            if ultimate {
                NavigationLink {
                    NativeMemberIntent(account: account, appearance: $appearance,
                        purpose: "Sign in to see the Ultimate options available to your account.") { userID in
                        MembershipBillingView(account: account, userID: userID, preferredBillingPeriod: billingPeriod,
                            refreshAccount: account.refreshMembershipAccess)
                    }
                } label: {
                    Text(account.memberID == nil ? "Sign in for Ultimate" :
                        account.showsUltimateOffer && canShowWhop ? "View available offers" : "View membership")
                        .foregroundStyle(slipPalette.colorScheme == .light ? .white : Color(rgb: 0x102000))
                }
                .buttonStyle(.borderedProminent)
                .tint(slipPalette.accent)
            } else if account.memberID == nil {
                NavigationLink {
                    EmailAccountForm(account: account, flow: .registration)
                } label: { Text("Sign up free") }
                .buttonStyle(.bordered)
            }
            DisclosureGroup("What’s included") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(catalog.features.filter { ultimate || $0.free }) { feature in
                        Label(feature.label, systemImage: "checkmark").font(.subheadline)
                    }
                }
                .padding(.vertical, 6)
            }
        }
    }

    private func planHeading(_ catalog: Catalog, ultimate: Bool) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                planLabel(ultimate)
                    .fixedSize(horizontal: true, vertical: false)
                Spacer(minLength: 8)
                price(catalog, ultimate: ultimate, alignment: .trailing)
                    .fixedSize(horizontal: true, vertical: false)
            }
            VStack(alignment: .leading, spacing: 6) {
                planLabel(ultimate)
                price(catalog, ultimate: ultimate, alignment: .leading)
            }
        }
    }

    private func planLabel(_ ultimate: Bool) -> some View {
        Label(ultimate ? "Ultimate" : "Free", systemImage: ultimate ? "bolt.fill" : "person.crop.circle")
            .font(.title2.weight(.bold))
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private func price(_ catalog: Catalog, ultimate: Bool, alignment: HorizontalAlignment) -> some View {
        if ultimate, canShowWhop, account.memberID == nil, let quote = catalog.billing[billingPeriod] {
            VStack(alignment: alignment, spacing: 2) {
                Text(verbatim: quote.price).font(.headline.monospacedDigit())
                Text("Every \(quote.days) days").font(.caption).foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
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
