import SwiftUI

enum DiscoverDestination: Hashable {
    case communities, creators, leaderboard, scores, events(UUID?)
    case discussions, discussionCategory(String), discussion(UUID)
    case articles(Bool), article(String), articleEditor(UUID?, assistant: Bool)
    case pages(String, create: Bool), page(String, manage: Bool)
}

struct DiscoverView: View {
    private enum Section: String, CaseIterable { case communities = "Communities", creators = "Creators", records = "Leaderboard" }

    let api: DiscoverAPI
    var opensCommunity: UUID? = nil
    @Binding var opensDestination: DiscoverDestination?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var section = Section.communities
    @State private var communities: DiscoverAPI.Communities?
    @State private var creators: DiscoverAPI.Creators?
    @State private var records: DiscoverAPI.Records?
    @State private var yours = false
    @State private var sport = ""
    @State private var search = ""
    @State private var thisWeek = false
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var routedCommunity: UUID?
    @State private var routed = false
    @State private var eventsAvailable = false
    @State private var forumAvailable = false
    @State private var articlesAvailable = false
    @State private var pagesAvailable = false
    @State private var destination: DiscoverDestination?

    init(api: DiscoverAPI, opensCommunity: UUID? = nil, opensDestination: Binding<DiscoverDestination?> = .constant(nil)) {
        self.api = api
        self.opensCommunity = opensCommunity
        _opensDestination = opensDestination
    }

    private var request: String { "\(section.rawValue):\(revision)" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                NavigationLink {
                    ScoresView(api: api)
                } label: {
                    scoresEntry
                }
                .buttonStyle(SlipSurgePressStyle())
                communityDestinations
                ResearchToolRail(title: "Discover", choices: Section.allCases, selection: $section, label: \.rawValue, glyph: {
                    switch $0 {
                    case .communities: "person.2"
                    case .creators: "person.crop.square"
                    case .records: "trophy"
                    }
                }, compact: true)
                filters
                switch section {
                case .communities:
                    if let communities { communitiesView(communities) } else { loading }
                case .creators:
                    if let creators { creatorsView(creators) } else { loading }
                case .records:
                    if let records {
                        DiscoverLeaderboard(api: api, data: records, sport: sport, thisWeek: thisWeek, search: search) { revision += 1 }
                    } else { loading }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .navigationTitle("Discover")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $routedCommunity) { id in
            if let data = communities, let group = (data.invitations + data.groups).first(where: { $0.id == id }) {
                CommunityDetailView(api: api, group: group, initialMember: data.joinedIds.contains(id))
            }
        }
        .navigationDestination(item: $destination) { opening in
            switch opening {
            case .scores: ScoresView(api: api)
            case .events(let id):
                if let id { CommunityEventDetail(api: .init(viewer: api), id: id, refreshList: {}) }
                else { CommunityEventsView(api: .init(viewer: api)) }
            case .discussions: ForumIndexView(api: .init(viewer: api))
            case .discussionCategory(let category): ForumCategoryView(api: .init(viewer: api), slug: category)
            case .discussion(let id): ForumThreadView(api: .init(viewer: api), id: id)
            case .articles(let mine): ArticlesView(api: .init(viewer: api), mine: mine)
            case .article(let slug): ArticleReader(api: .init(viewer: api), slug: slug)
            case .pages(let category, let create): CommunityPagesView(api: .init(viewer: api), initialCategory: category, startsCreating: create)
            case .page(let slug, let manage): CommunityPageDetail(api: .init(viewer: api), slug: slug, startsManaging: manage)
            case .articleEditor(let id, let assistant):
                if let id { ArticleEditorLoader(api: .init(viewer: api), id: id, saved: articleSaved) }
                else if articlesAvailable { ArticleEditor(api: .init(viewer: api), draft: .init(), opensAssistant: assistant, saved: articleSaved) }
                else { ArticlesView(api: .init(viewer: api)) }
            default: EmptyView()
            }
        }
        .onChange(of: opensDestination, initial: true) { _, opening in
            guard let opening else { return }
            switch opening {
            case .communities:
                destination = nil
                section = .communities
            case .creators:
                destination = nil
                section = .creators
            case .leaderboard:
                destination = nil
                section = .records
            case .scores, .events, .discussions, .discussionCategory, .discussion, .articles, .article, .articleEditor, .pages, .page:
                destination = opening
            }
            opensDestination = nil
        }
        .onChange(of: communities != nil, initial: true) { _, ready in
            if ready, !routed, let opensCommunity, let data = communities,
               (data.invitations + data.groups).contains(where: { $0.id == opensCommunity }) {
                routed = true
                routedCommunity = opensCommunity
            }
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .onChange(of: section) { _, _ in
            error = nil
            search = ""
            sport = ""
            thisWeek = false
        }
        .refreshable { await load(section) }
        .task(id: api.userID) {
            async let events = CommunityEventsAPI(viewer: api).available()
            async let forum = ForumAPI(viewer: api).available()
            async let articles = ArticlesAPI(viewer: api).available()
            async let pages = CommunityPagesAPI(viewer: api).available()
            (eventsAvailable, forumAvailable, articlesAvailable, pagesAvailable) = await (events, forum, articles, pages)
        }
        .task(id: request) { await load(section) }
    }

    private func articleSaved(_ receipt: ArticlesAPI.Receipt) {
        opensDestination = receipt.status == "published" ? .article(receipt.slug) : .articles(true)
    }

    @ViewBuilder private var communityDestinations: some View {
        if let userID = api.userID {
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    NavigationLink {
                        ChannelDirectoryView(api: .init(account: api.account, userID: userID))
                    } label: { Label("Live Rooms", systemImage: "dot.radiowaves.left.and.right") }
                    if eventsAvailable {
                        NavigationLink { CommunityEventsView(api: .init(viewer: api)) } label: { Label("Events", systemImage: "calendar") }
                    }
                    if forumAvailable {
                        NavigationLink { ForumIndexView(api: .init(viewer: api)) } label: { Label("Discussions", systemImage: "bubble.left.and.bubble.right") }
                    }
                    if articlesAvailable {
                        NavigationLink { ArticlesView(api: .init(viewer: api)) } label: { Label("Articles", systemImage: "book") }
                    }
                    if pagesAvailable {
                        NavigationLink { CommunityPagesView(api: .init(viewer: api)) } label: { Label("Pages", systemImage: "rectangle.grid.2x2") }
                    }
                }
                .buttonStyle(.bordered)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var scoresEntry: some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform.path").font(.title2.weight(.heavy))
                .foregroundStyle(Brand.accent(for: scheme))
                .frame(width: 45, height: 45)
                .background(Brand.accent(for: scheme).opacity(0.15), in: .rect(cornerRadius: 12))
            Text("Live Scores").font(.title3.weight(.bold))
            Spacer()
            Image(systemName: "chevron.right").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
        }
        .foregroundStyle(Brand.text(for: scheme))
        .padding(13)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 17))
    }

    private var filters: some View {
        let sports: [String] = switch section {
        case .communities: Set((communities?.groups ?? []).compactMap(\.sport).map { $0.uppercased() }).sorted()
        case .creators: Set((creators?.creators ?? []).flatMap(\.sports).map { $0.uppercased() }).sorted()
        case .records: Set((records?.allSports ?? []).map { $0.uppercased() }).sorted()
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                if section == .communities, api.userID != nil {
                    ResearchToolFilter(title: "Membership", selection: yours ? "Yours" : "All communities") {
                        Picker("Membership", selection: $yours) {
                            Text("All communities").tag(false)
                            Text("Yours").tag(true)
                        }
                    }
                }
                if section == .records {
                    ResearchToolFilter(title: "Record period", selection: thisWeek ? "This week" : "All time") {
                        Picker("Record period", selection: $thisWeek) {
                            Text("All time").tag(false)
                            Text("This week").tag(true)
                        }
                    }
                    .onChange(of: thisWeek) { _, value in if value { sport = "" } }
                }
                if !sports.isEmpty, section != .records || !thisWeek {
                    ResearchArtworkPicker(title: "Sport", options: [.init(id: "", title: "All sports")] + sports.map {
                        .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt")
                    }, selection: $sport)
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").accessibilityHidden(true)
                TextField("Search \(section.rawValue.lowercased())", text: $search).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).frame(minHeight: 44)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private func communitiesView(_ data: DiscoverAPI.Communities) -> some View {
        let joined = Set(data.joinedIds)
        let groups = data.groups.filter { (!yours || joined.contains($0.id)) && matches($0.sport, texts: [$0.name, $0.description]) }
        if let userID = api.userID, search.isEmpty {
            NavigationLink {
                CreatorStoreView(api: .init(account: api.account, userID: userID))
            } label: { Label("Create community", systemImage: "plus.circle") }
            .buttonStyle(.bordered)
        }
        if !data.invitations.isEmpty, search.isEmpty {
            Text("Invitations").font(.headline).accessibilityAddTraits(.isHeader)
            ForEach(data.invitations) { group in
                communityLink(group, member: false)
            }
        }
        if groups.isEmpty {
            ContentUnavailableView("No communities found", systemImage: "person.2")
        }
        LazyVStack(spacing: 9) {
            ForEach(groups) { communityLink($0, member: joined.contains($0.id)) }
        }
    }

    private func communityLink(_ group: DiscoverAPI.Communities.Community, member: Bool) -> some View {
        NavigationLink {
            CommunityDetailView(api: api, group: group, initialMember: member)
        } label: {
            DiscoverIdentityCard(title: group.name, subtitle: group.invitationId != nil ? "Invitation pending"
                : member ? "Member" : group.accessType == "paid" ? "Membership" : "Free community",
                detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl,
                symbol: "person.2", count: group.memberCount.map { "\($0.formatted()) members" })
        }
        .buttonStyle(SlipSurgePressStyle())
    }

    @ViewBuilder
    private func creatorsView(_ data: DiscoverAPI.Creators) -> some View {
        let people = data.creators.filter { creator in
            (sport.isEmpty || creator.sports.contains(where: { $0.caseInsensitiveCompare(sport) == .orderedSame }))
                && matchesText([creator.title, creator.username, creator.bio, creator.storefront?.bio] + creator.tags.map(Optional.some))
        }
        if people.isEmpty {
            ContentUnavailableView("No creators found", systemImage: "person.crop.square")
        }
        LazyVStack(spacing: 9) {
            ForEach(people) { creator in
                NavigationLink {
                    CreatorDetailView(api: api, creator: creator)
                } label: {
                    DiscoverIdentityCard(title: creator.title, subtitle: "@\(creator.username)",
                        detail: creator.storefront?.bio ?? creator.bio, avatar: creator.storefront?.logoUrl ?? creator.avatarUrl,
                        banner: creator.storefront?.coverUrl ?? creator.bannerUrl, symbol: "person.crop.circle",
                        count: creator.followerCount.map { "\($0.formatted()) followers" })
                }
                .buttonStyle(SlipSurgePressStyle())
            }
        }
    }

    private var loading: some View {
        ResearchToolMessage(title: "Couldn’t load \(section.rawValue.lowercased())", error: error) { revision += 1 }
    }

    private func matches(_ id: String?, texts: [String?]) -> Bool {
        (sport.isEmpty || id?.caseInsensitiveCompare(sport) == .orderedSame) && matchesText(texts)
    }

    private func matchesText(_ texts: [String?]) -> Bool {
        search.isEmpty || texts.compactMap { $0 }.contains { $0.localizedCaseInsensitiveContains(search) }
    }

    private func load(_ requested: Section) async {
        error = nil
        do {
            switch requested {
            case .communities:
                let data = try await api.read(DiscoverAPI.Communities.self, resource: "communities")
                guard !Task.isCancelled else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { communities = data }
            case .creators:
                let data = try await api.read(DiscoverAPI.Creators.self, resource: "creators")
                guard !Task.isCancelled else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { creators = data }
            case .records:
                let data = try await api.read(DiscoverAPI.Records.self, resource: "records")
                guard !Task.isCancelled else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { records = data }
            }
        } catch {
            if !Task.isCancelled, requested == section { self.error = error }
        }
    }
}

struct DiscoverIdentityCard: View {
    let title: String
    let subtitle: String
    let detail: String?
    let avatar: URL?
    let banner: URL?
    let symbol: String
    let count: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let banner {
                AsyncImage(url: banner) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Brand.accent(for: scheme).opacity(0.15)
                }
                .frame(height: 104).clipped()
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 10) {
                    ResearchArtwork(urls: avatar.map { [$0] } ?? [], fallback: symbol)
                        .frame(width: 43, height: 43)
                        .background(Brand.accent(for: scheme).opacity(0.14), in: .rect(cornerRadius: 10))
                        .clipShape(.rect(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title).font(.headline)
                        Text(subtitle).font(.caption.weight(.medium)).foregroundStyle(Brand.accent(for: scheme))
                    }
                    Spacer()
                }
                if let detail, !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
                if let count { Text(count).font(.caption).foregroundStyle(.secondary) }
            }
            .padding(13)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Brand.text(for: scheme))
        .background(Brand.surface(for: scheme))
        .clipShape(.rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.secondary.opacity(0.15)) }
    }
}
