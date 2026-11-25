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
            return SidelineBoard.timestamp(start)?.formatted(date: .omitted, time: .shortened) ?? "Time TBD"
        }

        var live: Bool { state == "in" }
    }

    let date: String
    let leagues: [League]
}

struct ScoresView: View {
    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var date = Date.now
    @State private var league = ""
    @State private var error: (any Error)?
    @State private var result: Scoreboard?
    @State private var revision = 0

    private var day: String { SlateDate.key(date) }
    private var requested: String { "\(day):\(revision)" }
    private var scoreboard: Scoreboard? { result?.date == day ? result : nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ResearchSlateControls(date: $date)
                if let scoreboard {
                    let leagues = scoreboard.leagues.filter { !$0.games.isEmpty || !$0.available }
                    if leagues.count > 1 {
                        ResearchArtworkPicker(title: "League",
                            options: [.init(id: "", title: "All leagues", icon: "sportscourt")] + leagues.map {
                                .init(id: $0.id, title: LeagueArtwork.label($0.id), url: LeagueArtwork.logo($0.id), icon: "sportscourt")
                            }, selection: $league)
                    }
                    let visible = leagues.filter { league.isEmpty || league == $0.id }
                    if visible.isEmpty {
                        ContentUnavailableView("No games scheduled", systemImage: "calendar",
                            description: Text(SlateDate.label(date, year: true)))
                    }
                    ForEach(visible) { scores in
                        leagueSection(scores)
                    }
                } else {
                    ResearchToolMessage(title: "Scores couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .navigationTitle("Live Scores")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .refreshable { await load(day) }
        .task(id: requested) { await load(day) }
        .task(id: phase) {
            guard phase == .active else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                if day == SlateDate.key(.now) || scoreboard?.leagues.contains(where: { $0.games.contains(where: \.live) }) == true {
                    await load(day)
                }
            }
        }
        .onChange(of: day) { _, _ in league = "" }
    }

    private func leagueSection(_ league: Scoreboard.League) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                ResearchArtwork(urls: LeagueArtwork.logo(league.id).map { [$0] } ?? [], fallback: "sportscourt")
                    .frame(width: 28, height: 28)
                Text(LeagueArtwork.label(league.id)).font(.headline).accessibilityAddTraits(.isHeader)
            }
            if !league.available {
                Text("Scores for this league couldn’t refresh.").font(.caption).foregroundStyle(.secondary)
            }
            LazyVStack(spacing: 9) {
                ForEach(league.games.sorted { $0.live && !$1.live }) { match in
                    NavigationLink {
                        GameCenterView(api: api, game: match, date: day)
                    } label: {
                        scoreCard(match)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                }
            }
        }
    }

    private func scoreCard(_ match: Scoreboard.Match) -> some View {
        ResearchToolCard(color: Color(hex: match.home.color) ?? Brand.accent(for: scheme)) {
            HStack {
                Label(match.label, systemImage: match.live ? "waveform" : "clock")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(match.live ? Brand.signal(-1, for: scheme) : .secondary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
            }
        } content: {
            scoreTeam(match.away)
            Divider()
            scoreTeam(match.home)
        }
    }

    private func scoreTeam(_ team: Scoreboard.Match.Team) -> some View {
        HStack(spacing: 10) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(team.name).font(.subheadline.weight(.semibold)).foregroundStyle(Brand.text(for: scheme))
                if let record = team.record {
                    Text(record).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let score = team.score {
                Text(score).font(.title3.weight(.bold)).monospacedDigit()
                    .foregroundStyle(Brand.text(for: scheme))
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .animation(reduceMotion ? nil : .snappy(duration: 0.24), value: score)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func load(_ requested: String) async {
        do {
            let data: Scoreboard = try await SlipSurgeHTTP.get("/api/mobile/scores", query: [.init(name: "date", value: requested)])
            guard !Task.isCancelled, day == requested else { return }
            guard data.date == requested else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { result = data; error = nil }
        } catch {
            if !Task.isCancelled, day == requested { self.error = error }
        }
    }
}
