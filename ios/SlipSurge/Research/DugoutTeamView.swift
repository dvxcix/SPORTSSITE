import SwiftUI

struct DugoutTeamView: View {
    private struct Team: Decodable {
        struct Player: Decodable, Identifiable {
            let id: Int
            let name: String
            let group: String
            let position: String?
            let abbreviation: String?
            let jersey: String?
            let status: String?
            let headshot: URL

            var subtitle: String {
                [position ?? abbreviation ?? group, jersey.flatMap { $0.isEmpty ? nil : "#\($0)" },
                    status == "Active" ? nil : status].compactMap { $0 }.joined(separator: " · ")
            }
        }

        let id: Int
        let name: String
        let code: String
        let venue: String?
        let league: String?
        let division: String?
        let logo: URL?
        let primary: String?
        let secondary: String?
        let roster: [Player]
    }

    let api: DugoutPlayerProfileAPI
    let id: Int
    @Environment(\.slipPalette) private var slipPalette
    @State private var team: Team?
    @State private var error: (any Error)?
    @State private var search = ""
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let team {
                    header(team)
                    roster(team)
                } else if (error as? SlipSurgeHTTP.Status)?.code == 404 {
                    ContentUnavailableView("MLB team unavailable", systemImage: "baseball.diamond")
                } else {
                    ResearchToolMessage(title: "MLB roster couldn’t load", error: error) { revision += 1 }
                }
            }.padding(16)
        }
        .navigationTitle(team?.name ?? "MLB Team")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .searchable(text: $search, prompt: "Find a player")
        .refreshable { await load() }
        .task(id: revision) { await load() }
    }

    private func header(_ team: Team) -> some View {
        let primary = Color(hex: team.primary) ?? slipPalette.accent
        let secondary = Color(hex: team.secondary) ?? primary
        return ResearchToolCard(color: primary) {
            ResearchToolPortrait(name: team.name, subtitle: [team.league, team.division].compactMap { $0 }.joined(separator: " · "),
                portraits: [], teamLogo: team.logo, primary: primary, secondary: secondary)
        } content: {
            if let venue = team.venue { Label(venue, systemImage: "baseball.diamond").font(.subheadline) }
            Label("\(team.roster.count.formatted()) active players", systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func roster(_ team: Team) -> some View {
        let players = team.roster.filter { search.isEmpty || $0.name.localizedStandardContains(search) || $0.jersey == search }
        let groups = Dictionary(grouping: players, by: \.group)
        let positionOrder = ["Pitcher", "Catcher", "Infielder", "Outfielder", "Designated Hitter", "Two-Way Player"]
        let order = groups.keys.sorted { left, right in
            let a = positionOrder.firstIndex(of: left) ?? positionOrder.count
            let b = positionOrder.firstIndex(of: right) ?? positionOrder.count
            return a == b ? left < right : a < b
        }
        if players.isEmpty { ContentUnavailableView(search.isEmpty ? "No active roster" : "No matching players", systemImage: "person.2") }
        ForEach(order, id: \.self) { group in
            ResearchToolCard(color: Color(hex: team.primary) ?? slipPalette.accent) {
                ResearchSectionTitle(title: group)
            } content: {
                ForEach(groups[group] ?? []) { player in
                    NavigationLink {
                        DugoutPlayerProfileView(api: api, playerID: player.id, preferredRole: group == "Pitcher" ? .pitcher : .batter)
                    } label: {
                        HStack {
                            DugoutOpponentArtwork(name: player.name, subtitle: player.subtitle, headshot: player.headshot, logo: team.logo)
                            Spacer(minLength: 2)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        }.frame(minHeight: 44)
                    }.buttonStyle(SlipSurgePressStyle())
                }
            }
        }
    }

    private func load() async {
        error = nil
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/team", query: [.init(name: "id", value: String(id))],
                account: api.account, userID: api.userID)
            let result = try JSONDecoder().decode(Team.self, from: data)
            guard result.id == id else { throw URLError(.cannotParseResponse) }
            try Task.checkCancellation()
            team = result
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
