import SwiftUI

struct SlipSurgeTabs: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Binding var researchLink: ResearchDeepLink?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @Environment(\.openURL) private var systemOpenURL
    private enum Destination { case feed, research, discover, account }
    @State private var selected = Destination.feed
    @State private var announcements: SiteAnnouncements?
    @State private var dismissedBannerVersion: String?
    @State private var release: SiteAnnouncements.Release?
    @State private var dismissedReleases: Set<UUID> = []
    @State private var savingRelease = false
    @State private var releaseProblem: String?
    @State private var informationPage: InformationPage?

    var body: some View {
        TabView(selection: $selected) {
            NavigationStack {
                FeedView(api: FeedAPI(account: account, userID: account.memberID))
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
                DiscoverView(api: DiscoverAPI(account: account, userID: account.memberID))
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
        .safeAreaInset(edge: .top, spacing: 0) {
            if let banner = announcements?.banner, banner.isActive, !banner.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               dismissedBannerVersion != banner.updatedAt {
                SiteAnnouncementBanner(banner: banner) { dismissedBannerVersion = banner.updatedAt }
                    .environment(\.openURL, OpenURLAction(handler: announcementLink))
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
            .environment(\.openURL, OpenURLAction(handler: announcementLink))
        }
        .sheet(item: $informationPage) { page in InformationNavigation(page: page, account: account) }
        .task { await account.restore() }
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
        .onChange(of: researchLink, initial: true) {
            if researchLink != nil { selected = .research }
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
        guard release == nil, account.memberID != nil, informationPage == nil else { return }
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

    private func announcementLink(_ url: URL) -> OpenURLAction.Result {
        if let link = ResearchDeepLink(url) {
            researchLink = link
            return .handled
        }
        guard url.scheme == "https", [SlipSurgeHTTP.site, "slipsurge.com"].contains(url.host ?? "") else {
            return .systemAction
        }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if let page = InformationPage(rawValue: path), release == nil {
            informationPage = page
        } else if ["", "feed", "home"].contains(path) {
            selected = .feed
        } else if ["discover", "groups", "creators", "leaderboard", "scores"].contains(path) {
            selected = .discover
        } else if ["account", "settings", "auth/login"].contains(path) {
            selected = .account
        } else {
            systemOpenURL(url)
        }
        return .handled
    }
}

private struct ResearchHome: View {
    let account: AccountStore
    @Binding var researchLink: ResearchDeepLink?
    @Environment(\.colorScheme) private var scheme
    @State private var dugoutAvailable = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                NavigationLink {
                    if let userID = account.memberID {
                        SidelineView(api: SidelineAPI(scope: .member(account, userID)))
                    } else {
                        SidelineView(api: SidelineAPI())
                    }
                } label: {
                    destination("The Sideline", league: "NFL", logo: "nfl")
                }
                NavigationLink {
                    if let userID = account.memberID {
                        CourtView(scope: .member(account, userID))
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
        .navigationDestination(item: $researchLink) { link in LinkedResearchView(account: account, link: link).id(link) }
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
