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
                AccountView(account: account, appearance: $appearance)
            }
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
        List {
            if let userID = account.memberID {
                Section("Member research") {
                    NavigationLink {
                        SidelineView(api: SidelineAPI(scope: .member(account, userID)))
                    } label: {
                        Label("The Sideline", systemImage: "football")
                    }
                    NavigationLink {
                        CourtView(scope: .member(account, userID))
                    } label: {
                        Label("The Court", systemImage: "basketball")
                    }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
            Section("Featured matchups") {
                NavigationLink {
                    SidelineView(api: SidelineAPI())
                } label: {
                    Label("The Sideline", systemImage: "football")
                }
                NavigationLink {
                    CourtView(scope: .featured)
                } label: {
                    Label("The Court", systemImage: "basketball")
                }
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
        .navigationTitle("Research")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }
}
