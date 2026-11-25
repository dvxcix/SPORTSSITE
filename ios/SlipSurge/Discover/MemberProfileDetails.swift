import SwiftUI

struct MemberProfileDetails: View {
    let profile: MemberProfileView.Page.Profile
    @Environment(\.dismiss) private var dismiss
    @State private var badge: MemberProfileView.Page.Profile.Badge?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let date = profile.createdAt.flatMap(SidelineBoard.timestamp) {
                        Label("Joined \(date.formatted(.dateTime.month(.wide).year()))", systemImage: "calendar")
                    }
                    if let url = MemberProfileLink.safeLink(profile.website), let host = url.host {
                        Link(destination: url) { Label(host, systemImage: "link") }
                    }
                    ForEach(MemberProfileLink.links(profile)) { link in
                        if let destination = link.href {
                            Link(destination: destination) { socialRow(link) }
                        } else {
                            socialRow(link)
                        }
                    }
                }
                if let books = profile.sportsbooks, !books.isEmpty {
                    Section("Sportsbooks") {
                        ForEach(Array(books.enumerated()), id: \.offset) { _, book in
                            Label { Text(Sportsbook.name(Sportsbook.normalized(book))) } icon: { ProfileSportsbookLogo(key: book) }
                        }
                    }
                }
                if !profile.sports.isEmpty || !profile.teams.isEmpty || !profile.players.isEmpty {
                    Section("Favorites") {
                        ForEach(profile.sports, id: \.self) { sport in
                            mark(LeagueArtwork.label(sport), url: LeagueArtwork.logo(sport), symbol: "sportscourt")
                        }
                        ForEach(profile.teams) { team in mark(team.title, url: team.logo, symbol: "shield") }
                        ForEach(profile.players) { player in mark(player.name, url: player.headshot ?? player.teamLogo, symbol: "person.fill") }
                    }
                }
                if !profile.badges.isEmpty {
                    Section("Achievements") {
                        ForEach(profile.badges) { item in
                            Button { badge = item } label: { mark(item.name, url: item.iconUrl ?? item.cardImageUrl, symbol: "rosette") }
                        }
                    }
                }
            }
            .navigationTitle("Profile details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $badge) { item in
                VStack(spacing: 12) {
                    ResearchArtwork(urls: [item.cardImageUrl, item.iconUrl].compactMap { $0 }, fallback: "rosette")
                        .frame(maxWidth: 190, maxHeight: 145)
                    Text(item.name).font(.title3.bold())
                    if let description = item.description { Text(description).font(.subheadline).foregroundStyle(.secondary) }
                }.padding(22).presentationDetents([.medium])
            }
        }
    }

    private func socialRow(_ link: MemberProfileLink) -> some View {
        HStack(spacing: 10) {
            link.artwork.frame(width: 22, height: 22).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(link.name).font(.subheadline.weight(.semibold))
                Text(link.handle).font(.footnote).foregroundStyle(.secondary)
            }
            if link.verified { Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified") }
        }
    }

    private func mark(_ name: String, url: URL?, symbol: String) -> some View {
        Label {
            Text(name)
        } icon: {
            ResearchArtwork(urls: [url].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: symbol)
                .frame(width: 24, height: 24).accessibilityHidden(true)
        }
    }
}
