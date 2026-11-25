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
    @State private var researchPath: [ResearchPresentation] = []
    @State private var discoverDestination: DiscoverDestination?
    @State private var feedSelection: NativeFeedSelection?
    @State private var emojiLibrary = NativeEmojiLibrary()
    @State private var researchPreferences = MemberResearchPreferenceStore()
    @State private var resume = NativeResumeStore()
    @State private var choseDestination = false

    private struct SitePresentation: Identifiable {
        let id = UUID()
        let target: NativeSiteLink
    }

    private struct ResearchPresentation: Hashable {
        let id = UUID()
        let link: ResearchDeepLink
    }

    private var appSheet: Binding<SitePresentation?> {
        Binding(get: { release == nil ? sitePresentation : nil }, set: { if release == nil { sitePresentation = $0 } })
    }

    var body: some View {
        TabView(selection: Binding(get: { selected }, set: { tab in
            choseDestination = true
            selected = tab
            switch tab {
            case .discover: resume.record(.init(path: "/community", title: "Communities"), account: account, interaction: true)
            case .account: resume.record(.init(path: "/settings", title: "Account"), account: account, interaction: true)
            case .feed, .research: break
            }
        })) {
            NavigationStack {
                FeedView(api: FeedAPI(account: account, userID: account.memberID), opensSelection: $feedSelection)
                    .environment(\.nativeResumeActive, selected == .feed && sitePresentation == nil)
            }
            .id(account.memberID)
            .tabItem { Label("Feed", systemImage: "bubble.left.and.bubble.right") }
            .tag(Destination.feed)

            NavigationStack(path: $researchPath) {
                ResearchHome(account: account)
                    .navigationDestination(for: ResearchPresentation.self) { route in
                        let book = researchPreferences.read(for: account.memberID)?.preferences.primaryBook
                        LinkedResearchView(account: account, link: route.link, preferredBook: book)
                            .id(route.id)
                    }
            }
            .id(account.memberID)
            .environment(\.nativeResumeActive, selected == .research && sitePresentation == nil)
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
        .environment(\.nativeResume, resume)
        .environment(\.openURL, OpenURLAction(handler: openLink))
        .task { await emojiLibrary.refresh() }
        .onChange(of: phase) { _, current in if current == .active { Task { await emojiLibrary.refresh() } } }
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 5) {
                if let banner = announcements?.banner, banner.isActive, !banner.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   dismissedBannerVersion != banner.updatedAt {
                    SiteAnnouncementBanner(banner: banner) { dismissedBannerVersion = banner.updatedAt }
                        .environment(\.openURL, OpenURLAction(handler: openLink))
                }
                if release == nil, sitePresentation == nil, let offer = resume.offer {
                    NativeResumeOffer(offer: offer, open: {
                        resume.select(offer)
                        _ = routeLink(offer.url, track: false)
                    }, dismiss: resume.dismiss)
                }
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
        .task(id: account.memberID) { await resume.refresh(account: account, userID: account.memberID) }
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
                    await resume.refresh(account: account, userID: account.memberID)
                }
            } else if phase == .background {
                Task { await resume.flush(account: account) }
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
            _ = routeLink(url, track: false)
        }
    }

    private func openLink(_ url: URL) -> OpenURLAction.Result {
        routeLink(url, track: true)
    }

    private func routeLink(_ url: URL, track: Bool) -> OpenURLAction.Result {
        if let link = ResearchDeepLink(url) {
            choseDestination = true
            sitePresentation = nil
            researchPath = [ResearchPresentation(link: link)]
            selected = .research
            if track, let target = NativeResumeLocation.destination(url) { resume.record(target, account: account, interaction: true) }
            return .handled
        }
        guard let link = NativeSiteLink(url) else { return .systemAction }
        choseDestination = true
        if track, let target = NativeResumeLocation.destination(url) { resume.record(target, account: account, interaction: true) }
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
                return routeLink(target, track: track)
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

private struct NativeResumeOffer: View {
    let offer: NativeResumeStore.Offer
    let open: () -> Void
    let dismiss: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let content = HStack(spacing: 4) {
            Button(action: open) {
                HStack(spacing: 9) {
                    Image(systemName: "clock.arrow.circlepath").font(.title3)
                        .foregroundStyle(Brand.accent(for: scheme))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Continue where you left off").font(.caption).foregroundStyle(.secondary)
                        Text(offer.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                    }
                    Spacer(minLength: 2)
                    Image(systemName: "arrow.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
                }
                .frame(minHeight: 45)
                .contentShape(.rect)
            }
            .buttonStyle(SlipSurgePressStyle())
            Button("Dismiss resume offer", systemImage: "xmark", action: dismiss)
                .labelStyle(.iconOnly).font(.caption.weight(.semibold))
                .buttonStyle(.borderless).frame(minWidth: 44, minHeight: 44)
        }
        .foregroundStyle(Brand.text(for: scheme)).padding(.leading, 12).padding(.vertical, 3)
        Group {
            if #available(iOS 26, *) { content.glassEffect(.regular, in: .rect(cornerRadius: 18)) }
            else { content.background(.regularMaterial, in: .rect(cornerRadius: 18)) }
        }.padding(.horizontal, 14).padding(.vertical, 5)
    }
}

private struct ResearchHome: View {
    let account: AccountStore
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
                        NativeMarketplaceView(api: .init(account: account, userID: id), userID: id, target: .init())
                    } label: {
                        ResearchToolCard(color: Brand.accent(for: scheme)) {
                            Label("Matrix Marketplace", systemImage: "storefront").font(.title3.weight(.semibold))
                        } content: { EmptyView() }
                    }
                    .buttonStyle(SlipSurgePressStyle())
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
