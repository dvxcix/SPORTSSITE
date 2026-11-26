import SwiftUI

struct NativeLinkedSiteView: View {
    let account: AccountStore
    let target: NativeSiteLink
    @Binding var appearance: Appearance
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.openURL) private var openURL

    private var viewer: DiscoverAPI { .init(account: account, userID: account.memberID) }

    var body: some View {
        Group {
            if target.needsMember {
                if let userID = account.memberID {
                    memberDestination(userID)
                } else {
                    AccountView(account: account, appearance: $appearance)
                }
            } else {
                publicDestination
            }
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
    }

    @ViewBuilder private var publicDestination: some View {
        switch target {
        case .post(let id): FeedThreadView(api: .init(account: account, userID: account.memberID), id: id).id(viewer.userID)
        case .profile(let username): MemberProfileView(api: viewer, target: username).id(viewer.userID)
        case .creatorStorefront(let username, let section): CreatorDetailView(api: viewer, username: username, section: section).id(viewer.userID)
        case .creatorOffer(let id): LinkedCreatorOfferView(api: .init(client: viewer), id: id).id(viewer.userID)
        case .community(let slug, let section): linkedCommunity(slug, section: section)
        case .pricing: NativeMembershipOverview(account: account)
        case .preview(.nba): CourtView(scope: .preview)
        case .preview(.nfl): SidelineView(api: SidelineAPI())
        case .discover(.scores(let date, let league)): ScoresView(api: viewer, date: date ?? .now, league: league)
        case .scoreGame(let game): LinkedScoreView(viewer: viewer, link: game)
        case .registration: EmailAccountForm(account: account, flow: .registration)
        case .passwordRecovery: EmailAccountForm(account: account, flow: .recovery)
        default: EmptyView()
        }
    }

    @ViewBuilder private func memberDestination(_ userID: UUID) -> some View {
        let messages = MessagesAPI(account: account, userID: userID)
        switch target {
        case .notifications: ActivityView(api: .init(account: account, userID: userID))
        case .activityReplay: ActivityReplayView(api: viewer)
        case .missions: MemberProgressView(api: viewer)
        case .search(let query): NativeSearchView(api: .init(viewer: viewer), initialQuery: query)
        case .topic(let name): NativeTopicView(api: viewer, tag: name)
        case .explore: NativeExploreView(api: viewer)
        case .nbaEntity(let kind, let id, let game, let mode): NbaDirectoryEntityView(api: viewer, kind: kind, id: id, game: game, mode: mode)
        case .nflEntity(let kind, let id): NflDirectoryEntityView(api: viewer, kind: kind, id: id)
        case .mlbTeam(let id): DugoutTeamView(api: .init(account: account, userID: userID), id: id)
        case .bookmarks: FeedBookmarksView(api: .init(account: account, userID: userID))
        case .picks: MyPicksView(api: viewer)
        case .messages, .newMessage: MessagesView(api: messages, startsComposing: target == .newMessage)
        case .directMessage(let username):
            NativeLinkLookup(title: "Conversation", load: { try await viewer.profileID(username) }) { partner in
                if partner == userID { MemberProfileView(api: viewer, target: username) }
                else { MessageThreadView(api: messages, destination: .init(kind: .direct, id: partner)) }
            }
        case .groupMessage(let id): MessageThreadView(api: messages, destination: .init(kind: .group, id: id))
        case .channels: ChannelDirectoryView(api: messages)
        case .channel(let slug): LinkedPublicRoomView(api: messages, slug: slug)
        case .storyCreate:
            let stories = StoriesAPI(account: account, userID: userID)
            NativeLinkLookup(title: "Add to story", load: { try await stories.load() }) { page in
                if page.canCreate {
                    StoryComposerView(api: stories, userID: userID, sports: page.sports ?? ["NBA", "NFL"], embedded: true) {
                        if let feed = URL(string: "slipsurge-app://site/feed?refresh=stories") { openURL(feed) }
                    }
                } else {
                    ContentUnavailableView(page.enabled ? "Basic access required" : "Stories unavailable", systemImage: "lock")
                }
            }
        case .community(let slug, let section): linkedCommunity(slug, section: section)
        case .settings(let section): settings(section, userID: userID)
        case .creatorStudio(let section):
            switch section {
            case .analytics: CreatorAnalyticsView(api: viewer)
            case .members: CreatorMembersView(account: account, userID: userID)
            case .promotion: CreatorBusinessView(api: .init(account: account, userID: userID), section: .promotion)
            case .settings: CreatorBusinessView(api: .init(account: account, userID: userID), section: .settings)
            case .overview, .products, .communities, .content:
                AccountWorkspaceView(account: account, userID: userID, workspace: .studio, studioSection: section)
            }
        case .creatorPayouts: CreatorWalletView(api: .init(account: account, userID: userID))
        case .creatorAccess(let id, let outcome): CreatorAccessCompletionView(api: .init(client: viewer), offerID: id, outcome: outcome)
        case .creatorStoreSetup: CreatorStoreView(api: .init(account: account, userID: userID))
        case .communityCreator(let offer): CommunityCreateView(api: .init(account: account, userID: userID), initialOffer: offer)
        case .researchWorkspace: ResearchLibraryView(api: .init(account: account, userID: userID))
        case .marketplace(let target): NativeMarketplaceView(api: viewer, userID: userID, target: target)
        case .admin: AccountWorkspaceView(account: account, userID: userID, workspace: .admin)
        case .adminMarketplace: AdminMatrixMarketplaceView(api: viewer)
        case .adminCreatorBusiness: AdminCreatorBusinessView(api: .init(viewer: viewer))
        case .adminPipelineHealth: AdminPipelineHealthView(api: viewer)
        case .adminBrowserAutomation: AdminBrowserAutomationView(api: viewer)
        case .adminSocialPlatforms: AdminSocialPlatformsView(api: viewer)
        case .adminEmail: AdminEmailOperationsView(api: viewer)
        case .adminPlatformSettings(let page): AdminPlatformSettingsView(api: viewer, page: page)
        case .adminSection(let section): adminSection(section, userID: userID)
        case .adminMlbArchive(let selection): AdminMlbArchiveView(api: viewer, selection: selection)
        case .adminWhop(let page): AdminWhopView(api: viewer, page: page)
        case .adminDiscord: AdminDiscordView(api: .init(viewer: viewer))
        case .adminDiscordComposer: AdminDiscordComposer(api: .init(viewer: viewer))
        default: EmptyView()
        }
    }

    @ViewBuilder private func adminSection(_ section: NativeSiteLink.AdminSection, userID: UUID) -> some View {
        switch section {
        case .reports, .deletions:
            AdminQueueView(account: account, userID: userID, queue: section == .reports ? .reports : .deletions)
        case .members, .banned:
            AdminMembersView(api: .init(account: account, userID: userID), banned: section == .banned)
        case .recentSignIns: AdminRecentSignInsView(api: viewer)
        case .badges: AdminBadgeStudio(viewer: viewer)
        case .nflAccess: AdminNflAccessView(api: viewer)
        case .audit: AdminOperationsView(viewer: viewer, mode: .audit)
        case .notifications: AdminOperationsView(viewer: viewer, mode: .notifications)
        case .groups: AdminOperationsView(viewer: viewer, mode: .groups)
        case .posts, .stories: AdminSocialContent(viewer: viewer, kind: section == .posts ? .posts : .stories)
        case .emoji: AdminEmojiStudio(viewer: viewer)
        case .rollouts: AdminFeatureRollouts(account: account, userID: userID)
        case .experienceAudit: AdminExperienceAuditView(api: viewer)
        case .matrixBacktest: AdminMatrixBacktestView(api: viewer)
        case .hrIntelligence: AdminHrIntelligenceView(api: viewer)
        case .contactRecap: AdminContactRecapView(api: viewer)
        case .designSystem:
            NativeLinkLookup(title: "Design system", load: {
                try await SlipSurgeHTTP.memberData("/api/mobile/workspaces", query: [.init(name: "workspace", value: "admin")],
                    account: account, userID: userID)
            }) { _ in AdminDesignSystemView() }
        case .banner, .changelog:
            AdminAnnouncementsView(account: account, userID: userID, page: section == .banner ? .banner : .changelog)
        }
    }

    @ViewBuilder private func settings(_ section: NativeSiteLink.Settings, userID: UUID) -> some View {
        switch section {
        case .account: MemberAccountView(account: account, userID: userID)
        case .profile: NativeSettings(account: account, userID: userID, section: .profile)
        case .connections: AccountConnectionsView(api: .init(account: account, userID: userID))
        case .security: AccountSecurityView(account: account, userID: userID)
        case .privacy: NativeSettings(account: account, userID: userID, section: .privacy)
        case .notifications: NativeSettings(account: account, userID: userID, section: .alerts)
        case .interests: AccountFavoritesView(account: account, userID: userID)
        case .membership: MembershipBillingView(account: account, userID: userID, refreshAccount: {})
        case .blocked: MutedAndBlockedView(api: viewer)
        case .research: ResearchPreferencesView(api: .init(account: account, userID: userID))
        }
    }

    private func linkedCommunity(_ slug: String, section: NativeSiteLink.CommunitySection) -> some View {
        LinkedCommunityView(viewer: viewer, slug: slug, section: section)
    }

}

struct LinkedScoreView: View {
    let viewer: DiscoverAPI
    let link: GameLink

    var body: some View {
        struct Selection: Decodable { let date: String; let game: Scoreboard.Match }
        return NativeLinkLookup(title: "Game Center", load: {
            let result = try await viewer.readPublic(Selection.self, path: "/api/mobile/scores/resolve",
                query: [.init(name: "sport", value: link.sport), .init(name: "id", value: link.id)])
            guard result.game.id == link.id, result.game.sport == link.sport,
                  SlateDate.fromKey(result.date).map(SlateDate.key) == result.date else { throw URLError(.cannotParseResponse) }
            return result
        }) { result in
            GameCenterView(api: viewer, game: result.game, date: result.date, play: link.play)
        }
    }
}

struct LinkedCommunityView: View {
    let viewer: DiscoverAPI
    let slug: String
    let section: NativeSiteLink.CommunitySection
    var onMembershipChange: () -> Void = {}

    var body: some View {
        NativeLinkLookup(title: "Community", load: { try await viewer.linkedCommunity(slug) }) { result in
            let group = result.group
            switch section {
            case .settings:
                if let userID = viewer.userID {
                    CommunitySettingsView(api: .init(account: viewer.account, userID: userID, groupID: group.id))
                }
            case .channels(let roomSlug):
                if let roomSlug, let userID = viewer.userID {
                    let api = MessagesAPI(account: viewer.account, userID: userID)
                    NativeLinkLookup(title: "Room", load: { try await api.linkedChannel(roomSlug, group: group.id) }) { room in
                        RoomConversationView(api: api, group: group.id, groupName: group.name, room: room)
                    }
                } else {
                    CommunityDetailView(api: viewer, group: group, initialMember: result.member, feed: .rooms,
                        onMembershipChange: onMembershipChange)
                }
            case .posts, .picks:
                CommunityDetailView(api: viewer, group: group, initialMember: result.member,
                    feed: section == .picks ? .picks : .posts, onMembershipChange: onMembershipChange)
            }
        }
        .id(viewer.userID)
    }
}

struct LinkedPublicRoomView: View {
    let api: MessagesAPI
    let slug: String

    var body: some View {
        NativeLinkLookup(title: "Live room", load: { try await api.linkedChannel(slug, group: nil) }) { room in
            RoomConversationView(api: api, group: nil, groupName: nil, room: room)
        }
    }
}

private struct NativeLinkLookup<Value, Destination: View>: View {
    let title: String
    let load: () async throws -> Value
    @ViewBuilder let destination: (Value) -> Destination
    @State private var value: Value?
    @State private var error: (any Error)?
    @State private var revision = 0

    var body: some View {
        Group {
            if let value {
                destination(value)
            } else {
                placeholder
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .task(id: revision) {
            error = nil
            do {
                let result = try await load()
                if !Task.isCancelled { value = result }
            } catch {
                if !Task.isCancelled { self.error = error }
            }
        }
    }

    @ViewBuilder private var placeholder: some View {
        switch (error as? SlipSurgeHTTP.Status)?.code {
        case 401, 403:
            ContentUnavailableView("Access required", systemImage: "lock")
        case 404:
            ContentUnavailableView("Link unavailable", systemImage: "link.badge.plus")
        default:
            if error != nil {
                ContentUnavailableView {
                    Label("Link couldn’t load", systemImage: "exclamationmark.circle")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
            } else {
                ProgressView()
            }
        }
    }
}
