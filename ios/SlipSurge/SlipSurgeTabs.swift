import SwiftUI

struct SlipSurgeTabs: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase

    var body: some View {
        TabView {
            NavigationStack {
                HomeView()
            }
            .tabItem { Label("Home", systemImage: "house") }

            NavigationStack {
                ResearchHome(account: account)
            }
            .id(account.memberID)
            .tabItem { Label("Research", systemImage: "chart.bar.xaxis") }

            NavigationStack {
                FeedView(api: FeedAPI(account: account, userID: account.memberID))
            }
            .id(account.memberID)
            .tabItem { Label("Feed", systemImage: "bubble.left.and.bubble.right") }

            NavigationStack {
                AccountView(account: account, appearance: $appearance)
            }
            .id(account.user?.id)
            .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(Brand.accent(for: scheme))
        .task { await account.restore() }
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
                urls: URL(string: "https://a.espncdn.com/i/teamlogos/leagues/500/\(logo).png").map { [$0] } ?? [],
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
