import SwiftUI

struct CreatorDetailView: View {
    enum Section: String, CaseIterable {
        case memberships, research, communities, about

        var label: String {
            switch self { case .memberships: "Storefront"; case .research: "Research & Picks"; case .communities: "Communities"; case .about: "About" }
        }
        var icon: String {
            switch self { case .memberships: "storefront"; case .research: "chart.line.uptrend.xyaxis"; case .communities: "person.2"; case .about: "info.circle" }
        }
    }

    let api: DiscoverAPI
    let username: String
    var preview: DiscoverAPI.Creators.Creator?
    @Environment(\.colorScheme) private var scheme
    @State private var section: Section
    @State private var store: CreatorPublicStoreAPI.Storefront?
    @State private var following: Bool?
    @State private var saving = false
    @State private var failure: (any Error)?
    @State private var actionFailure = false
    @State private var selectedPost: UUID?

    init(api: DiscoverAPI, username: String, section: Section = .memberships, preview: DiscoverAPI.Creators.Creator? = nil) {
        self.api = api
        self.username = username
        self.preview = preview
        _section = State(initialValue: section)
    }

    private var directory: CreatorPublicStoreAPI { .init(client: api) }
    private var creator: DiscoverAPI.Creators.Creator? { store?.creator ?? preview }
    private var feed: FeedAPI { .init(account: api.account, userID: api.userID) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                if let creator {
                    identity(creator)
                    if let store {
                        ResearchToolRail(title: "Storefront sections", choices: Section.allCases, selection: $section, label: \.label, glyph: \.icon)
                        content(store)
                    } else { status }
                } else { status }
            }.padding(16)
        }
        .navigationTitle(creator?.title ?? "Creator")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task { await load() }
        .refreshable { await load() }
        .navigationDestination(item: $selectedPost) { id in FeedThreadView(api: feed, id: id) }
        .toolbar {
            if creator != nil, let url = URL(string: "https://\(SlipSurgeHTTP.site)/creators/\(username)") {
                ToolbarItem(placement: .primaryAction) { ShareLink(item: url).labelStyle(.iconOnly) }
            }
        }
    }

    @ViewBuilder private var status: some View {
        if (failure as? SlipSurgeHTTP.Status)?.code == 404 {
            ContentUnavailableView("Creator unavailable", systemImage: "person.crop.circle.badge.xmark")
        } else {
            ResearchToolMessage(title: "Storefront couldn’t load", error: failure) { Task { await load() } }
        }
    }

    private func identity(_ creator: DiscoverAPI.Creators.Creator) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            DiscoverIdentityCard(title: creator.title, subtitle: "@\(creator.username)", detail: creator.storefront?.bio ?? creator.bio,
                avatar: creator.storefront?.logoUrl ?? creator.avatarUrl, banner: creator.storefront?.coverUrl ?? creator.bannerUrl,
                symbol: "person.crop.circle", count: creator.followerCount.map { "\($0.formatted()) followers" })
            if creator.isVerified == true {
                Label("Verified creator", systemImage: "checkmark.seal.fill").font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
            }
            if !creator.sports.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(creator.sports, id: \.self) { sport in
                            Label {
                                Text(LeagueArtwork.label(sport))
                            } icon: {
                                ResearchArtwork(urls: LeagueArtwork.logo(sport).map { [$0] } ?? [], fallback: "sportscourt")
                                    .frame(width: 21, height: 21)
                            }.font(.caption.weight(.semibold))
                        }
                    }
                }.scrollIndicators(.hidden)
            }
            if !creator.tags.isEmpty { Text(creator.tags.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
            ViewThatFits(in: .horizontal) {
                HStack { actions(creator) }
                VStack(alignment: .leading) { actions(creator) }
            }
            if actionFailure {
                Text("Follow change couldn’t be confirmed.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func actions(_ creator: DiscoverAPI.Creators.Creator) -> some View {
        if let following {
            Button(following ? "Following" : "Follow", systemImage: following ? "person.fill.checkmark" : "person.badge.plus") {
                Task { await change(!following, creator: creator.id) }
            }
            .buttonStyle(.borderedProminent).disabled(saving).sensoryFeedback(.selection, trigger: following)
        }
        NavigationLink {
            MemberProfileView(api: api, target: creator.username)
        } label: { Label("Public posts & record", systemImage: "person.crop.circle") }.buttonStyle(.bordered)
        if api.userID == creator.id {
            NavigationLink {
                CreatorStoreView(api: .init(account: api.account, userID: creator.id))
            } label: { Label("Edit storefront", systemImage: "pencil") }.buttonStyle(.bordered)
        }
    }

    @ViewBuilder private func content(_ store: CreatorPublicStoreAPI.Storefront) -> some View {
        switch section {
        case .memberships:
            if store.creator.creatorProducts.isEmpty {
                ContentUnavailableView("No memberships listed", systemImage: "storefront")
            } else {
                ForEach(store.creator.creatorProducts) { membership in
                    if let id = UUID(uuidString: membership.id) { membershipCard(membership, id: id, store: store) }
                }
            }
        case .research:
            if store.postsUnavailable {
                ContentUnavailableView("Public posts temporarily unavailable", systemImage: "exclamationmark.circle")
            } else if store.posts.isEmpty {
                ContentUnavailableView("No public research yet", systemImage: "chart.line.uptrend.xyaxis")
            } else {
                ForEach(store.posts) { post in
                    FeedPostCard(post: post, discussion: { selectedPost = post.postID })
                        .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
                }
            }
        case .communities:
            if store.groups.isEmpty { ContentUnavailableView("No listed communities", systemImage: "person.2") }
            ForEach(store.groups) { group in community(group, member: store.joinedIds.contains(group.id)) }
        case .about:
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                ResearchSectionTitle(title: "About creator access")
            } content: {
                Text("Membership connects this creator’s content and included communities to your SlipSurge account. SlipSurge research plans are sold separately.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func membershipCard(_ item: DiscoverAPI.Creators.Creator.Product, id: UUID, store: CreatorPublicStoreAPI.Storefront) -> some View {
        let related = store.groups.filter { $0.creatorProductId == id }
        let hasAccess = store.activeProductIds.contains(id) || api.userID == store.creator.id
        return ResearchToolCard(color: Brand.accent(for: scheme)) {
            ResearchSectionTitle(title: item.title)
        } content: {
            if let description = item.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
            ForEach(related) { group in Label(group.name, systemImage: "checkmark.circle").font(.caption) }
            if hasAccess {
                Label("Access active", systemImage: "checkmark.seal.fill").font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
            } else {
                Text(item.price.formatted(.currency(code: item.currency ?? "USD"))).font(.headline)
                if let days = item.billingPeriodDays {
                    Text(item.productType == "one_time" ? "\(days) days · one payment" : "Every \(days) days")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            NavigationLink {
                CreatorMembershipView(account: api.account,
                    offer: .init(id: id, title: item.title, description: item.description, price: item.price, currency: item.currency,
                        productType: item.productType, status: "active", billingPeriodDays: item.billingPeriodDays),
                    creatorID: store.creator.id, artwork: store.creator.storefront?.logoUrl ?? store.creator.avatarUrl,
                    community: related.first, creatorUsername: store.creator.username)
            } label: { Label(hasAccess ? "Open membership" : "Membership details", systemImage: "chevron.right") }
                .buttonStyle(.borderedProminent)
        }
    }

    private func community(_ group: DiscoverAPI.Communities.Community, member: Bool) -> some View {
        NavigationLink {
            CommunityDetailView(api: api, group: group, initialMember: member)
        } label: {
            DiscoverIdentityCard(title: group.name, subtitle: member ? "Member" : group.accessType == "paid" ? "Membership" : "Free community",
                detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl, symbol: "person.2",
                count: group.memberCount.map { "\($0.formatted()) members" })
        }.buttonStyle(SlipSurgePressStyle())
    }

    private func load() async {
        failure = nil
        do {
            let value = try await directory.storefront(username)
            try Task.checkCancellation()
            store = value
            following = value.following
        } catch {
            if !Task.isCancelled { failure = error }
        }
    }

    private func change(_ follow: Bool, creator: UUID) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        actionFailure = false
        do {
            try await directory.changeFollowing(creator, to: follow)
            following = follow
        } catch {
            await load()
            actionFailure = true
        }
    }
}
