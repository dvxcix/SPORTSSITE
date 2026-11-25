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
            query: [.init(name: "date", value: date)])
        let board = try JSONDecoder().decode(Self.self, from: await SlipSurgeHTTP.send(request))
        guard board.date == date else { throw URLError(.cannotParseResponse) }
        return board
    }
}

struct ScoresView: View {
    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @State private var date: Date
    @State private var league: String
    @State private var error: (any Error)?
    @State private var board: Scoreboard?
    @State private var revision = 0

    init(api: DiscoverAPI, date: Date = .now, league: String = "") {
        self.api = api
        _date = State(initialValue: date)
        _league = State(initialValue: league)
    }

    private var day: String { SlateDate.key(date) }
    private var scoreboard: Scoreboard? { board?.date == day ? board : nil }
    private var leagues: [String] { scoreboard?.leagues.map(\.id) ?? [] }
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
                        ResearchToolMessage(title: "Scores couldn’t load", error: error) { revision += 1 }
                    }
                }
                .padding(14)
            }
            .refreshable { await load(day) }
        }
        .navigationTitle("Live Games")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: "\(day):\(revision):\(phase)") {
            guard phase == .active else { return }
            let requested = day
            await load(requested)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                if requested == SlateDate.key(.now) || scoreboard?.leagues.contains(where: { $0.games.contains(where: \.live) }) == true {
                    await load(requested)
                }
            }
        }
        .onChange(of: day) { error = nil }
    }

    private var dates: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                DatePicker("Choose a date", selection: $date, displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .environment(\.timeZone, SlateDate.zone)
                    .tint(Brand.accent(for: scheme))
                Spacer()
                if !calendar.isDateInToday(date) {
                    Button("Today") { date = .now }.buttonStyle(.plain)
                        .font(.footnote.weight(.bold)).foregroundStyle(Brand.accent(for: scheme))
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
        .background(Brand.surface(for: scheme))
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
            .foregroundStyle(selected ? Brand.accent(for: scheme) : Brand.text(for: scheme))
            .background(selected ? Brand.accent(for: scheme).opacity(0.15) : Color.secondary.opacity(0.075), in: .rect(cornerRadius: 12))
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
        ForEach(league.games.sorted { $0.live && !$1.live }) { match in
            NavigationLink {
                GameCenterView(api: api, game: match, date: day)
            } label: {
                MatchScoreTile(match: match)
            }
            .buttonStyle(SlipSurgePressStyle())
        }
    }

    private func load(_ requested: String) async {
        do {
            let result = try await Scoreboard.load(date: requested)
            guard !Task.isCancelled, day == requested else { return }
            board = result
            error = nil
            if !league.isEmpty, !result.leagues.contains(where: { $0.id == league }) { league = "" }
        } catch {
            if !Task.isCancelled, day == requested { self.error = error }
        }
    }
}

struct LiveGamesStrip: View {
    let api: DiscoverAPI
    let active: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @State private var board: Scoreboard?

    var body: some View {
        let games = board?.leagues.flatMap(\.games).filter(\.live) ?? []
        VStack(spacing: 0) {
            if let board, !games.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Label("Live now", systemImage: "dot.radiowaves.left.and.right")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Brand.text(for: scheme))
                            .accessibilityAddTraits(.isHeader)
                        Spacer()
                        NavigationLink {
                            ScoresView(api: api)
                        } label: {
                            Label("All scores", systemImage: "chevron.right").font(.footnote.weight(.semibold))
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Brand.accent(for: scheme))
                    }
                    .padding(.horizontal, 14)
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 8) {
                            ForEach(games, id: \.scoreIdentity) { match in
                                NavigationLink {
                                    GameCenterView(api: api, game: match, date: board.date)
                                } label: {
                                    MatchScoreTile(match: match, compact: true)
                                        .containerRelativeFrame(.horizontal, count: 9, span: 4, spacing: 8)
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
            repeat {
                let day = SlateDate.key(.now)
                if board?.date != day { board = nil }
                if let result = try? await Scoreboard.load(date: day), !Task.isCancelled { board = result }
                let hasLiveGames = board?.leagues.contains { $0.games.contains(where: \.live) } == true
                do { try await Task.sleep(for: .seconds(hasLiveGames ? 30 : 60)) } catch { return }
            } while !Task.isCancelled
        }
    }
}

private extension Scoreboard.Match {
    var scoreIdentity: String { "\(sport):\(id)" }
}

private struct MatchScoreTile: View {
    let match: Scoreboard.Match
    var compact = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 4 : 6) {
            HStack(spacing: 5) {
                if compact {
                    ResearchArtwork(urls: LeagueArtwork.logo(match.sport).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 15)
                        .frame(width: 15, height: 15)
                }
                MatchStatusLabel(label: match.label, live: match.live)
                Spacer(minLength: 2)
                Image(systemName: "chevron.right").font(.caption2.bold()).foregroundStyle(.secondary).accessibilityHidden(true)
            }
            team(match.away)
            team(match.home)
        }
        .padding(compact ? 9 : 11)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Brand.surface(for: scheme))
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
        .foregroundStyle(Brand.text(for: scheme))
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
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 9) {
            ResearchArtwork(urls: LeagueArtwork.logo(link.sport).map { [$0] } ?? [], fallback: "sportscourt", pointSize: 22)
                .frame(width: 22, height: 22)
            Text(link.play == nil ? "Open game" : "View play").font(.subheadline.weight(.semibold))
            Spacer(minLength: 6)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
        }
        .padding(.horizontal, 10).frame(minHeight: 44)
        .foregroundStyle(Brand.accent(for: scheme))
        .background(Brand.accent(for: scheme).opacity(0.09), in: .rect(cornerRadius: 10))
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
