import SwiftUI

struct NativeSearchView: View {
    private struct Request: Equatable {
        let query: String
        let tab: NativeSearchAPI.Tab
        let revision: Int
    }

    private struct Output {
        let request: Request
        let social: NativeSearchAPI.Results
        let sports: [NativeSearchAPI.SportHit]
    }

    let api: NativeSearchAPI
    var initialQuery = ""
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @State private var text = ""
    @State private var tab = NativeSearchAPI.Tab.all
    @State private var output: Output?
    @State private var saved: [NativeSearchAPI.Saved] = []
    @State private var recent: [String] = []
    @State private var nbaAvailable = false
    @State private var mlbAvailable = false
    @State private var loaded = false
    @State private var forbidden = false
    @State private var revision = 0
    @State private var error: String?
    @State private var changeInProgress = false
    @State private var savedNotice: String?
    @State private var selectedPost: UUID?
    @State private var pendingPosts = Set<UUID>()

    private var request: Request { .init(query: text.trimmingCharacters(in: .whitespacesAndNewlines), tab: tab, revision: revision) }
    private var tabs: [NativeSearchAPI.Tab] { NativeSearchAPI.Tab.allCases.filter { ($0 != .nba || nbaAvailable) && ($0 != .mlb || mlbAvailable) } }
    private var recentKey: String? { api.viewer.userID.map { "SlipSurge.Search.Recent.\($0.uuidString.lowercased())" } }
    private var feed: FeedAPI { .init(account: api.viewer.account, userID: api.viewer.userID) }
    private static let trending = ["OverUnder", "NFL2026", "Props", "Parlays", "NBA"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if forbidden {
                    ContentUnavailableView {
                        Label("Basic membership required", systemImage: "lock")
                    } actions: {
                        NavigationLink("Compare memberships") { NativeMembershipOverview(account: api.viewer.account) }
                            .buttonStyle(.borderedProminent)
                    }
                } else if loaded {
                    if request.query.isEmpty { savedAndRecent }
                    else { queryResults }
                } else if error != nil {
                    Button("Retry search") { Task { await prepare() } }.buttonStyle(.bordered)
                } else {
                    ProgressView("Loading search").frame(maxWidth: .infinity)
                }
                if let savedNotice { Text(savedNotice).font(.footnote).foregroundStyle(.secondary) }
            }
            .padding(16)
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $text, prompt: "Players, teams, posts and picks")
        .onSubmit(of: .search) { remember(request.query) }
        .onChange(of: text) { _, current in if current.count > 64 { text = String(current.prefix(64)) } }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task { await prepare() }
        .task(id: request) { await find(request) }
        .navigationDestination(item: $selectedPost) { id in
            FeedThreadView(api: feed, id: id, original: output?.social.posts.first(where: { $0.postID == id }))
        }
        .toolbar {
            if loaded, !request.query.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Button("Save search", systemImage: isSaved ? "bookmark.fill" : "bookmark") { Task { await save() } }
                        .labelStyle(.iconOnly).disabled(changeInProgress)
                }
            }
        }
    }

    @ViewBuilder private var queryResults: some View {
        ResearchToolRail(title: "Results", choices: tabs, selection: $tab, label: \.title, glyph: \.symbol)
        if let output, output.request == request {
            if output.social.isEmpty && output.sports.isEmpty {
                ContentUnavailableView.search(text: request.query)
            } else {
                ForEach([NativeSearchAPI.Tab.mlb, .nfl, .nba], id: \.self) { league in
                    let hits = output.sports.filter { $0.league == league }
                    if !hits.isEmpty { sportsSection(league, hits: hits) }
                }
                members(output.social.users)
                communities("Groups", output.social.groups, symbol: "person.2")
                communities("Pages", output.social.pages, symbol: "star")
                communities("Live rooms", output.social.rooms, symbol: "number")
                communities("Events", output.social.events, symbol: "calendar")
                posts(output.social.posts)
            }
        } else if let error {
            ContentUnavailableView {
                Label(error, systemImage: "magnifyingglass")
            } actions: {
                Button("Retry") { revision += 1 }
            }
        } else {
            ProgressView("Searching").frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder private var savedAndRecent: some View {
        if !saved.isEmpty {
            heading("Saved searches", symbol: "bookmark.fill")
            ForEach(saved) { entry in
                HStack {
                    Button {
                        text = entry.query
                        tab = tabs.contains(entry.resultTab) ? entry.resultTab : .all
                        remember(entry.query)
                        Task { await change(entry.id, removing: false) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: entry.query).font(.headline)
                            Text(entry.resultTab.title).font(.caption).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    Button("Remove saved search", systemImage: "xmark") {
                        Task { await change(entry.id, removing: true) }
                    }.labelStyle(.iconOnly).buttonStyle(.borderless).disabled(changeInProgress)
                }
                .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
            }
        }
        if !recent.isEmpty {
            HStack {
                heading("Recent", symbol: "clock")
                Spacer()
                Button("Clear") { updateRecent([]) }
            }
            ForEach(recent, id: \.self) { query in
                HStack {
                    Button { text = query } label: {
                        Text(verbatim: query).frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(.plain)
                    Button("Remove recent search", systemImage: "xmark") {
                        updateRecent(recent.filter { $0 != query })
                    }.labelStyle(.iconOnly).buttonStyle(.borderless)
                }.padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
            }
        }
        heading("Trending", symbol: "flame")
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.trending, id: \.self) { query in
                    Button(query, systemImage: "number") { text = query }.buttonStyle(.bordered)
                }
            }
        }.scrollIndicators(.hidden)
    }

    private func sportsSection(_ league: NativeSearchAPI.Tab, hits: [NativeSearchAPI.SportHit]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ResearchArtwork(urls: LeagueArtwork.logo(league.rawValue).map { [$0] } ?? [], fallback: league.symbol)
                    .frame(width: 24, height: 24).accessibilityHidden(true)
                Text(league.title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            }
            ForEach(hits) { hit in
                VStack(alignment: .leading, spacing: 8) {
                    routeButton(hit.path) {
                        HStack(spacing: 10) {
                            if let headshot = hit.headshot {
                                let colors = league == .nba ? CourtTeamColors.colors(for: hit.team ?? "") : nil
                                PlayerArtwork(portraits: [headshot], logo: hit.logo,
                                    primary: colors?.primary ?? Brand.accent(for: scheme),
                                    secondary: colors?.secondary ?? Brand.surface(for: scheme))
                            } else {
                                ResearchArtwork(urls: hit.logo.map { [$0] } ?? [], fallback: league.symbol)
                                    .frame(width: 46, height: 46)
                            }
                            identity(hit.name, detail: hit.detail)
                            Spacer(minLength: 0)
                            chevron
                        }
                    }
                    if let pitcherPath = hit.pitcherPath, let url = link(pitcherPath) {
                        Button("Pitcher Report", systemImage: "chart.xyaxis.line") { remember(request.query); openURL(url) }
                            .buttonStyle(.bordered)
                    }
                    if let gamePath = hit.gamePath, let url = link(gamePath) {
                        Button("Game Center", systemImage: "baseball.diamond") { remember(request.query); openURL(url) }
                            .buttonStyle(.bordered)
                    }
                }
                .padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
            }
        }
    }

    @ViewBuilder private func members(_ rows: [NativeSearchAPI.Member]) -> some View {
        if !rows.isEmpty {
            heading("Members", symbol: "person.crop.circle")
            ForEach(rows) { member in
                routeButton("/profile/" + member.username) {
                    HStack(spacing: 10) {
                        ResearchArtwork(urls: member.avatarUrl.map { [$0] } ?? [], fallback: "person.crop.circle")
                            .frame(width: 40, height: 40).clipShape(.circle)
                            .overlay { Circle().strokeBorder(Color(hex: member.avatarRingColor) ?? .clear, lineWidth: 1.5) }
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 5) {
                                Text(verbatim: member.displayName ?? member.username).font(.headline)
                                if member.isVerified == true {
                                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Brand.accent(for: scheme))
                                        .accessibilityLabel("Verified")
                                }
                            }
                            Text("@\(member.username)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        if let record = member.record {
                            Text(record.line).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary)
                        }
                        chevron
                    }
                    .padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
                }
            }
        }
    }

    @ViewBuilder private func communities(_ title: String, _ rows: [NativeSearchAPI.Community], symbol: String) -> some View {
        if !rows.isEmpty {
            heading(title, symbol: symbol)
            ForEach(rows) { row in
                routeButton(row.path) {
                    HStack(spacing: 10) {
                        if let artwork = row.avatarUrl {
                            ResearchArtwork(urls: [artwork], fallback: symbol).frame(width: 39, height: 39).clipShape(.rect(cornerRadius: 8))
                        } else {
                            if let emoji = row.emoji, !emoji.isEmpty { Text(verbatim: emoji).frame(width: 39, height: 39).accessibilityHidden(true) }
                            else { Image(systemName: symbol).frame(width: 39, height: 39).accessibilityHidden(true) }
                        }
                        identity(row.name, detail: row.description ?? row.time.flatMap(SidelineBoard.timestamp)?.formatted(date: .abbreviated, time: .shortened))
                        Spacer(minLength: 0)
                        chevron
                    }
                    .padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
                }
            }
        }
    }

    @ViewBuilder private func posts(_ posts: [FeedPost]) -> some View {
        if !posts.isEmpty {
            heading(tab == .picks ? "Picks" : "Posts", symbol: tab == .picks ? "scope" : "text.bubble")
            LazyVStack(spacing: 9) {
                ForEach(posts) { post in
                    FeedPostCard(post: post, operation: { action in Task { await perform(action, on: post) } },
                        discussion: { remember(request.query); selectedPost = post.postID },
                        showAuthor: post.author.flatMap { identity in link("/profile/" + identity.username).map { url in { remember(request.query); openURL(url) } } },
                        actionsAPI: feed, postChanged: { _ in revision += 1 })
                        .padding(12).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
                        .disabled(pendingPosts.contains(post.postID))
                }
            }
        }
    }

    private func heading(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol).font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader)
    }

    private func identity(_ name: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: name).font(.headline)
            if let detail, !detail.isEmpty {
                Text(verbatim: detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
    }

    @ViewBuilder private func routeButton<Label: View>(_ path: String, @ViewBuilder label: () -> Label) -> some View {
        if let url = link(path) {
            Button {
                remember(request.query)
                openURL(url)
            } label: { label().contentShape(.rect) }
            .buttonStyle(SlipSurgePressStyle())
        } else { label() }
    }

    private func link(_ path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"),
              let url = URL(string: "https://" + SlipSurgeHTTP.site + path),
              NativeSiteLink(url) != nil || ResearchDeepLink(url) != nil else { return nil }
        return url
    }

    private var isSaved: Bool {
        saved.contains { $0.resultTab == tab && $0.query.caseInsensitiveCompare(request.query) == .orderedSame }
    }

    private func prepare() async {
        error = nil
        if let recentKey { recent = UserDefaults.standard.stringArray(forKey: recentKey) ?? [] }
        async let nba = api.hasNBA()
        do {
            let data = try await api.saved()
            nbaAvailable = await nba
            mlbAvailable = data.allowMlb
            saved = data.searches
            loaded = true
            if text.isEmpty, !initialQuery.isEmpty { text = initialQuery }
            revision += 1
        } catch let status as SlipSurgeHTTP.Status where status.code == 403 {
            forbidden = true
        } catch {
            if !Task.isCancelled { self.error = "Search unavailable" }
        }
    }

    private func find(_ current: Request) async {
        guard loaded, !current.query.isEmpty else { output = nil; return }
        error = nil
        do {
            try await Task.sleep(for: .milliseconds(300))
            async let social = api.search(current.query, tab: current.tab)
            async let nba = nbaAvailable && (current.tab == .all || current.tab == .nba) ? api.sports(.nba, query: current.query) : []
            async let nfl = current.tab == .all || current.tab == .nfl ? api.sports(.nfl, query: current.query) : []
            async let mlb = mlbAvailable && (current.tab == .all || current.tab == .mlb) ? api.sports(.mlb, query: current.query) : []
            let result = try await social
            let athleteMatches = await nba + nfl + mlb
            guard !Task.isCancelled, request == current else { return }
            output = .init(request: current, social: result, sports: athleteMatches)
        } catch {
            if !Task.isCancelled, request == current { self.error = "Search couldn’t load" }
        }
    }

    private func remember(_ query: String) {
        guard !query.isEmpty else { return }
        updateRecent(Array(([query] + recent.filter { $0.caseInsensitiveCompare(query) != .orderedSame }).prefix(6)))
    }

    private func updateRecent(_ values: [String]) {
        recent = values
        if let recentKey { UserDefaults.standard.set(values, forKey: recentKey) }
    }

    private func save() async {
        let current = request
        guard !changeInProgress, !current.query.isEmpty else { return }
        changeInProgress = true
        defer { changeInProgress = false }
        do {
            try await api.save(current.query, tab: current.tab)
            saved = try await api.saved().searches
            remember(current.query)
            savedNotice = "Search saved."
        } catch { savedNotice = "The save couldn’t be confirmed." }
    }

    private func change(_ id: UUID, removing: Bool) async {
        guard !changeInProgress else { return }
        changeInProgress = true
        defer { changeInProgress = false }
        do {
            if removing { try await api.remove(id) }
            else { try await api.choose(id) }
            saved = try await api.saved().searches
            savedNotice = nil
        } catch { savedNotice = "The change couldn’t be confirmed." }
    }

    private func perform(_ action: FeedAPI.Mutation, on post: FeedPost) async {
        guard pendingPosts.insert(post.postID).inserted else { return }
        defer { pendingPosts.remove(post.postID) }
        do { try await feed.mutate(post.postID, action: action) }
        catch { savedNotice = "The post action couldn’t be confirmed." }
        revision += 1
    }
}
