import SwiftUI

enum DiscoverDestination: Hashable {
    case communities, creators, leaderboard, scores(date: Date?, league: String)
    case community(String, NativeSiteLink.CommunitySection)
    case liveRooms, liveRoom(String)
}

struct DiscoverView: View {
    private enum Section: String, CaseIterable { case communities = "Communities", creators = "Creators", records = "Leaderboard" }

    let api: DiscoverAPI
    private let opensJoined: Bool
    var opensCommunity: UUID? = nil
    @Binding var opensDestination: DiscoverDestination?
    @Environment(\.colorScheme) private var scheme
    @State private var section = Section.communities
    @State private var communities: DiscoverAPI.Communities?
    @State private var creators: DiscoverAPI.Creators?
    @State private var records: DiscoverAPI.Records?
    @State private var yours: Bool
    @State private var sport = ""
    @State private var search = ""
    @FocusState private var searchFocused: Bool
    @State private var thisWeek = false
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var routedCommunity: UUID?
    @State private var routed = false
    @State private var destination: DiscoverDestination?

    init(api: DiscoverAPI, opensCommunity: UUID? = nil, opensDestination: Binding<DiscoverDestination?> = .constant(nil),
         opensJoined: Bool = false) {
        self.api = api
        self.opensCommunity = opensCommunity
        self.opensJoined = opensJoined
        _opensDestination = opensDestination
        _yours = State(initialValue: opensJoined)
    }

    private var request: String { "\(section.rawValue):\(revision)" }
    private var joinedOnly: Bool { opensJoined && yours }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if opensJoined { communityShortcuts }
                if !joinedOnly { browseDirectory }
                if !joinedOnly || communities?.joinedIds.isEmpty == false { filters }
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
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone { searchFocused = false }
        .safeAreaInset(edge: .top, spacing: 0) {
            if opensJoined {
                SocialSectionBar(title: "Community view", sections: [true, false], selection: $yours) { joined in
                    Label(joined ? "Joined" : "Browse", systemImage: joined ? "person.badge.checkmark" : "square.grid.2x2")
                }
            }
        }
        .navigationTitle(opensJoined ? "Community" : "Discover")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if api.userID != nil {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        NativeSearchView(api: .init(viewer: api))
                    } label: { Label("Search", systemImage: "magnifyingglass") }
                }
            }
        }
        .navigationDestination(item: $routedCommunity) { id in
            if let data = communities, let group = (data.invitations + data.groups).first(where: { $0.id == id }) {
                CommunityDetailView(api: api, group: group, initialMember: data.joinedIds.contains(id), onMembershipChange: reloadGroups)
            }
        }
        .navigationDestination(item: $destination) { opening in
            switch opening {
            case .scores(let date, let league): ScoresView(api: api, date: date ?? .now, league: league)
            case .community(let slug, let section):
                LinkedCommunityView(viewer: api, slug: slug, section: section, onMembershipChange: reloadGroups)
                    .id(opening)
            case .liveRooms:
                if let userID = api.userID {
                    ChannelDirectoryView(api: .init(account: api.account, userID: userID))
                }
            case .liveRoom(let slug):
                if let userID = api.userID {
                    LinkedPublicRoomView(api: .init(account: api.account, userID: userID), slug: slug)
                        .id(opening)
                }
            default: EmptyView()
            }
        }
        .onChange(of: opensDestination, initial: true) { _, opening in
            guard let opening else { return }
            switch opening {
            case .communities:
                destination = nil
                section = .communities
                if opensJoined { yours = true }
            case .creators:
                destination = nil
                if opensJoined { yours = false }
                section = .creators
            case .leaderboard:
                destination = nil
                if opensJoined { yours = false }
                section = .records
            case .scores, .community, .liveRooms, .liveRoom:
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
        .onChange(of: yours) { _, isJoined in
            guard opensJoined else { return }
            if isJoined { section = .communities }
            search = ""
            sport = ""
        }
        .refreshable { await load(section) }
        .task(id: request) { await load(section) }
    }

    private func reloadGroups() { revision += 1 }

    @ViewBuilder private var communityShortcuts: some View {
        if let userID = api.userID {
            NavigationLink {
                ChannelDirectoryView(api: .init(account: api.account, userID: userID))
            } label: {
                shortcut("Live Rooms", symbol: "bubble.left.and.bubble.right")
            }
            .buttonStyle(SlipSurgePressStyle())
        }
    }

    private func shortcut(_ title: String, symbol: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).foregroundStyle(Brand.accent(for: scheme)).accessibilityHidden(true)
            Text(title).fixedSize(horizontal: true, vertical: false)
        }
        .font(.subheadline.weight(.semibold))
        .padding(.horizontal, 11)
        .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
        .contentShape(.rect)
    }

    @ViewBuilder private var browseDirectory: some View {
        if !opensJoined {
            NavigationLink { ScoresView(api: api) } label: { scoresEntry }
                .buttonStyle(SlipSurgePressStyle())
        }
        if api.userID != nil {
            NavigationLink {
                NativeExploreView(api: api)
            } label: {
                Label("Explore", systemImage: "safari")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(SlipSurgePressStyle())
        }
        if !opensJoined { communityShortcuts }
        ResearchToolRail(title: opensJoined ? "Browse" : "Discover", choices: Section.allCases, selection: $section,
            label: \.rawValue, glyph: {
                switch $0 {
                case .communities: SlipGlyph.community.rawValue
                case .creators: "person.crop.square"
                case .records: "trophy"
                }
            }, compact: true)
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
        case .communities: Set(visibleGroups.compactMap(\.sport).map { $0.uppercased() }).sorted()
        case .creators: Set((creators?.creators ?? []).flatMap(\.sports).map { $0.uppercased() }).sorted()
        case .records: Set((records?.allSports ?? []).map { $0.uppercased() }).sorted()
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                if section == .communities, api.userID != nil, !opensJoined {
                    ResearchToolFilter(title: "Membership", symbol: "person.badge.checkmark", selection: yours ? "Yours" : "All communities") {
                        Picker("Membership", selection: $yours) {
                            Label("All communities", glyph: SlipGlyph.community.rawValue).tag(false)
                            Label("Yours", systemImage: "person.badge.checkmark").tag(true)
                        }
                    }
                }
                if section == .records {
                    ResearchToolFilter(title: "Record period", symbol: "calendar", selection: thisWeek ? "This week" : "All time") {
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
                    .focused($searchFocused)
                    .submitLabel(.search)
                    .onSubmit { searchFocused = false }
            }
            .padding(.horizontal, 12).frame(minHeight: 44)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
        }
    }

    private var visibleGroups: [DiscoverAPI.Communities.Community] {
        guard let communities else { return [] }
        guard yours else { return communities.groups }
        let joined = Set(communities.joinedIds)
        return communities.groups.filter { joined.contains($0.id) }
    }

    @ViewBuilder
    private func communitiesView(_ data: DiscoverAPI.Communities) -> some View {
        let joined = Set(data.joinedIds)
        let groups = visibleGroups.filter { matches($0.sport, texts: [$0.name, $0.description]) }
        if let userID = api.userID, search.isEmpty, !joinedOnly {
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
        if joinedOnly, joined.isEmpty {
            ContentUnavailableView {
                Label("No joined communities", systemImage: "person.2")
            } actions: {
                Button { yours = false } label: {
                    Text("Browse communities").foregroundStyle(scheme == .dark ? .black : .white)
                }
                .buttonStyle(.borderedProminent)
            }
        } else if groups.isEmpty {
            ContentUnavailableView("No communities found", systemImage: "person.2")
        }
        LazyVStack(spacing: 9) {
            ForEach(groups) { communityLink($0, member: joined.contains($0.id)) }
        }
    }

    private func communityLink(_ group: DiscoverAPI.Communities.Community, member: Bool) -> some View {
        NavigationLink {
            CommunityDetailView(api: api, group: group, initialMember: member,
                feed: opensJoined && member ? .rooms : .posts, onMembershipChange: reloadGroups)
        } label: {
            if joinedOnly, member || group.invitationId != nil {
                joinedCommunityRow(group)
            } else {
                DiscoverIdentityCard(title: group.name, subtitle: group.invitationId != nil ? "Invitation pending"
                    : member ? "Member" : group.accessType == "paid" ? "Membership" : "Free community",
                    detail: group.description, avatar: group.avatarUrl, banner: group.bannerUrl,
                    symbol: "person.2", count: group.memberCount.map { "\($0.formatted()) members" })
            }
        }
        .buttonStyle(SlipSurgePressStyle())
    }

    private func joinedCommunityRow(_ group: DiscoverAPI.Communities.Community) -> some View {
        HStack(spacing: 12) {
            ResearchArtwork(urls: [group.avatarUrl, group.bannerUrl].compactMap { $0 }, fallback: "person.2.fill", contentMode: .fill, pointSize: 44)
                .frame(width: 44, height: 44)
                .clipShape(.rect(cornerRadius: 12))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(group.name).font(.headline).lineLimit(2)
                if group.invitationId != nil {
                    Text("Invitation pending").font(.caption).foregroundStyle(.secondary)
                } else if let count = group.memberCount {
                    Text(count == 1 ? "1 member" : "\(count.formatted()) members")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary).accessibilityHidden(true)
        }
        .padding(11)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
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
                    CreatorDetailView(api: api, username: creator.username, preview: creator)
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
                communities = data
            case .creators:
                let data = try await api.read(DiscoverAPI.Creators.self, resource: "creators")
                guard !Task.isCancelled else { return }
                creators = data
            case .records:
                let data = try await api.read(DiscoverAPI.Records.self, resource: "records")
                guard !Task.isCancelled else { return }
                records = data
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
                ResearchArtwork(urls: [banner], fallback: nil, contentMode: .fill, pointSize: 410)
                    .frame(height: 104)
                    .background(Brand.accent(for: scheme).opacity(0.15))
                    .clipped()
            }
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 10) {
                    ResearchArtwork(urls: avatar.map { [$0] } ?? [], fallback: symbol, pointSize: 43)
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
