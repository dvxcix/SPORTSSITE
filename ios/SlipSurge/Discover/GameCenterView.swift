import SwiftUI

struct GameCenterView: View {
    private enum Section: String, CaseIterable {
        case plays = "Plays", room = "Room", box = "Box", picks = "Picks", overview = "Summary"

        var label: String {
            switch self {
            case .plays: "Play-by-play"
            case .room: "Game Room"
            case .box: "Box Score"
            default: rawValue
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
    @Environment(\.nativeEmojiLibrary) private var emojiLibrary
    @State private var section: Section
    @State private var snapshots: [Section: GameCenterData] = [:]
    @State private var lastResult: GameCenterData?
    @State private var requests: [Section: UUID] = [:]
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var visible = false
    @State private var selectedPost: UUID?
    @State private var selectedMember: String?
    @State private var memberPreview: MessagePerson?
    @State private var draft = GameRoomDraft()
    @State private var requestedPlay: String?
    @State private var revealedPlay: String?
    @State private var scrollAnchor: String?
    @State private var roomLastSeen: UUID?
    @State private var nearRoomEnd = true
    @State private var sharing = false
    @State private var queued: (id: UUID, text: String)?
    @State private var lastSent: UUID?
    @State private var busy = false
    @State private var failed = false
    @State private var reacting = Set<String>()
    @State private var reactionStore = GameReactionStore()
    @State private var contextReaction: GameCenterData.Play?
    @State private var timeline = GameTimeline()
    @State private var providerPlays: LivePlayUpdate?
    @State private var liveScore: LiveScorePacket?
    @State private var scoringTimeline = GameTimeline()
    @State private var nearPlayStart = true
    @State private var latestSeenPlay: String?
    @State private var selectedPeriod = ""
    @State private var scoringOnly = false
    @State private var team = ""
    @State private var pitchPlay: GameCenterData.Play?

    init(api: DiscoverAPI, game: Scoreboard.Match, date: String, play: String? = nil) {
        self.api = api
        self.game = game
        self.date = date
        _section = State(initialValue: game.state == "pre" && play == nil ? .overview : .plays)
        _requestedPlay = State(initialValue: play)
    }

    private var reload: String { "\(section.query):\(revision):\(phase):\(visible)" }
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
    private var shownScore: LiveScorePacket? {
        guard section == .plays, lastResult?.state != "post" else { return nil }
        return liveScore
    }
    private var state: String { shownScore?.status.state ?? lastResult?.state ?? game.state }
    private var displayStatus: String? { shownScore?.status.shortDetail ?? lastResult?.status ?? game.status }
    private var live: Bool { state == "in" }
    private var scheduledToStart: Bool {
        state == "pre" && game.startDate.map { $0 <= .now } == true
    }
    private var matchTitle: String { "\(game.away.abbreviation) at \(game.home.abbreviation)" }
    private var gameLink: GameLink { .init(sport: game.sport, id: game.id) }
    private var roomLatest: UUID? { snapshots[.room]?.room?.last?.id }
    private var newestPlay: String? { timeline.entries.first(where: includesPlay)?.id }
    private var cue: GameTimeline.Cue? {
        guard live, section == .plays else { return nil }
        return timeline.currentCue(status: displayStatus)
    }
    private var followsPublicTimeline: Bool {
        visible && phase == .active && section == .plays && (live || scheduledToStart) && LiveScorePacket.paths[game.sport] != nil
    }
    private var wantsRoster: Bool {
        visible && phase == .active && state != "pre" && (section == .plays || section == .overview)
    }
    private var targetPlay: String? {
        guard section == .plays, let requestedPlay,
              snapshots[.plays]?.plays?.contains(where: { $0.id == requestedPlay }) == true else { return nil }
        return requestedPlay
    }

    var body: some View {
        VStack(spacing: 0) {
            scoreboard
            Group {
                if let cue {
                    GameLiveCue(cue: cue, game: game)
                        .id(cue.id)
                        .transition(reduceMotion ? .identity : .opacity.combined(with: .offset(y: -5)))
                }
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: cue?.id)
            SocialSectionBar(title: "Game sections", sections: Section.allCases, selection: $section) {
                Text($0.rawValue).lineLimit(1).minimumScaleFactor(0.8).accessibilityLabel($0.label)
            }
            gameContent
        }
        .navigationTitle(matchTitle)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .socialDetail()
        .toolbar {
            if let url = gameLink.url {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Share game", systemImage: "square.and.arrow.up") {
                        if api.userID != nil {
                            Button("Post to Feed", systemImage: "square.and.pencil") { sharing = true }
                        }
                        ShareLink(item: url, subject: Text(matchTitle))
                    }
                }
            }
        }
        .navigationDestination(item: $selectedPost) { id in FeedThreadView(api: feed, id: id) }
        .navigationDestination(item: $selectedMember) { name in MemberProfileView(api: api, target: name) }
        .task(id: reload) {
            guard phase == .active, visible else { return }
            let requested = section
            await load(requested)
            let interval = requested == .plays ? (LiveScorePacket.paths[game.sport] == nil ? 4 : 8) : requested == .room ? 8 : 24
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(interval)) } catch { return }
                if requested == .room || live || scheduledToStart { await load(requested) }
            }
        }
        .task(id: emojiLibrary?.revision) { await emojiLibrary?.prepareAnimatedReactions() }
        .task(id: (visible && phase == .active && (section == .plays || section == .overview)) ? api.userID : nil) {
            if let userID = api.userID, visible, phase == .active, section == .plays || section == .overview {
                await reactionStore.run(game: game.id, account: api.account, userID: userID)
            }
        }
        .sheet(item: $contextReaction) { play in
            NavigationStack {
                NativeEmojiPicker(title: "React to play") { emoji in
                    let existing = reactionStore.reactions(for: play.id, fallback: play.reactions)
                    Task { await react(emoji, to: play, enabled: existing[emoji]?.mine != true) }
                }
            }
            .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
        .task(id: followsPublicTimeline) {
            if followsPublicTimeline { await followPublicPlays() }
        }
        .task(id: wantsRoster) {
            if wantsRoster, snapshots[.box] == nil { await load(.box) }
        }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .onChange(of: section) { error = nil }
        .alert("Game action couldn’t be confirmed", isPresented: $failed) { Button("OK", role: .cancel) {} }
        .sheet(isPresented: $sharing) {
            if let userID = api.userID, let url = gameLink.url {
                FeedComposerView(account: api.account, userID: userID, allowMLB: game.sport == "mlb",
                    initialText: "\(matchTitle)\n\(url.absoluteString)", preferredSport: game.sport == "soccer" ? "Soccer" : game.sport.uppercased()) {
                    NotificationCenter.default.post(name: .didShareGameToFeed, object: userID)
                }
            }
        }
        .sheet(item: $memberPreview) { member in
            ChatMemberPreview(viewer: api, member: member)
        }
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

    private var gameContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: section == .room ? 3 : 9) {
                    if section == .plays { playStart }
                    if let data = snapshots[section] {
                        details(data)
                    } else if error != nil {
                        ContentUnavailableView {
                            Label("Game details couldn’t load", systemImage: "exclamationmark.circle")
                        } actions: {
                            Button("Retry") { revision += 1 }
                        }
                    } else {
                        ProgressView("Loading \(section.label)").frame(maxWidth: .infinity).padding(.vertical, 22)
                    }
                    if section == .room { roomEnd }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 14).padding(.vertical, 12)
            }
            .scrollPosition(id: $scrollAnchor, anchor: .top)
            .id(section)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(section) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if section == .room {
                    if let userID = api.userID, snapshots[.room] != nil {
                        GameRoomComposer(draft: draft, link: gameLink, account: api.account, userID: userID, sending: busy) {
                            Task { await send() }
                        }
                    } else if api.userID == nil, let account = URL(string: "https://\(SlipSurgeHTTP.site)/account") {
                        Link("Sign in to join the room", destination: account)
                            .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 48).background(.bar)
                    }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if section == .plays, live, let newestPlay, latestSeenPlay != newestPlay, !nearPlayStart {
                    Button("New plays", systemImage: "arrow.up") {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) {
                            proxy.scrollTo("plays-start", anchor: .top)
                        }
                        latestSeenPlay = newestPlay
                    }
                    .font(.caption.bold()).buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
                    .padding(12)
                }
                if section == .room, let roomLatest, roomLastSeen != roomLatest, !nearRoomEnd {
                    Button("New messages", systemImage: "arrow.down") {
                        scrollRoom(proxy, animated: true)
                    }
                    .font(.caption.bold()).buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
                    .padding(.trailing, 13).padding(.bottom, api.userID == nil ? 59 : 65)
                }
            }
            .onChange(of: roomLatest, initial: true) {
                guard section == .room, let roomLatest else { return }
                if roomLastSeen == nil || nearRoomEnd || roomLatest == lastSent {
                    scrollRoom(proxy, animated: roomLastSeen != nil)
                }
            }
            .onChange(of: section) {
                if section == .room, roomLatest != nil { scrollRoom(proxy, animated: false) }
                if section == .plays { latestSeenPlay = newestPlay; nearPlayStart = true }
                scrollAnchor = nil
            }
            .onChange(of: newestPlay, initial: true) {
                if nearPlayStart { latestSeenPlay = newestPlay }
            }
            .onChange(of: targetPlay, initial: true) {
                if let targetPlay, revealedPlay != targetPlay {
                    scrollAnchor = targetPlay
                    proxy.scrollTo(targetPlay, anchor: .top)
                    revealedPlay = targetPlay
                }
            }
        }
    }

    @ViewBuilder private var playStart: some View {
        let anchor = Color.clear.frame(height: 2).id("plays-start").accessibilityHidden(true)
        if #available(iOS 18, *) {
            anchor.onScrollVisibilityChange { visible in
                nearPlayStart = visible
                if visible { latestSeenPlay = newestPlay }
            }
        } else {
            anchor
        }
    }

    @ViewBuilder private var roomEnd: some View {
        let anchor = Color.clear.frame(height: 2).id("room-end").accessibilityHidden(true)
        if #available(iOS 18, *) {
            anchor.onScrollVisibilityChange { visible in
                nearRoomEnd = visible
                if visible { roomLastSeen = roomLatest }
            }
        } else {
            anchor
        }
    }

    private func scrollRoom(_ proxy: ScrollViewProxy, animated: Bool) {
        withAnimation(animated && !reduceMotion ? .snappy(duration: 0.22) : nil) {
            proxy.scrollTo("room-end", anchor: .bottom)
        }
        roomLastSeen = roomLatest
    }

    private var scoreboard: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 9) {
                teamSide(game.away, score: shownScore?.away ?? lastResult?.awayScore ?? game.away.score)
                Spacer(minLength: 0)
                status
                Spacer(minLength: 0)
                teamSide(game.home, score: shownScore?.home ?? lastResult?.homeScore ?? game.home.score, home: true)
            }
            VStack(spacing: 5) {
                status
                HStack {
                    teamSide(game.away, score: shownScore?.away ?? lastResult?.awayScore ?? game.away.score)
                    Spacer()
                    teamSide(game.home, score: shownScore?.home ?? lastResult?.homeScore ?? game.home.score, home: true)
                }
            }
        }
        .padding(.horizontal, 15).padding(.vertical, 11)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(colors: [
                treatment(game.away.color).opacity(0.20), Brand.surface(for: scheme),
                treatment(game.home.secondary ?? game.home.color).opacity(0.20)
            ], startPoint: .leading, endPoint: .trailing)
            .background(Brand.surface(for: scheme))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Scoreboard")
    }

    private var status: some View {
        VStack(spacing: 4) {
            ResearchArtwork(urls: LeagueArtwork.logo(game.sport).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 19)
                .frame(width: 19, height: 19)
            MatchStatusLabel(label: state == "pre" ? game.label : displayStatus ?? game.label, live: live)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func teamSide(_ team: Scoreboard.Match.Team, score: String?, home: Bool = false) -> some View {
        let logo = ResearchArtwork(urls: game.logo(for: team).map { [$0] } ?? [], fallback: "shield", pointSize: 35)
            .frame(width: 35, height: 35)
        return HStack(spacing: 6) {
            if !home { logo }
            VStack(alignment: home ? .trailing : .leading, spacing: 0) {
                if let score {
                    Text(score).font(.title3.weight(.heavy)).monospacedDigit()
                        .contentTransition(reduceMotion ? .identity : .numericText())
                        .animation(reduceMotion ? nil : .snappy(duration: 0.23), value: score)
                }
                Text(team.abbreviation).font(.caption.weight(.bold)).foregroundStyle(.secondary)
                    .accessibilityLabel(team.name)
            }
            if home { logo }
        }
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func details(_ data: GameCenterData) -> some View {
        switch section {
        case .overview:
            if let venue = data.venue ?? game.venue {
                Label(venue, systemImage: "mappin").font(.footnote).foregroundStyle(.secondary)
            }
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
            if !scoringTimeline.entries.isEmpty {
                Text("Scoring plays").font(.headline).accessibilityAddTraits(.isHeader)
                ForEach(scoringTimeline.entries) { playCard($0) }
            }
        case .plays:
            playList
        case .box:
            boxScore(data)
        case .picks:
            let picks = data.picks ?? []
            if picks.isEmpty { ContentUnavailableView("No picks for this matchup", systemImage: "bolt") }
            ForEach(picks) { post in
                FeedPostCard(post: post, discussion: { selectedPost = post.postID },
                    showAuthor: post.author.map { author in { selectedMember = author.username } },
                    actionsAPI: .init(account: api.account, userID: api.userID))
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

    @ViewBuilder private var playList: some View {
        let entries = timeline.entries
        let periods = orderedUnique(entries.reversed().compactMap { $0.play.period })
        if !periods.isEmpty {
            HStack(spacing: 8) {
                ResearchToolFilter(title: periodName, selection: selectedPeriod.isEmpty ? allPeriods : selectedPeriod) {
                    Picker(periodName, selection: $selectedPeriod) {
                        Text(allPeriods).tag("")
                        ForEach(periods, id: \.self) { Text($0).tag($0) }
                    }
                }
                Toggle("Scoring plays", systemImage: "bolt.fill", isOn: $scoringOnly)
                    .toggleStyle(.button).font(.caption.weight(.semibold))
            }
        }
        if let requestedPlay, !entries.contains(where: { $0.id == requestedPlay }) {
            Label("This play is outside the available timeline.", systemImage: "clock")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        let filtered = entries.filter(includesPlay)
        if filtered.isEmpty {
            ContentUnavailableView(entries.isEmpty ? "No play-by-play available" : "No plays match these filters", systemImage: "list.bullet")
        }
        ForEach(GameTimeline.rows(filtered, keeping: requestedPlay)) { row in
            if row.first.context != nil {
                if cue?.id != row.id || requestedPlay == row.id { contextMarker(row).id(row.id) }
            } else {
                playCard(row.first).id(row.id)
            }
        }
    }

    private func includesPlay(_ entry: GameTimeline.Entry) -> Bool {
        (selectedPeriod.isEmpty || entry.play.period == selectedPeriod) && (!scoringOnly || entry.play.scoring)
    }

    private func contextMarker(_ row: GameTimeline.Row) -> some View {
        let entry = row.first
        let team = [game.away, game.home].first { $0.id == entry.play.teamId }
        let title = if entry.context == .timeout, let team { "\(team.name) timeout" }
            else if row.entries.count > 1 { "Lineup change" }
            else { entry.contextTitle }
        return HStack(spacing: 7) {
            if let team, let logo = game.logo(for: team) {
                ResearchArtwork(urls: [logo], fallback: "shield", pointSize: 17).frame(width: 17, height: 17)
            } else if let context = entry.context {
                Image(systemName: context.glyph).font(.caption2).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption.weight(.semibold))
                if entry.context == .substitution, let detail = row.substitutions ?? entry.detail {
                    Text(detail).font(.caption2)
                }
            }
            Spacer(minLength: 6)
            if let clock = entry.play.clock { Text(clock).font(.caption2.monospacedDigit()) }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background {
            if entry.id == revealedPlay { Color.secondary.opacity(0.12).clipShape(.rect(cornerRadius: 8)) }
        }
        .accessibilityElement(children: .combine)
        .contextMenu {
            if let url = GameLink(sport: game.sport, id: game.id, play: entry.id).url {
                ShareLink(item: url, subject: Text(title))
            }
            Button("Discuss in Game Room", systemImage: "bubble.left") { discuss(entry.play) }
            if api.userID != nil {
                Button("React", systemImage: "face.smiling") { contextReaction = entry.play }
            }
        }
    }

    private func discuss(_ play: GameCenterData.Play) {
        draft.play = api.userID == nil ? nil : play
        section = .room
    }

    private func playCard(_ entry: GameTimeline.Entry) -> some View {
        GamePlayCard(entry: entry, game: game, highlighted: entry.id == revealedPlay, canReact: api.userID != nil,
            reactionStore: reactionStore, react: { emoji, enabled in await react(emoji, to: entry.play, enabled: enabled) },
            discuss: { discuss(entry.play) }, showPitches: { pitchPlay = entry.play })
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
                .team(id: $0.abbreviation, title: $0.name, logo: game.logo(for: $0))
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
        if messages.isEmpty {
            ContentUnavailableView("Start the game conversation", systemImage: "bubble.left.and.bubble.right",
                description: Text("Talk about the matchup or bring a play into the room."))
        }
        ForEach(messages) { note in
            let name = note.sender?.displayName ?? note.sender?.username ?? "Member"
            HStack(alignment: .top, spacing: 8) {
                Button {
                    if let sender = note.sender, let username = sender.username {
                        memberPreview = .init(id: note.userId, username: username, displayName: sender.displayName,
                            avatarUrl: sender.avatarUrl, isVerified: sender.isVerified)
                    }
                } label: {
                    NativeMemberAvatar(url: note.sender?.avatarUrl, name: name, size: 31)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("View \(name)’s profile")
                .buttonStyle(SlipSurgePressStyle()).disabled(note.sender?.username == nil)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Text(name).font(.subheadline.weight(.bold))
                        if note.sender?.isVerified == true {
                            Image(systemName: "checkmark.seal.fill").font(.caption)
                                .foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Verified")
                        }
                        if let date = SidelineBoard.timestamp(note.createdAt) {
                            Text(date, style: .relative).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    if let shared = GameLink.extract(from: note.content) {
                        GameRoomMessageBody(content: shared.text)
                        if shared.link.id == game.id, shared.link.sport == game.sport, let play = shared.link.play {
                            Button {
                                selectedPeriod = ""
                                scoringOnly = false
                                revealedPlay = nil
                                requestedPlay = play
                                section = .plays
                            } label: { GameLinkLabel(link: shared.link) }
                            .buttonStyle(SlipSurgePressStyle())
                        } else {
                            Link(destination: shared.url) { GameLinkLabel(link: shared.link) }
                                .buttonStyle(SlipSurgePressStyle())
                        }
                    } else {
                        GameRoomMessageBody(content: note.content)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 6)
        }
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
        let id = UUID()
        requests[requested] = id
        do {
            var query = baseQuery + [.init(name: "section", value: requested.query)]
            if requested == .plays, live || scheduledToStart { query.append(.init(name: "freshness", value: "live")) }
            let result = try await api.readPublic(GameCenterData.self, path: path, query: query)
            guard !Task.isCancelled, requests[requested] == id else { return }
            guard result.id == game.id, result.sport == game.sport else { throw URLError(.cannotParseResponse) }
            snapshots[requested] = result
            if requested == .plays || requested == .box { rebuildTimeline() }
            if requested == .overview || requested == .box {
                scoringTimeline = GameTimeline(plays: snapshots[.overview]?.plays ?? [],
                    groups: snapshots[.box]?.groups ?? [], basketball: game.sport == "nba")
            }
            if requested == section {
                lastResult = result
                error = nil
            }
        } catch {
            if !Task.isCancelled, requests[requested] == id, requested == section { self.error = error }
        }
    }

    private func rebuildTimeline() {
        let confirmed = snapshots[.plays]?.plays ?? []
        let displayed = providerPlays?.merge(with: confirmed) ?? confirmed
        timeline = GameTimeline(plays: displayed, groups: snapshots[.box]?.groups ?? [], basketball: game.sport == "nba")
    }

    private func followPublicPlays() async {
        repeat {
            if let update = try? await LivePlayUpdate.load(sport: game.sport, id: game.id),
               !Task.isCancelled, let score = update.score, score.status.state != "pre" {
                if score != liveScore { liveScore = score }
                if providerPlays?.latestPlayID != update.latestPlayID {
                    providerPlays = update
                    rebuildTimeline()
                }
                if score.status.state == "post" {
                    await load(.plays)
                    return
                }
            }
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
        } while !Task.isCancelled
    }

    private func send() async {
        struct Action: Encodable { let kind = "post"; let id: UUID; let text: String }
        struct Response: Decodable { let ok: Bool }
        let text = draft.message(for: gameLink)
        guard !busy, !text.isEmpty, text.utf16.count <= 800 else { return }
        busy = true
        defer { busy = false }
        let id = queued.flatMap { $0.text == text ? $0.id : nil } ?? UUID()
        queued = (id, text)
        lastSent = id
        do {
            let response = try await api.write(Response.self, path: path, query: baseQuery, body: Action(id: id, text: text))
            guard response.ok else { throw URLError(.cannotParseResponse) }
            if draft.message(for: gameLink) == text {
                draft.text = ""
                draft.play = nil
                draft.attachment = nil
            }
            if queued?.id == id { queued = nil }
            await load(.room)
        } catch { failed = true }
    }

    private func react(_ emoji: String, to play: GameCenterData.Play, enabled: Bool) async {
        guard let userID = api.userID, reacting.insert(play.id).inserted else { return }
        defer { reacting.remove(play.id) }
        do {
            try await GameReactionStore.set(emoji, enabled: enabled, for: play.id, in: game.id,
                                            account: api.account, userID: userID)
            await reactionStore.refresh(game: game.id, account: api.account, userID: userID)
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}
