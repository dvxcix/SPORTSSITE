import Charts
import SwiftUI

struct CreatorAnalyticsView: View {
    private struct Analytics: Decodable {
        struct Funnel: Decodable {
            let storefrontViews: Int
            let offerViews: Int
            let checkoutStarts: Int
            let purchases: Int
        }

        struct Source: Decodable, Identifiable {
            let source: String
            let count: Int
            var id: String { source }
        }

        struct Offer: Decodable, Identifiable {
            let id: UUID
            let title: String
            let views: Int
            let checkouts: Int
            let purchases: Int
            let activeMembers: Int
            let revenue: Double
        }

        let followers: Int
        let activeMembers: Int
        let trialingMembers: Int
        let atRiskMembers: Int
        let churned: Int
        let retentionRate: Double
        let newMembers: Int
        let memberGrowth: Int
        let revenue: Double
        let revenueGrowth: Double
        let engagement: Int
        let posts: Int
        let funnel: Funnel
        let sources: [Source]
        let offers: [Offer]
        let limited: Bool
    }

    private struct Stage: Identifiable {
        let title: String
        let value: Int
        let icon: String
        var id: String { title }
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var snapshot: Analytics?
    @State private var failure: (any Error)?
    @State private var revision = 0
    @State private var highlighted: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                if let snapshot {
                    overview(snapshot)
                    funnel(snapshot)
                    audience(snapshot)
                    offers(snapshot)
                    if snapshot.limited {
                        Label("Some activity exceeds the report’s current history limit.", systemImage: "info.circle")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    ResearchToolMessage(title: "Analytics couldn’t load", error: failure) { revision += 1 }
                }
            }.padding(16)
        }
        .navigationTitle("Analytics")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func overview(_ data: Analytics) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Last 30 Days").font(.title2.bold()).accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: textSize.isAccessibilitySize ? 1 : 2), spacing: 9) {
                metric("New members", icon: "person.badge.plus", value: data.newMembers.formatted(),
                    detail: "\(signed(Double(data.memberGrowth))) vs prior 30 days", change: Double(data.memberGrowth))
                metric("Revenue", icon: "creditcard", value: money(data.revenue),
                    detail: "\(data.revenueGrowth >= 0 ? "+" : "−")\(money(abs(data.revenueGrowth))) vs prior 30 days", change: data.revenueGrowth)
                metric("Retention", icon: "checkmark.shield", value: ResearchFormat.decimal(data.retentionRate, suffix: "%"),
                    detail: "\(data.churned) lost · \(data.atRiskMembers) at risk")
                metric("Engagement", icon: "chart.bar", value: data.engagement.formatted(), detail: "Across \(data.posts) posts")
            }
        }
    }

    private func metric(_ title: String, icon: String, value: String, detail: String, change: Double? = nil) -> some View {
        ResearchToolCard(color: change.flatMap { dugoutTone($0, scheme: scheme) } ?? slipPalette.accent) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
        } content: {
            Text(value).font(.title3.weight(.bold).monospacedDigit())
            Text(detail).font(.caption).foregroundStyle(change.flatMap { dugoutTone($0, scheme: scheme) } ?? .secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func funnel(_ data: Analytics) -> some View {
        let stages: [Stage] = [
            .init(title: "Storefront", value: data.funnel.storefrontViews, icon: "storefront"),
            .init(title: "Offer views", value: data.funnel.offerViews, icon: "eye"),
            .init(title: "Checkout", value: data.funnel.checkoutStarts, icon: "cart"),
            .init(title: "Purchases", value: data.funnel.purchases, icon: "checkmark.seal"),
        ]
        let maximum = max(stages.map(\.value).max() ?? 0, 1)
        return ResearchToolCard(color: slipPalette.accent) {
            ResearchSectionTitle(title: "From Discovery to Access")
        } content: {
            Chart(stages) { stage in
                BarMark(x: .value("Count", stage.value), y: .value("Stage", stage.title))
                    .foregroundStyle(slipPalette.accent.opacity(highlighted == nil || highlighted == stage.title ? 0.87 : 0.30))
                    .cornerRadius(5)
                    .annotation(position: .trailing) {
                        Text(stage.value.formatted()).font(.caption.weight(.semibold)).monospacedDigit().accessibilityHidden(true)
                    }
            }
            .chartYAxis {
                AxisMarks { value in
                    if let title = value.as(String.self), let stage = stages.first(where: { $0.title == title }) {
                        AxisValueLabel { Label(stage.title, systemImage: stage.icon).font(.caption) }
                    }
                }
            }
            .chartXAxis(.hidden)
            .chartXScale(domain: 0...Double(maximum) * 1.19)
            .chartYSelection(value: $highlighted)
            .frame(height: 148)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: highlighted)
            ResearchToolValues(items: [
                .init(label: "Followers", text: data.followers.formatted()),
                .init(label: "Active", text: data.activeMembers.formatted()),
                .init(label: "Trialing", text: data.trialingMembers.formatted()),
            ])
        }
    }

    private func audience(_ data: Analytics) -> some View {
        ResearchToolCard(color: slipPalette.accent) {
            ResearchSectionTitle(title: "Audience Sources")
        } content: {
            if data.sources.isEmpty { Text("No visits recorded in this period.").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(data.sources) { source in
                LabeledContent(source.source.capitalized, value: source.count.formatted()).font(.subheadline)
            }
        }
    }

    private func offers(_ data: Analytics) -> some View {
        ResearchToolCard(color: slipPalette.accent) {
            ResearchSectionTitle(title: "Membership Performance")
        } content: {
            if data.offers.isEmpty { Text("No membership offers yet.").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(data.offers) { offer in
                DisclosureGroup(offer.title) {
                    ResearchToolValues(items: [
                        .init(label: "Views", text: offer.views.formatted()), .init(label: "Checkouts", text: offer.checkouts.formatted()),
                        .init(label: "Purchased", text: offer.purchases.formatted()), .init(label: "Active", text: offer.activeMembers.formatted()),
                        .init(label: "Revenue", text: money(offer.revenue)),
                    ])
                }.font(.subheadline.weight(.semibold))
            }
        }
    }

    private func money(_ amount: Double) -> String { amount.formatted(.currency(code: "USD")) }
    private func signed(_ change: Double) -> String { ResearchFormat.signedDecimal(change) }

    private func load() async {
        failure = nil
        do {
            let response = try await api.memberRead(Analytics.self, path: "/api/mobile/creator-analytics")
            try Task.checkCancellation()
            snapshot = response
        } catch {
            if !Task.isCancelled { failure = error }
        }
    }
}
