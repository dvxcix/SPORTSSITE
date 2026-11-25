import SwiftUI

struct CreatorDetailView: View {
    private struct Follow: Decodable { let following: Bool }

    let api: DiscoverAPI
    let creator: DiscoverAPI.Creators.Creator
    @Environment(\.colorScheme) private var scheme
    @State private var following: Bool?
    @State private var saving = false
    @State private var failed = false

    private var path: String { "/api/mobile/creators/\(creator.id.uuidString.lowercased())" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                DiscoverIdentityCard(title: creator.title, subtitle: "@\(creator.username)",
                    detail: creator.storefront?.bio ?? creator.bio, avatar: creator.storefront?.logoUrl ?? creator.avatarUrl,
                    banner: creator.storefront?.coverUrl ?? creator.bannerUrl, symbol: "person.crop.circle",
                    count: creator.followerCount.map { "\($0.formatted()) followers" })
                if let following {
                    Button(following ? "Following" : "Follow", systemImage: following ? "person.fill.checkmark" : "person.badge.plus") {
                        Task { await change(!following) }
                    }.buttonStyle(.borderedProminent)
                        .disabled(saving).sensoryFeedback(.selection, trigger: following)
                }
                if failed {
                    Button("Refresh follow status") { Task { await load() } }
                }
                if !creator.sports.isEmpty {
                    HStack(spacing: 12) {
                        ForEach(creator.sports, id: \.self) { sport in
                            HStack(spacing: 5) {
                                ResearchArtwork(urls: LeagueArtwork.logo(sport).map { [$0] } ?? [], fallback: "sportscourt")
                                    .frame(width: 19, height: 19)
                                Text(LeagueArtwork.label(sport)).font(.caption.weight(.semibold))
                            }
                        }
                    }
                }
                if !creator.creatorProducts.isEmpty {
                    Text("Memberships").font(.headline).accessibilityAddTraits(.isHeader)
                }
                ForEach(creator.creatorProducts) { membership in
                    ResearchToolCard(color: Brand.accent(for: scheme)) {
                        Text(membership.title).font(.headline)
                    } content: {
                        if let description = membership.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
                        let cycle = membership.billingPeriodDays.map { " / \($0) days" } ?? ""
                        Text(membership.price.formatted(.currency(code: membership.currency ?? "USD")) + cycle)
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                    }
                }
            }
            .padding(16)
        }
        .task { await load() }
        .refreshable { await load() }
        .navigationTitle(creator.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }

    private func load() async {
        guard let user = api.userID, user != creator.id else { return }
        do {
            let result = try await api.memberRead(Follow.self, path: path)
            if !Task.isCancelled { following = result.following; failed = false }
        } catch {
            if !Task.isCancelled { following = nil; failed = true }
        }
    }

    private func change(_ follow: Bool) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            following = try await api.write(Follow.self, path: path, body: ["follow": follow]).following
            failed = false
        } catch {
            await load()
            failed = true
        }
    }
}
