import SwiftUI

struct Scoreboard: Decodable {
    struct League: Decodable, Identifiable {
        let id: String
        let available: Bool
        let games: [Match]
    }

    struct Match: Decodable, Identifiable {
        struct Team: Decodable {
            let id: String
            let name: String
            let abbreviation: String
            let logo: URL?
            let color: String?
            let secondary: String?
            let record: String?
            let score: String?
        }

        let id: String
        let sport: String
        let start: String
        let state: String
        let status: String?
        let venue: String?
        let away: Team
        let home: Team
        var scoreObservedAt: ContinuousClock.Instant?
        var delayed = false

        private enum CodingKeys: String, CodingKey {
            case id, sport, start, state, status, venue, away, home
        }

        var label: String {
            if let status { return status }
            return startDate?.formatted(date: .omitted, time: .shortened) ?? "Time TBD"
        }

        var startDate: Date? {
            // The scoreboard also returns UTC times with minute precision.
            let timestamp = start.utf8.count == 17 && start.hasSuffix("Z") ? start.dropLast() + ":00Z" : start
            return SidelineBoard.timestamp(timestamp)
        }

        var live: Bool { state == "in" }

        func logo(for team: Team) -> URL? {
            if let logo = team.logo { return logo }
            if sport == "nba" { return CourtBoard.Team.logo(for: team.abbreviation) }
            if sport == "soccer", team.id.range(of: #"^[0-9]{1,12}$"#, options: .regularExpression) != nil {
                return URL(string: "https://a.espncdn.com/i/teamlogos/soccer/500/\(team.id).png")
            }
            guard ["nfl", "nhl"].contains(sport),
                  team.abbreviation.range(of: #"^[A-Z]{2,4}$"#, options: .regularExpression) != nil else { return nil }
            let nflAliases = ["JAC": "jax", "LA": "lar", "WAS": "wsh"]
            let code = (sport == "nfl" ? nflAliases[team.abbreviation] : nil) ?? team.abbreviation.lowercased()
            return URL(string: "https://a.espncdn.com/i/teamlogos/\(sport)/500/\(code).png")
        }
    }

    let date: String
    let leagues: [League]

    static func load(date: String) async throws -> Self {
        let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/scores",
            query: [.init(name: "date", value: date), .init(name: "freshness", value: "live")], timeout: 10)
        let board = try JSONDecoder().decode(Self.self, from: await SlipSurgeHTTP.send(request))
        guard board.date == date else { throw URLError(.cannotParseResponse) }
        return board
    }
}

struct ScoresView: View {
    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.scenePhase) private var phase
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var date: Date
    @State private var league: String
    @State private var liveBoard = LiveScoreboard()
    @State private var revision = 0

    init(api: DiscoverAPI, date: Date = .now, league: String = "") {
        self.api = api
        _date = State(initialValue: date)
        _league = State(initialValue: league)
    }

    private var day: String { SlateDate.key(date) }
    private var scoreboard: Scoreboard? { liveBoard.board(for: day) }
    private var leagues: [String] { scoreboard?.leagues.map(\.id) ?? [] }
    private var gameColumns: [GridItem] {
        [GridItem(textSize.isAccessibilitySize ? .flexible() : .adaptive(minimum: 275), spacing: 10, alignment: .top)]
    }
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = SlateDate.zone
        return calendar
    }

    var body: some View {
        VStack(spacing: 0) {
            dates
            if !leagues.isEmpty {
                SocialSectionBar(title: "Score leagues", sections: [""] + leagues, selection: $league, fillsWidth: false) { sport in
                    HStack(spacing: 5) {
                        if let logo = LeagueArtwork.logo(sport) {
                            ResearchArtwork(urls: [logo], fallback: "sportscourt", pointSize: 18)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(systemName: "sportscourt")
                        }
                        Text(sport.isEmpty ? "All sports" : LeagueArtwork.label(sport))
                    }
                }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 9) {
                    if let scoreboard {
                        let visible = scoreboard.leagues.filter { (league.isEmpty || $0.id == league) && (!$0.games.isEmpty || !$0.available) }
                        if visible.isEmpty {
                            ContentUnavailableView("No games scheduled", systemImage: "calendar", description: Text(SlateDate.label(date, year: true)))
                        }
                        ForEach(visible.sorted { $0.games.contains(where: \.live) && !$1.games.contains(where: \.live) }) { group in
                            leagueSection(group)
                        }
                    } else {
                        ResearchToolMessage(title: "Scores couldn’t load", error: liveBoard.error) { revision += 1 }
                    }
                }
                .padding(14)
            }
            .refreshable { await liveBoard.refresh(day: day) }
        }
        .frame(maxWidth: 920)
        .frame(maxWidth: .infinity)
        .navigationTitle("Scores")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: "\(day):\(revision):\(phase)") {
            guard phase == .active else { return }
            await liveBoard.follow(through: day)
        }
        .onChange(of: leagues) { _, current in
            if !current.isEmpty, !league.isEmpty, !current.contains(league) { league = "" }
        }
    }

    private var dates: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                DatePicker("Choose a date", selection: $date, displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .environment(\.timeZone, SlateDate.zone)
                    .tint(slipPalette.accent)
                Spacer()
                if !calendar.isDateInToday(date) {
                    Button("Today") { date = .now }.buttonStyle(.plain)
                        .font(.footnote.weight(.bold)).foregroundStyle(slipPalette.accent)
                        .padding(.horizontal, 9).frame(minHeight: 44)
                }
            }
            HStack(spacing: 6) {
                ForEach(-2...2, id: \.self) { offset in
                    if let target = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: date)) {
                        dateChip(target, selected: offset == 0)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .background(slipPalette.surface)
        .sensoryFeedback(.selection, trigger: day)
    }

    private func dateChip(_ target: Date, selected: Bool) -> some View {
        var weekday = Date.FormatStyle().weekday(.abbreviated)
        weekday.timeZone = SlateDate.zone
        return Button {
            date = target
        } label: {
            VStack(spacing: 2) {
                Text(target.formatted(weekday)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Text(calendar.component(.day, from: target), format: .number).font(.subheadline.weight(.bold)).monospacedDigit()
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: 46)
            .foregroundStyle(selected ? slipPalette.accent : slipPalette.text)
            .background(selected ? slipPalette.accent.opacity(0.15) : Color.secondary.opacity(0.075), in: .rect(cornerRadius: 12))
            .contentShape(.rect)
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(SlateDate.label(target))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private func leagueSection(_ league: Scoreboard.League) -> some View {
        if self.league.isEmpty {
            HStack(spacing: 7) {
                ResearchArtwork(urls: LeagueArtwork.logo(league.id).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 21)
                    .frame(width: 21, height: 21)
                Text(LeagueArtwork.label(league.id)).font(.headline).accessibilityAddTraits(.isHeader)
            }
            .padding(.top, 5)
        }
        if !league.available {
            Text("Scores for this league couldn’t refresh.").font(.footnote).foregroundStyle(.secondary)
        }
        LazyVGrid(columns: gameColumns, spacing: 10) {
            ForEach(league.games.sorted { $0.live && !$1.live }) { match in
                NavigationLink {
                    GameCenterView(api: api, game: match, date: day)
                } label: {
                    MatchScoreTile(match: match)
                }
                .buttonStyle(SlipSurgePressStyle())
            }
        }
    }

}

struct LiveGamesStrip: View {
    let api: DiscoverAPI
    let active: Bool
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.scenePhase) private var phase
    @State private var liveBoard = LiveScoreboard()

    var body: some View {
        let today = SlateDate.key(.now)
        let board = liveBoard.board(for: today)
        let games = board?.leagues.flatMap(\.games) ?? []
        let live = games.filter(\.live)
        let upcoming = games.filter { $0.state == "pre" }.sorted { $0.start < $1.start }
        let completed = games.filter { $0.state == "post" }.reversed()
        let slate = live + upcoming + completed
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    if !slate.isEmpty {
                        Label(live.isEmpty ? "Games today" : "Live now", systemImage: live.isEmpty ? "list.number" : "dot.radiowaves.left.and.right")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(slipPalette.text)
                            .accessibilityAddTraits(.isHeader)
                        Spacer()
                    }
                    NavigationLink {
                        ScoresView(api: api)
                    } label: {
                        HStack(spacing: 5) {
                            if slate.isEmpty {
                                Image(systemName: "list.number").accessibilityHidden(true)
                                Text("Scores").font(.subheadline.weight(.semibold))
                                Spacer()
                            } else {
                                Text("All scores").font(.footnote.weight(.semibold))
                            }
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
                        }
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(slipPalette.accent)
                }
                .padding(.horizontal, 14)
                if let board, !slate.isEmpty {
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 8) {
                            ForEach(slate, id: \.scoreIdentity) { match in
                                NavigationLink {
                                    GameCenterView(api: api, game: match, date: board.date)
                                } label: {
                                    MatchScoreTile(match: match, compact: true)
                                        .containerRelativeFrame(.horizontal) { available, _ in
                                            min(224, (available - 10) * 4 / 9)
                                        }
                                }
                                .buttonStyle(SlipSurgePressStyle())
                            }
                        }
                        .padding(.horizontal, 14)
                    }
                    .scrollIndicators(.hidden)
                    .padding(.bottom, 10)
                }
            }
            Divider()
        }
        .task(id: active && phase == .active) {
            guard active, phase == .active else { return }
            await liveBoard.follow(through: SlateDate.key(.now), todayOnly: true)
        }
    }
}

private extension Scoreboard.Match {
    var scoreIdentity: String { "\(sport):\(id)" }
}

private struct MatchScoreTile: View {
    let match: Scoreboard.Match
    var compact = false
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 4 : 6) {
            HStack(spacing: 5) {
                if compact {
                    ResearchArtwork(urls: LeagueArtwork.logo(match.sport).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 15)
                        .frame(width: 15, height: 15)
                }
                MatchStatusLabel(label: match.delayed ? "Score delayed" : match.label, live: match.live && !match.delayed)
                Spacer(minLength: 2)
                Image(systemName: "chevron.right").font(.caption2.bold()).foregroundStyle(.secondary).accessibilityHidden(true)
            }
            team(match.away)
            team(match.home)
        }
        .padding(compact ? 9 : 11)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(slipPalette.surface)
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(LinearGradient(colors: [
                            (Color(hex: match.away.color) ?? .clear).opacity(0.14),
                            (Color(hex: match.home.secondary ?? match.home.color) ?? .clear).opacity(0.09)
                        ], startPoint: .topLeading, endPoint: .bottomTrailing))
                }
        }
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(.secondary.opacity(0.16)) }
        .accessibilityElement(children: .combine)
    }

    private func team(_ team: Scoreboard.Match.Team) -> some View {
        let size: CGFloat = compact ? 22 : 25
        return HStack(spacing: 7) {
            ResearchArtwork(urls: match.logo(for: team).map { [$0] } ?? [], fallback: "shield", pointSize: 25)
                .frame(width: size, height: size)
            Text(compact ? team.abbreviation : team.name)
                .font(.subheadline.weight(.semibold)).lineLimit(compact ? 1 : 2)
                .accessibilityLabel(team.name)
            Spacer(minLength: 3)
            if let score = team.score {
                Text(score).font(.subheadline.weight(.heavy)).monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .animation(reduceMotion ? nil : .snappy(duration: 0.23), value: score)
            } else if !compact, let record = team.record {
                Text(record).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(slipPalette.text)
    }
}

struct MatchStatusLabel: View {
    let label: String
    let live: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 5) {
            if live {
                Circle().fill(Brand.signal(-1, for: scheme)).frame(width: 6, height: 6)
                    .accessibilityHidden(true)
            }
            Text(label).lineLimit(1)
        }
        .font(.caption.weight(.bold)).monospacedDigit()
        .foregroundStyle(live ? Brand.signal(-1, for: scheme) : .secondary)
        .accessibilityLabel(live ? "Live, \(label)" : label)
    }
}

struct GameLinkLabel: View {
    let link: GameLink
    @Environment(\.slipPalette) private var slipPalette

    var body: some View {
        HStack(spacing: 9) {
            ResearchArtwork(urls: LeagueArtwork.logo(link.sport).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 22)
                .frame(width: 22, height: 22)
            Text(link.play == nil ? "Open game" : "View play").font(.subheadline.weight(.semibold))
            Spacer(minLength: 6)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
        }
        .padding(.horizontal, 10).frame(minHeight: 44)
        .foregroundStyle(slipPalette.accent)
        .background(slipPalette.accent.opacity(0.09), in: .rect(cornerRadius: 10))
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
