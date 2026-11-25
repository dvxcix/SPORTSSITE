import SwiftUI

struct HomeView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Image("brand")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 52, height: 52)
                        .clipShape(.rect(cornerRadius: 12))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading) {
                        Text("SlipSurge").font(.title2.bold())
                        Text("Sports research and picks").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(Brand.surface(for: scheme))

            Section("On the web") {
                SiteLink("Communities", path: "/groups")
                SiteLink("Creators", path: "/creators")
                SiteLink("Scores", path: "/sports")
                SiteLink("Records", path: "/leaderboard")
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
        .navigationTitle("Home")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }
}

struct SiteLink: View {
    let title: String
    let path: String

    init(_ title: String, path: String) {
        self.title = title
        self.path = path
    }

    var body: some View {
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = path
        return Group {
            if let url = components.url {
                Link(destination: url) {
                    HStack {
                        Text(title)
                        Spacer()
                        Image(systemName: "arrow.up.right").accessibilityHidden(true)
                    }
                }
                .accessibilityHint("Opens the SlipSurge website")
            }
        }
    }
}
