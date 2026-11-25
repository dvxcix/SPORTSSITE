import SwiftUI

struct SlipSurgeTabs: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    private enum Destination { case feed, research, discover, account }
    @State private var selected = Destination.feed

    var body: some View {
        TabView(selection: $selected) {
            NavigationStack {
                FeedView(api: FeedAPI(account: account, userID: account.memberID))
            }
            .id(account.memberID)
            .tabItem { Label("Feed", systemImage: "bubble.left.and.bubble.right") }
            .tag(Destination.feed)

            NavigationStack {
                ResearchHome(account: account)
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
        .task { await account.restore() }
        .onChange(of: account.needsNewPassword) { _, ready in if ready { selected = .account } }
        .onChange(of: account.user?.id) { _, signedIn in
            if signedIn != nil, !account.onboardingComplete { selected = .account }
        }
        .onChange(of: phase) { _, phase in
            if phase == .active { Task { await account.restore() } }
        }
    }
}

private struct ResearchHome: View {
    let account: AccountStore
    @Environment(\.colorScheme) private var scheme

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
                if account.memberID == nil {
                    Text("Preview one matchup. Ultimate includes the full workspaces.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 2)
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
    }

    private func destination(_ title: String, league: String, logo: String) -> some View {
        HStack(spacing: 15) {
            ResearchArtwork(
                urls: LeagueArtwork.logo(logo).map { [$0] } ?? [],
                fallback: logo == "nfl" ? "football" : "basketball"
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
