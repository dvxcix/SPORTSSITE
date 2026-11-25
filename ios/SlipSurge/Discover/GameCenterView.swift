import SwiftUI

struct GameCenterView: View {
    private enum Section: String, CaseIterable {
        case overview = "Summary", room = "Game Room", plays = "Play-by-play", box = "Box Score", picks = "Picks"

        var glyph: String {
            switch self {
            case .overview: "sportscourt"
            case .room: "bubble.left.and.bubble.right"
            case .plays: "list.bullet"
            case .box: "tablecells"
            case .picks: "bolt"
            }
        }

        var query: String {
            switch self {
            case .overview: "overview"
            case .room: "room"
            case .plays: "plays"
            case .box: "box"
            case .picks: "picks"
            }
        }
    }

    let api: DiscoverAPI
    let game: Scoreboard.Match
    let date: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var section = Section.overview
    @State private var data: GameCenterData?
    @State private var loaded: Section?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var selectedPost: UUID?
    @State private var selectedMember: String?
    @State private var message = ""
    @State private var queued: (id: UUID, text: String)?
    @State private var lastSent: UUID?
    @State private var busy = false
    @State private var failed = false
    @State private var selectedPeriod = ""
    @State private var team = ""
    @State private var pitchPlay: GameCenterData.Play?

    private var reload: String { "\(section.query):\(revision)" }
    private var path: String { "/api/mobile/scores/game" }
    private var periodName: String {
        switch game.sport {
        case "mlb": "Inning"
        case "nfl", "nba": "Quarter"
        case "soccer": "Half"
        default: "Period"
        }
    }
    private var allPeriods: String { game.sport == "soccer" ? "All halves" : "All \(periodName.lowercased())s" }
    private var baseQuery: [URLQueryItem] { [.init(name: "sport", value: game.sport), .init(name: "game", value: game.id), .init(name: "date", value: date)] }
    private var feed: FeedAPI { FeedAPI(account: api.account, userID: api.userID) }
    private var color: Color { treatment(game.home.color) }
    private var live: Bool { (data?.state ?? game.state) == "in" }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    scoreboard
                    ResearchToolRail(title: "Game details", choices: Section.allCases, selection: $section, label: \.rawValue, glyph: \.glyph)
                    if let data, loaded == section { details(data) }
                    else { ResearchToolMessage(title: "Game details couldn’t load", error: error) { revision += 1 } }
                    Color.clear.frame(height: 1).id("room-end")
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) {
                if section == .room, api.userID != nil, loaded == .room { roomComposer }
            }
            .onChange(of: data?.room?.last?.id) { _, last in
                if section == .room, let last, last == lastSent {
                    withAnimation(reduceMotion ? nil : .snappy(duration: 0.23)) { proxy.scrollTo("room-end", anchor: .bottom) }
                }
            }
        }
        .navigationTitle("\(game.away.abbreviation) at \(game.home.abbreviation)")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationDestination(item: $selectedPost) { id in FeedThreadView(api: feed, id: id) }
        .navigationDestination(item: $selectedMember) { name in MemberProfileView(api: api, target: name) }
        .task(id: reload) {
            await load(section)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(section == .room ? 8 : 24)) } catch { return }
                if phase == .active, section == .room || live { await load(section) }
            }
        }
        .refreshable { await load(section) }
        .onChange(of: section) { _, _ in error = nil }
        .alert("Game action couldn’t be confirmed", isPresented: $failed) { Button("OK", role: .cancel) {} }
        .sheet(item: $pitchPlay) { play in
            NavigationStack {
                MlbPitchDetailsView(pitches: play.pitches ?? [], title: play.title ?? "Pitch details")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close", systemImage: "xmark") { pitchPlay = nil }.labelStyle(.iconOnly)
                        }
                    }
            }
        }
    }

    private var scoreboard: some View {
        ResearchToolCard(color: color) {
            HStack {
                ResearchArtwork(urls: LeagueArtwork.logo(game.sport).map { [$0] } ?? [], fallback: "sportscourt")
                    .frame(width: 23, height: 23)
                    .accessibilityLabel(LeagueArtwork.label(game.sport))
                Spacer()
                Text(data?.state == "pre" ? game.label : data?.status ?? game.label)
                    .font(.caption.weight(.semibold)).foregroundStyle(live ? Brand.signal(-1, for: scheme) : .secondary)
            }
        } content: {
            HStack(alignment: .top, spacing: 13) {
                teamSide(game.away, score: data?.awayScore ?? game.away.score)
                Text("at").font(.caption).foregroundStyle(.secondary).padding(.top, 23)
                teamSide(game.home, score: data?.homeScore ?? game.home.score)
            }
            if let venue = data?.venue ?? game.venue { Label(venue, systemImage: "mappin").font(.footnote).foregroundStyle(.secondary) }
        }
    }

    private func teamSide(_ team: Scoreboard.Match.Team, score: String?) -> some View {
        VStack(spacing: 4) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 46, height: 46)
            Text(team.abbreviation).font(.subheadline.weight(.bold))
            if let record = team.record { Text(record).font(.caption2).foregroundStyle(.secondary) }
            if let score {
                Text(score).font(.title2.weight(.heavy)).monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .animation(reduceMotion ? nil : .snappy(duration: 0.23), value: score)
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func details(_ data: GameCenterData) -> some View {
        switch section {
        case .overview:
            if let networks = data.broadcasts, !networks.isEmpty {
                Label(Array(Set(networks)).sorted().joined(separator: " · "), systemImage: "tv").font(.subheadline)
            }
            if let quarters = data.quarters, !quarters.isEmpty { periodScores(quarters) }
            ForEach(Array((data.leaders ?? []).enumerated()), id: \.offset) { _, leader in
                ResearchToolCard(color: color) {
                    HStack {
                        ResearchArtwork(urls: leader.headshot.map { [$0] } ?? [], fallback: "person.fill").frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(leader.name).font(.subheadline.bold())
                            Text("\(leader.team) · \(leader.label)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(leader.value).font(.subheadline.monospacedDigit())
                    }
                } content: { EmptyView() }
            }
            if let scoring = data.plays, !scoring.isEmpty {
                Text("Scoring plays").font(.headline).accessibilityAddTraits(.isHeader)
                ForEach(scoring) { play($0) }
            }
        case .plays:
            playList(data.plays ?? [])
        case .box:
            boxScore(data)
        case .picks:
            let picks = data.picks ?? []
            if picks.isEmpty { ContentUnavailableView("No picks for this matchup", systemImage: "bolt") }
            ForEach(picks) { post in
                FeedPostCard(post: post, discussion: { selectedPost = post.postID },
                    showAuthor: post.author.map { author in { selectedMember = author.username } })
                    .padding(11).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
            }
        case .room:
            room(data.room ?? [])
        }
    }

    private func periodScores(_ rows: [GameCenterData.Periods]) -> some View {
        ResearchToolCard(color: color) { Text("Score by period").font(.headline) } content: {
            ForEach(rows) { row in
                HStack(spacing: 8) {
                    ResearchArtwork(urls: row.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 22, height: 22)
                    Text(row.team).font(.subheadline.weight(.bold)).frame(minWidth: 38, alignment: .leading)
                    ForEach(Array(row.periods.enumerated()), id: \.offset) { index, score in
                        Text(score.map(String.init) ?? "—").font(.caption.monospacedDigit()).frame(maxWidth: .infinity)
                            .accessibilityLabel("\(periodName) \(index + 1), \(score.map(String.init) ?? "unavailable")")
                    }
                    Text(row.total).font(.subheadline.weight(.bold)).monospacedDigit()
                }
            }
        }
    }

    @ViewBuilder
    private func playList(_ plays: [GameCenterData.Play]) -> some View {
        let periods = orderedUnique(plays.compactMap(\.period))
        if !periods.isEmpty {
            ResearchToolFilter(title: periodName, selection: selectedPeriod.isEmpty ? allPeriods : selectedPeriod) {
                Picker(periodName, selection: $selectedPeriod) {
                    Text(allPeriods).tag("")
                    ForEach(periods, id: \.self) { Text($0).tag($0) }
                }
            }
        }
        if plays.isEmpty { ContentUnavailableView("No play-by-play available", systemImage: "list.bullet") }
        ForEach(plays.filter { selectedPeriod.isEmpty || $0.period == selectedPeriod }) { play($0) }
    }

    private func play(_ play: GameCenterData.Play) -> some View {
        let visuals = [game.away, game.home].first { $0.id == play.teamId }
        return ResearchToolCard(color: treatment(visuals?.color)) {
            HStack(spacing: 8) {
                if let logo = visuals?.logo { ResearchArtwork(urls: [logo], fallback: "shield").frame(width: 25, height: 25) }
                Text(play.title ?? "Play").font(.subheadline.weight(.bold))
                Spacer()
                Text([play.period, play.clock].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            }
        } content: {
            Text(verbatim: play.text).font(.subheadline)
            if play.scoring, let away = play.away, let home = play.home {
                Text("\(game.away.abbreviation) \(away) – \(home) \(game.home.abbreviation)").font(.caption.bold()).monospacedDigit()
            }
            HStack(spacing: 8) {
                ForEach(play.athletes) { athlete in
                    ResearchArtwork(urls: athlete.headshot.map { [$0] } ?? [], fallback: "person.fill")
                        .frame(width: 32, height: 32).accessibilityLabel(athlete.name)
                }
                Spacer()
                if api.userID != nil {
                    Menu("React", systemImage: "face.smiling") {
                        ForEach(["❤️","🔥","⚡","👏","😂","👀","🏆","👍"], id: \.self) { symbol in
                            Button(symbol) { Task { await react(symbol, to: play) } }
                        }
                    }.labelStyle(.iconOnly)
                }
            }
            if !play.reactions.isEmpty {
                Text(play.reactions.keys.sorted().prefix(8).map { "\($0) \(play.reactions[$0]?.count ?? 0)" }.joined(separator: "  "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if play.pitches?.isEmpty == false {
                Button("Pitch details", systemImage: "scope") { pitchPlay = play }.buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder
    private func boxScore(_ data: GameCenterData) -> some View {
        if let stats = data.teamStats, !stats.isEmpty {
            let entries: [GameCenterData.TeamStats.Value] = stats.flatMap { $0.stats ?? [] }
            let keys = orderedUnique(entries.map(\.name))
            ResearchToolCard(color: color) { Text("Team stats").font(.headline) } content: {
                ForEach(keys, id: \.self) { key in
                    HStack {
                        ForEach(stats.prefix(2)) { row in
                            if let stat = row.stats?.first(where: { $0.name == key }) {
                                Text("\(row.team) \(stat.displayValue)").font(.caption.monospacedDigit()).frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        Text(stats.first?.stats?.first(where: { $0.name == key })?.label ?? key).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        let groups = data.groups ?? []
        if !groups.isEmpty {
            ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "sportscourt")] + [game.away, game.home].map {
                .team(id: $0.abbreviation, title: $0.name, logo: $0.logo)
            }, selection: $team)
        }
        ForEach(groups.filter { team.isEmpty || team == $0.team }) { group in
            ResearchToolCard(color: color) { Text([group.team, group.category].compactMap { $0 }.joined(separator: " · ")).font(.headline) } content: {
                ForEach(group.players) { player in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            ResearchArtwork(urls: player.headshot.map { [$0] } ?? [], fallback: "person.fill").frame(width: 27, height: 27)
                            Text(player.name).font(.subheadline.weight(.semibold))
                            if let position = player.position { Text(position).font(.caption).foregroundStyle(.secondary) }
                        }
                        if !player.values.isEmpty {
                            ScrollView(.horizontal) {
                                HStack(spacing: 12) {
                                    ForEach(Array(zip(group.labels, player.values).enumerated()), id: \.offset) { _, value in
                                        Text("\(value.0) \(value.1)").font(.caption.monospacedDigit())
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if groups.isEmpty, data.teamStats?.isEmpty != false { ContentUnavailableView("Box score unavailable", systemImage: "tablecells") }
    }

    @ViewBuilder
    private func room(_ messages: [GameCenterData.Message]) -> some View {
        if messages.isEmpty { ContentUnavailableView("No room messages yet", systemImage: "bubble.left.and.bubble.right") }
        ForEach(messages) { note in
            HStack(alignment: .top, spacing: 9) {
                Button {
                    if let username = note.sender?.username { selectedMember = username }
                } label: {
                    ResearchArtwork(urls: [note.sender?.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                        .frame(width: 34, height: 34).clipShape(.circle)
                }
                .buttonStyle(.plain).disabled(note.sender?.username == nil)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(note.sender?.displayName ?? note.sender?.username ?? "Member").font(.caption.weight(.bold))
                        if let date = SidelineBoard.timestamp(note.createdAt) { Text(date, style: .relative).font(.caption2).foregroundStyle(.secondary) }
                    }
                    Text(verbatim: note.content).font(.subheadline)
                }
                Spacer(minLength: 4)
            }
            .padding(10).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
        }
    }

    private var roomComposer: some View {
        HStack {
            TextField("Message Game Room", text: $message, axis: .vertical).lineLimit(1...3)
                .padding(9).background(Brand.surface(for: scheme), in: .rect(cornerRadius: 11))
            Button("Send", systemImage: "arrow.up.circle.fill") { Task { await send() } }.labelStyle(.iconOnly)
                .font(.title2).foregroundStyle(Brand.accent(for: scheme))
                .disabled(busy || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || message.utf16.count > 800)
        }
        .padding(9).background(.bar)
    }

    private func treatment(_ hex: String?) -> Color {
        guard let hex else { return Brand.accent(for: scheme) }
        return Color(hex: hex.hasPrefix("#") ? hex : "#\(hex)") ?? Brand.accent(for: scheme)
    }

    private func orderedUnique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0).inserted }
    }

    private func load(_ requested: Section) async {
        do {
            let result = try await api.readPublic(GameCenterData.self, path: path, query: baseQuery + [.init(name: "section", value: requested.query)])
            guard !Task.isCancelled, requested == section, result.id == game.id, result.sport == game.sport else { return }
            data = result
            loaded = requested
            error = nil
        } catch {
            if !Task.isCancelled, requested == section { self.error = error }
        }
    }

    private func send() async {
        struct Action: Encodable { let kind = "post"; let id: UUID; let text: String }
        struct Response: Decodable { let ok: Bool }
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let draft = message
        let id = queued?.text == draft ? queued?.id ?? UUID() : UUID()
        queued = (id, draft)
        lastSent = id
        do {
            let response = try await api.write(Response.self, path: path, query: baseQuery, body: Action(id: id, text: draft))
            guard response.ok else { throw URLError(.cannotParseResponse) }
            if message == draft { message = "" }
            await load(section)
            if queued?.id == id { queued = nil }
        } catch { failed = true }
    }

    private func react(_ emoji: String, to play: GameCenterData.Play) async {
        struct Action: Encodable { let kind = "react"; let play: String; let emoji: String; let enabled: Bool }
        struct Response: Decodable { let ok: Bool }
        do {
            let action = Action(play: play.id, emoji: emoji, enabled: play.reactions[emoji]?.mine != true)
            let result = try await api.write(Response.self, path: path, query: baseQuery, body: action)
            guard result.ok else { throw URLError(.cannotParseResponse) }
            await load(section)
        } catch { failed = true }
    }
}
