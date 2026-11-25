import SwiftUI

struct NativeExploreView: View {
    private struct Explore: Decodable {
        struct Spotlight: Decodable, Identifiable {
            let id: UUID
            let username: String
            let displayName: String?
            let avatarUrl: URL?
            let avatarRingColor: String?
            let followerCount: Int?
            let isVerified: Bool?
            let following: Bool
            let own: Bool
        }

        let date: String
        let sports: [String]
        let trendingPicks: [FeedPost]
        let trendingPosts: [FeedPost]
        let groups: [NativeSearchAPI.Community]
        let pages: [NativeSearchAPI.Community]
        let creators: [Spotlight]
        let members: [Spotlight]
    }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @State private var data: Explore?
    @State private var scoreboard: Scoreboard?
    @State private var error: (any Error)?
    @State private var changingPeople = Set<UUID>()
    @State private var changingPosts = Set<UUID>()
    @State private var following: [UUID: Bool] = [:]
    @State private var selectedPost: UUID?
    @State private var actionProblem = false
    @State private var revision = 0

    private static let path = "/api/mobile/explore"
    private var feed: FeedAPI { .init(account: api.account, userID: api.userID) }
    private var leagueIDs: [String] { data?.sports.filter { ["MLB", "NFL", "NBA"].contains($0) }.map { $0.lowercased() } ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 17) {
                if let data {
                    sportTopics(data.sports)
                    slate(data.date)
                    postRail("Picks gaining attention", posts: data.trendingPicks, filter: .picks)
                    postRail("Trending posts", posts: data.trendingPosts, filter: .top)
                    research
                    communities("Pages to follow", path: "/pages", rows: data.pages, icon: "star")
                    communities("Groups to discover", path: "/groups", rows: data.groups, icon: "person.2")
                    people("Creators to watch", rows: data.creators)
                    people("Community standouts", rows: data.members)
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView {
                        Label("Basic membership required", systemImage: "lock")
                    } actions: {
                        NavigationLink("Compare memberships") { NativeMembershipOverview(account: api.account) }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ResearchToolMessage(title: "Explore couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle("Explore")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink {
                    NativeSearchView(api: .init(viewer: api))
                } label: { Label("Search", systemImage: "magnifyingglass") }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .navigationDestination(item: $selectedPost) { id in
            let posts = (data?.trendingPicks ?? []) + (data?.trendingPosts ?? [])
            FeedThreadView(api: feed, id: id, original: posts.first { $0.postID == id })
        }
        .alert("Change couldn’t be confirmed", isPresented: $actionProblem) { Button("OK", role: .cancel) {} }
    }

    private func sportTopics(_ sports: [String]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(sports, id: \.self) { sport in
                    siteButton("/hashtag/\(sport.lowercased())") {
                        HStack(spacing: 6) {
                            ResearchArtwork(urls: LeagueArtwork.logo(sport).map { [$0] } ?? [], fallback: "number")
                                .frame(width: 20, height: 20)
                            Text(verbatim: sport).font(.subheadline.weight(.semibold))
                        }.padding(.horizontal, 12).frame(minHeight: 44)
                            .background(Brand.surface(for: scheme), in: .capsule)
                    }
                }
            }
        }.scrollIndicators(.hidden)
    }

    private func slate(_ date: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                heading("Around the slate")
                Spacer()
                NavigationLink { ScoresView(api: api) } label: { Label("Live Scores", systemImage: "arrow.right.circle") }
                    .buttonStyle(.bordered)
            }
            if let scoreboard {
                ForEach(leagueIDs, id: \.self) { league in
                    let all = scoreboard.leagues.first { $0.id == league }
                    HStack(spacing: 7) {
                        ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt")
                            .frame(width: 22, height: 22)
                        Text(LeagueArtwork.label(league)).font(.headline)
                    }.accessibilityAddTraits(.isHeader)
                    if let matches = all?.games, !matches.isEmpty {
                        ScrollView(.horizontal) {
                            HStack(spacing: 8) {
                                ForEach(matches.prefix(8)) { match in
                                    NavigationLink { GameCenterView(api: api, game: match, date: date) } label: {
                                        ResearchMatchup(away: scoreTeam(match.away), home: scoreTeam(match.home),
                                            subtitle: scoreLabel(match), fullWidth: false)
                                    }.buttonStyle(SlipSurgePressStyle())
                                }
                            }
                        }.scrollIndicators(.hidden)
                    } else if all?.available == false {
                        Text("Scores unavailable").font(.subheadline).foregroundStyle(.secondary)
                    } else {
                        Text("No games scheduled").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("Scores couldn’t load.").font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func scoreTeam(_ team: Scoreboard.Match.Team) -> ResearchMatchup.Team {
        let primary = team.color.flatMap { Color(hex: $0.hasPrefix("#") ? $0 : "#" + $0) }
        let secondary = team.secondary.flatMap { Color(hex: $0.hasPrefix("#") ? $0 : "#" + $0) }
        return .init(name: team.abbreviation, logo: team.logo, color: primary ?? Brand.surface(for: scheme), secondary: secondary)
    }

    private func scoreLabel(_ match: Scoreboard.Match) -> String {
        if let away = match.away.score, let home = match.home.score { return "\(away)–\(home) · \(match.label)" }
        return match.label
    }

    @ViewBuilder private func postRail(_ title: String, posts: [FeedPost], filter: FeedFilter) -> some View {
        if !posts.isEmpty {
            heading(title, path: "/feed?filter=\(filter.rawValue)")
            ForEach(posts) { post in
                FeedPostCard(post: post, operation: { action in Task { await postAction(action, id: post.postID) } },
                    discussion: { selectedPost = post.postID },
                    showAuthor: post.author.flatMap { member in siteURL("/profile/\(member.username)").map { url in { openURL(url) } } },
                    actionsAPI: feed, postChanged: { _ in revision += 1 })
                    .padding(13).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
                    .disabled(changingPosts.contains(post.postID))
            }
        }
    }

    private var research: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("Research", systemImage: "chart.bar.xaxis").font(.title3.bold())
        } content: {
            VStack(alignment: .leading, spacing: 9) {
                if leagueIDs.contains("mlb") { researchLink("The Dugout", league: "mlb", path: "/dugout") }
                researchLink("The Sideline", league: "nfl", path: "/the-sideline")
                researchLink("The Court", league: "nba", path: "/the-paint")
                siteButton("/pricing") { Label("Compare memberships", systemImage: "bolt.circle").font(.subheadline) }
            }
        }
    }

    private func researchLink(_ name: String, league: String, path: String) -> some View {
        siteButton(path) {
            HStack(spacing: 8) {
                ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt")
                    .frame(width: 28, height: 28)
                Text(verbatim: name).font(.headline)
                Spacer()
                chevron
            }.frame(minHeight: 44)
        }
    }

    @ViewBuilder private func communities(_ title: String, path: String, rows: [NativeSearchAPI.Community], icon: String) -> some View {
        if !rows.isEmpty {
            heading(title, path: path)
            ForEach(rows) { row in
                siteButton(row.path) {
                    HStack(spacing: 10) {
                        ResearchArtwork(urls: row.avatarUrl.map { [$0] } ?? [], fallback: icon)
                            .frame(width: 41, height: 41).clipShape(.rect(cornerRadius: 8))
                        identity(row.name, detail: row.description, verified: false)
                        Spacer()
                        chevron
                    }.padding(10).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
                }
            }
        }
    }

    @ViewBuilder private func people(_ title: String, rows: [Explore.Spotlight]) -> some View {
        if !rows.isEmpty {
            heading(title)
            ForEach(rows) { person in
                let following = self.following[person.id] ?? person.following
                HStack(spacing: 11) {
                    siteButton("/profile/\(person.username)") {
                        HStack(spacing: 9) {
                            ResearchArtwork(urls: person.avatarUrl.map { [$0] } ?? [], fallback: "person.crop.circle")
                                .frame(width: 43, height: 43).clipShape(.circle)
                                .overlay { Circle().strokeBorder(Color(hex: person.avatarRingColor) ?? .clear, lineWidth: 1.5) }
                            identity(person.displayName ?? person.username, detail: person.followerCount.map { "\($0.formatted()) followers" },
                                verified: person.isVerified == true)
                            Spacer(minLength: 0)
                        }
                    }
                    if !person.own {
                        Button(following ? "Following" : "Follow") {
                            Task { await follow(person.id, enable: !following) }
                        }.buttonStyle(.bordered).disabled(changingPeople.contains(person.id))
                    }
                }.padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
            }
        }
    }

    private func identity(_ name: String, detail: String?, verified: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Text(verbatim: name).font(.headline)
                if verified {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Verified")
                }
            }
            if let detail, !detail.isEmpty { Text(verbatim: detail).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
        }
    }

    private func heading(_ title: String, path: String? = nil) -> some View {
        HStack {
            Text(verbatim: title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if let path {
                siteButton(path) { Label("See all \(title.lowercased())", systemImage: "arrow.right.circle").labelStyle(.iconOnly) }
            }
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
    }

    private func siteURL(_ path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"), let url = URL(string: "https://" + SlipSurgeHTTP.site + path),
              NativeSiteLink(url) != nil || ResearchDeepLink(url) != nil else { return nil }
        return url
    }

    @ViewBuilder private func siteButton<Label: View>(_ path: String, @ViewBuilder label: () -> Label) -> some View {
        if let url = siteURL(path) {
            Button { openURL(url) } label: { label().contentShape(.rect) }.buttonStyle(SlipSurgePressStyle())
        }
    }

    private func load() async {
        do {
            let result = try await api.readPublic(Explore.self, path: Self.path)
            guard !Task.isCancelled else { return }
            data = result
            following = [:]
            error = nil
            scoreboard = try? await api.readPublic(Scoreboard.self, path: "/api/mobile/scores", query: [.init(name: "date", value: result.date)])
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func follow(_ id: UUID, enable: Bool) async {
        guard api.userID != nil, changingPeople.insert(id).inserted else { return }
        defer { changingPeople.remove(id) }
        do {
            struct Edit: Encodable { let id: String; let action: String; let enabled: Bool }
            struct Result: Decodable { let ok: Bool }
            let reply = try await api.write(Result.self, path: "/api/mobile/profiles",
                body: Edit(id: id.uuidString.lowercased(), action: "follow", enabled: enable))
            guard reply.ok else { throw URLError(.cannotParseResponse) }
            following[id] = enable
        } catch {
            actionProblem = true
            revision += 1
        }
    }

    private func postAction(_ action: FeedAPI.Mutation, id: UUID) async {
        guard changingPosts.insert(id).inserted else { return }
        defer { changingPosts.remove(id) }
        do { try await feed.mutate(id, action: action) }
        catch { actionProblem = true }
        revision += 1
    }
}
