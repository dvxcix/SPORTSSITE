import SwiftUI

struct SlipSurgeTabs: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Binding var incomingURL: URL?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    private enum Destination { case feed, research, discover, account }
    @State private var selected = Destination.feed
    @State private var announcements: SiteAnnouncements?
    @State private var dismissedBannerVersion: String?
    @State private var release: SiteAnnouncements.Release?
    @State private var dismissedReleases: Set<UUID> = []
    @State private var savingRelease = false
    @State private var releaseProblem: String?
    @State private var sitePresentation: SitePresentation?
    @State private var researchLink: ResearchDeepLink?
    @State private var discoverDestination: DiscoverDestination?
    @State private var feedSelection: NativeFeedSelection?
    @State private var emojiLibrary = NativeEmojiLibrary()
    @State private var researchPreferences = MemberResearchPreferenceStore()
    @State private var choseDestination = false

    private struct SitePresentation: Identifiable {
        let id = UUID()
        let target: NativeSiteLink
    }

    private var appSheet: Binding<SitePresentation?> {
        Binding(get: { release == nil ? sitePresentation : nil }, set: { if release == nil { sitePresentation = $0 } })
    }

    var body: some View {
        TabView(selection: Binding(get: { selected }, set: { tab in
            choseDestination = true
            selected = tab
        })) {
            NavigationStack {
                FeedView(api: FeedAPI(account: account, userID: account.memberID), opensSelection: $feedSelection)
            }
            .id(account.memberID)
            .tabItem { Label("Feed", systemImage: "bubble.left.and.bubble.right") }
            .tag(Destination.feed)

            NavigationStack {
                ResearchHome(account: account, researchLink: $researchLink)
            }
            .id(account.memberID)
            .tabItem { Label("Research", systemImage: "chart.bar.xaxis") }
            .tag(Destination.research)

            NavigationStack {
                DiscoverView(api: DiscoverAPI(account: account, userID: account.memberID), opensDestination: $discoverDestination)
            }
            .id(account.memberID)
            .tabItem { Label("Discover", systemImage: "magnifyingglass") }
            .tag(Destination.discover)

            NavigationStack {
                AccountView(account: account, appearance: $appearance)
            }
            .id(account.user?.id)
            .tabItem { Label("Account", systemImage: "person.crop.circle") }
            .tag(Destination.account)
        }
        .tint(Brand.accent(for: scheme))
        .environment(\.nativeEmojiLibrary, emojiLibrary)
        .environment(\.memberResearchPreferences, researchPreferences)
        .environment(\.openURL, OpenURLAction(handler: openLink))
        .task { await emojiLibrary.refresh() }
        .onChange(of: phase) { _, current in if current == .active { Task { await emojiLibrary.refresh() } } }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let banner = announcements?.banner, banner.isActive, !banner.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               dismissedBannerVersion != banner.updatedAt {
                SiteAnnouncementBanner(banner: banner) { dismissedBannerVersion = banner.updatedAt }
                    .environment(\.openURL, OpenURLAction(handler: openLink))
            }
        }
        .sheet(item: $release, onDismiss: presentNextRelease) { current in
            NavigationStack {
                ReleaseAnnouncementView(release: current, queueCount: remainingReleases.count, action: {
                    Task { await dismissRelease(current) }
                }, problem: releaseProblem, loading: savingRelease)
                .navigationTitle("What’s New")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Dismiss release", systemImage: "xmark") { Task { await dismissRelease(current) } }
                            .labelStyle(.iconOnly).disabled(savingRelease)
                    }
                }
            }
            .interactiveDismissDisabled()
            .environment(\.openURL, OpenURLAction(handler: openLink))
            .sheet(item: $sitePresentation) { site in siteSheet(site) }
        }
        .sheet(item: appSheet, onDismiss: presentNextRelease) { site in siteSheet(site) }
        .task { await account.restore() }
        .task(id: account.memberID) { await applyLaunchPreference() }
        .task(id: account.memberID) {
            let userID = account.memberID
            dismissedReleases = []
            release = nil
            announcements = nil
            await refreshAnnouncements(for: userID)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                if phase == .active { await refreshAnnouncements(for: userID) }
            }
        }
        .onChange(of: account.needsNewPassword) { _, ready in if ready { selected = .account } }
        .onChange(of: account.user?.id) { _, signedIn in
            if signedIn != nil, !account.onboardingComplete { selected = .account }
        }
        .onChange(of: incomingURL, initial: true) {
            guard let url = incomingURL else { return }
            incomingURL = nil
            _ = openLink(url)
        }
        .onChange(of: phase) { _, phase in
            if phase == .active {
                Task {
                    await account.restore()
                    await refreshAnnouncements(for: account.memberID)
                }
            }
        }
    }

    private var remainingReleases: [SiteAnnouncements.Release] {
        (announcements?.entries ?? []).filter { !dismissedReleases.contains($0.id) }
    }

    private func refreshAnnouncements(for userID: UUID?) async {
        guard let result = try? await SiteAnnouncementsAPI(account: account, userID: userID).read(),
              !Task.isCancelled, account.memberID == userID else { return }
        announcements = result
        presentNextRelease()
    }

    private func presentNextRelease() {
        guard release == nil, account.memberID != nil, sitePresentation == nil else { return }
        releaseProblem = nil
        release = remainingReleases.first
    }

    private func dismissRelease(_ current: SiteAnnouncements.Release) async {
        guard !savingRelease, let userID = account.memberID else { return }
        savingRelease = true
        releaseProblem = nil
        defer { savingRelease = false }
        do {
            try await SiteAnnouncementsAPI(account: account, userID: userID).dismiss(current.id)
            guard account.memberID == userID else { return }
            dismissedReleases.insert(current.id)
            release = nil
        } catch let status as SlipSurgeHTTP.Status where status.code == 404 {
            dismissedReleases.insert(current.id)
            release = nil
        } catch {
            releaseProblem = "This dismissal couldn’t sync. Try again."
        }
    }

    private func applyLaunchPreference() async {
        guard let userID = account.memberID else {
            researchPreferences.apply(nil, for: nil)
            return
        }
        guard let options = try? await MemberResearchPreferencesAPI(account: account, userID: userID).load(),
              !Task.isCancelled, account.memberID == userID else { return }
        guard researchPreferences.read(for: userID) == nil else { return }
        researchPreferences.apply(options, for: userID)
        if !choseDestination, selected == .feed, sitePresentation == nil, let url = options.launch {
            _ = openLink(url)
        }
    }

    private func openLink(_ url: URL) -> OpenURLAction.Result {
        if let link = ResearchDeepLink(url) {
            choseDestination = true
            sitePresentation = nil
            researchLink = link
            selected = .research
            return .handled
        }
        guard let link = NativeSiteLink(url) else { return .systemAction }
        choseDestination = true
        switch link {
        case .feed(let feed):
            sitePresentation = nil
            feedSelection = feed
            selected = .feed
        case .account:
            sitePresentation = nil
            selected = .account
        case .launch:
            if let target = researchPreferences.read(for: account.memberID)?.launch {
                return openLink(target)
            }
            sitePresentation = nil
            selected = .feed
        case .discover(let destination):
            sitePresentation = nil
            discoverDestination = destination
            selected = .discover
        default:
            sitePresentation = SitePresentation(target: link)
        }
        return .handled
    }

    @ViewBuilder private func siteSheet(_ site: SitePresentation) -> some View {
        switch site.target {
        case .information(let page):
            InformationNavigation(page: page, account: account)
        default:
            NavigationStack {
                NativeLinkedSiteView(account: account, target: site.target, appearance: $appearance)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close", systemImage: "xmark") { sitePresentation = nil }.labelStyle(.iconOnly)
                        }
                    }
            }
            .environment(\.openURL, OpenURLAction(handler: openLink))
            .environment(\.nativeEmojiLibrary, emojiLibrary)
            .environment(\.memberResearchPreferences, researchPreferences)
        }
    }

}

private struct ResearchHome: View {
    let account: AccountStore
    @Binding var researchLink: ResearchDeepLink?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.memberResearchPreferences) private var preferences
    @State private var dugoutAvailable = false
    private var book: String? { preferences?.read(for: account.memberID)?.preferences.primaryBook }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                NavigationLink {
                    if let userID = account.memberID {
                        SidelineView(api: SidelineAPI(scope: .member(account, userID)), book: book)
                    } else {
                        SidelineView(api: SidelineAPI())
                    }
                } label: {
                    destination("The Sideline", league: "NFL", logo: "nfl")
                }
                NavigationLink {
                    if let userID = account.memberID {
                        CourtView(scope: .member(account, userID), book: book)
                    } else {
                        CourtView(scope: .preview)
                    }
                } label: {
                    destination("The Court", league: "NBA", logo: "nba")
                }
                if let userID = account.memberID, dugoutAvailable {
                    NavigationLink {
                        DugoutView(api: .init(account: account, userID: userID))
                    } label: {
                        destination("The Dugout", league: "MLB", logo: "mlb")
                    }
                }
                if account.memberID == nil {
                    NavigationLink {
                        NativeMembershipOverview(account: account)
                    } label: { Label("Compare memberships", systemImage: "bolt.circle") }
                        .buttonStyle(.bordered)
                } else if let id = account.memberID {
                    NavigationLink {
                        ResearchLibraryView(api: ResearchLibraryAPI(account: account, userID: id))
                    } label: {
                        ResearchToolCard(color: Brand.accent(for: scheme)) {
                            Label("Workspace", systemImage: "square.grid.2x2").font(.title3.weight(.semibold))
                        } content: {
                            Text("Watchlist, comparisons, notes and shared research").font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    NavigationLink {
                        MyPicksView(api: DiscoverAPI(account: account, userID: id))
                    } label: {
                        ResearchToolCard(color: Brand.accent(for: scheme)) {
                            Label("My Picks", systemImage: "list.clipboard").font(.title3.weight(.semibold))
                        } content: {
                            Text("Active picks, parlays and results").font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                }
            }
            .padding()
        }
        .navigationTitle("Research")
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationDestination(item: $researchLink) { link in
            LinkedResearchView(account: account, link: link, preferredBook: book).id(link)
        }
        .task(id: account.memberID) {
            guard let userID = account.memberID else { dugoutAvailable = false; return }
            let allowed = (try? await DugoutAPI(account: account, userID: userID).available()) == true
            if !Task.isCancelled, userID == account.memberID { dugoutAvailable = allowed }
        }
    }

    private func destination(_ title: String, league: String, logo: String) -> some View {
        HStack(spacing: 15) {
            ResearchArtwork(
                urls: LeagueArtwork.logo(logo).map { [$0] } ?? [],
                fallback: ["nfl": "football", "nba": "basketball", "mlb": "baseball"][logo] ?? "sportscourt"
            )
            .frame(width: 39, height: 39)
            VStack(alignment: .leading, spacing: 5) {
                Text(league).font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                Text(title).font(.title3.weight(.semibold))
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
        .padding(15)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14).strokeBorder(.secondary.opacity(0.2))
        }
        .accessibilityElement(children: .combine)
    }
}
