import SwiftUI

struct CreatorBusinessView: View {
    enum Section { case promotion, settings }

    let api: CreatorStoreAPI
    let section: Section
    @Environment(\.colorScheme) private var scheme
    @State private var page: CreatorStorePage?
    @State private var error: (any Error)?
    @State private var revision = 0

    private var viewer: DiscoverAPI { .init(account: api.account, userID: api.userID) }
    private var published: Bool { page?.store?.status == "published" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if section == .promotion {
                    if let page { promotion(page) }
                    else { ResearchToolMessage(title: "Promotion details couldn’t load", error: error) { revision += 1 } }
                } else {
                    settings
                }
            }.padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(section == .promotion ? "Promotion" : "Creator Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { if section == .promotion { await load() } }
        .refreshable { if section == .promotion { await load() } }
    }

    private func promotion(_ page: CreatorStorePage) -> some View {
        let store = page.store
        let coverage = (store?.sports ?? []) + (store?.tags ?? [])
        return VStack(alignment: .leading, spacing: 13) {
            DiscoverIdentityCard(title: store?.name ?? page.storeName, subtitle: published ? "Published" : "Draft",
                detail: store?.bio, avatar: store?.logoUrl.flatMap(URL.init(string:)),
                banner: store?.coverUrl.flatMap(URL.init(string:)), symbol: "storefront", count: nil)
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                ResearchSectionTitle(title: "Discovery")
            } content: {
                LabeledContent("Marketplace", value: published ? "Published" : "Finish store setup")
                LabeledContent("SlipSurge feature", value: store?.featured == true ? "Featured in discovery" : "Selected by SlipSurge")
                if !coverage.isEmpty { Text(coverage.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary) }
                NavigationLink {
                    CreatorStoreView(api: api).onDisappear { revision += 1 }
                } label: { Label("Edit store & tags", systemImage: "pencil") }.buttonStyle(.borderedProminent)
                if published, let username = page.username, let link = URL(string: "https://\(SlipSurgeHTTP.site)/creators/\(username)") {
                    ShareLink(item: link) { Label("Share storefront", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered)
                    NavigationLink {
                        CreatorDetailView(api: viewer, username: username)
                    } label: { Label("View storefront", systemImage: "storefront") }.buttonStyle(.bordered)
                }
                NavigationLink {
                    DiscoverView(api: viewer, opensDestination: .constant(.creators))
                } label: { Label("Browse creators", systemImage: "safari") }.buttonStyle(.bordered)
            }
        }
    }

    private var settings: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            ResearchSectionTitle(title: "Storefront and Payments")
        } content: {
            NavigationLink {
                CreatorStoreView(api: api)
            } label: { Label("Edit public storefront", systemImage: "storefront") }.buttonStyle(.bordered)
            NavigationLink {
                NativeSettings(account: api.account, userID: api.userID, section: .profile)
            } label: { Label("Edit public profile", systemImage: "person.crop.circle") }.buttonStyle(.bordered)
            NavigationLink {
                AccountConnectionsView(api: .init(account: api.account, userID: api.userID))
            } label: { Label("Whop & Discord connections", systemImage: "link") }.buttonStyle(.bordered)
            NavigationLink {
                CreatorWalletView(api: .init(account: api.account, userID: api.userID))
            } label: { Label("Balance & payouts", systemImage: "wallet.bifold") }.buttonStyle(.bordered)
        }
    }

    private func load() async {
        error = nil
        do {
            let result = try await api.load()
            try Task.checkCancellation()
            page = result
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
