import SwiftUI

private struct DugoutSynergySlate: Decodable {
    struct Game: Decodable, Identifiable {
        let id: String
        let startsAt: String?
        let status: String
        let away: DugoutBoard.Team
        let home: DugoutBoard.Team

        var subtitle: String {
            if let awayScore = away.score, let homeScore = home.score { return "\(awayScore)–\(homeScore) · \(status)" }
            guard let startsAt, let start = ISO8601DateFormatter().date(from: startsAt) else { return status }
            var style = Date.FormatStyle().hour().minute()
            style.timeZone = SlateDate.zone
            return start.formatted(style) + " ET"
        }
    }

    struct Player: Decodable {
        let id: Int
        let name: String
        let hand: String?
        let headshot: URL?
        let team: DugoutBoard.Team?
    }

    struct Evidence: Decodable {
        let date: String
        let opponent: Player
        let pitch: String?
        let pitchColor: String?
        let match: Double
        let velocity: Double?
        let spin: Double?
        let exitVelocity: Double?
        let angle: Double?
        let distance: Double?
        let xwoba: Double?
        let runValue: Double?
    }

    struct Matchup: Decodable, Identifiable {
        let id: String
        let game: String
        let confirmed: Bool
        let batter: Player
        let pitcher: Player
        let batterScore: Int
        let pitcherScore: Int
        let evidenceAgainstPitchers: [Evidence]
        let evidenceAgainstHitters: [Evidence]
    }

    let date: String
    let mode: DugoutMode
    let paused: Bool
    let games: [Game]
    let matchups: [Matchup]
}

struct DugoutSynergy: View {
    enum Ranking: String, CaseIterable {
        case best, batter, pitcher

        var title: String {
            switch self {
            case .best: "Best of either"
            case .batter: "Batter score"
            case .pitcher: "Pitcher score"
            }
        }
    }

    let api: DugoutAPI
    @State var game = ""
    @State var ranking = Ranking.best
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var mode = DugoutMode.pregame
    @State private var response: DugoutSynergySlate?
    @State private var failure: (any Error)?
    @State private var revision = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let response, response.mode == mode {
                    if response.paused {
                        ContentUnavailableView("Synergy is paused for the offseason", systemImage: "baseball")
                    } else if mode == .pregame {
                        ContentUnavailableView {
                            Label("Synergy uses today’s live slate", systemImage: "sparkles")
                        } actions: {
                            Button("Open Live", systemImage: "dot.radiowaves.left.and.right") { mode = .live }
                                .buttonStyle(SlipSurgePrimaryButtonStyle())
                        }
                    } else if response.matchups.isEmpty {
                        ContentUnavailableView("No Synergy matchups today", systemImage: "baseball")
                    } else {
                        board(response)
                    }
                } else {
                    ResearchToolMessage(title: "Synergy couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Synergy")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let shareURL, mode == .live {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: shareURL) { Label("Share Synergy", systemImage: "square.and.arrow.up").labelStyle(.iconOnly) }
                }
            }
        }
        .task(id: "\(mode.rawValue):\(revision)") { await load(mode) }
        .refreshable { revision += 1 }
    }

    private func board(_ slate: DugoutSynergySlate) -> some View {
        let byID = Dictionary(slate.games.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let visible = slate.matchups.filter { game.isEmpty || $0.game == game }.sorted { left, right in
            let lhs = score(left), rhs = score(right)
            return lhs == rhs ? left.id < right.id : lhs > rhs
        }
        return VStack(alignment: .leading, spacing: 12) {
            ResearchArtworkPicker(title: "Game", options: [.init(id: "", title: "All matchups", icon: "baseball")]
                + slate.games.map { game in
                    .init(id: game.id, title: "\(game.away.code) at \(game.home.code) · \(game.subtitle)",
                        url: game.away.logo, secondaryLogo: game.home.logo, icon: "baseball")
                }, selection: $game)
            Picker("Sort matchups", selection: $ranking) {
                ForEach(Ranking.allCases, id: \.self) { Text($0.title).tag($0) }
            }.pickerStyle(.segmented)
            if visible.isEmpty {
                ContentUnavailableView("No matchups for this game", systemImage: "baseball")
            }
            LazyVStack(alignment: .leading, spacing: 11) {
                ForEach(visible) { pair in matchup(pair, game: byID[pair.game]) }
            }
        }
    }

    private func matchup(_ pair: DugoutSynergySlate.Matchup, game: DugoutSynergySlate.Game?) -> some View {
        ResearchToolCard(color: pair.batter.team?.color ?? .green) {
            if let game { ResearchMatchup(away: game.away.matchup, home: game.home.matchup, subtitle: game.subtitle, selected: false) }
        } content: {
            if !pair.confirmed { Label("Projected lineup", systemImage: "clock").font(.caption).foregroundStyle(.secondary) }
            playerScore(pair.batter, score: pair.batterScore, label: "Home runs vs. similar pitchers", rows: pair.evidenceAgainstPitchers)
            Divider()
            playerScore(pair.pitcher, score: pair.pitcherScore, label: "Home runs allowed to similar batters", rows: pair.evidenceAgainstHitters)
        }
    }

    private func playerScore(_ player: DugoutSynergySlate.Player, score: Int, label: String, rows: [DugoutSynergySlate.Evidence]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                portrait(player, subtitle: player.hand.map { "Hand \($0)" })
                Spacer()
                Text("\(score)/10").font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(tone(score)).padding(.horizontal, 8).padding(.vertical, 4)
                    .background(tone(score).opacity(0.15), in: .capsule)
                    .accessibilityLabel("Affinity score \(score) out of 10")
            }
            if rows.isEmpty {
                Text("0 \(label.lowercased())").font(.subheadline).foregroundStyle(.secondary)
            } else {
                DisclosureGroup("\(rows.count) \(label.lowercased())") {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        Divider()
                        HStack {
                            portrait(row.opponent, subtitle: row.date)
                            Spacer()
                            Text(row.match, format: .percent.precision(.fractionLength(0))).font(.caption.weight(.semibold))
                        }
                        if let pitch = row.pitch {
                            Label(pitch, systemImage: "circle.fill").font(.caption)
                                .foregroundStyle(Color(hex: row.pitchColor) ?? .secondary)
                        }
                        ResearchToolValues(items: [
                            .init(label: "Pitch speed", text: ResearchFormat.decimal(row.velocity, suffix: " mph")),
                            .init(label: "Spin", text: ResearchFormat.decimal(row.spin, suffix: " rpm")),
                            .init(label: "Exit velocity", text: ResearchFormat.decimal(row.exitVelocity, suffix: " mph")),
                            .init(label: "Launch angle", text: ResearchFormat.decimal(row.angle, suffix: "°")),
                            .init(label: "Distance", text: ResearchFormat.decimal(row.distance, suffix: " ft")),
                            .init(label: "xwOBA", text: row.xwoba?.formatted(.number.precision(.fractionLength(3))) ?? "—"),
                            .init(label: "Run value", text: ResearchFormat.signedDecimal(row.runValue)),
                        ])
                    }
                }.font(.subheadline)
            }
        }
    }

    private func portrait(_ player: DugoutSynergySlate.Player, subtitle: String?) -> some View {
        ResearchToolPortrait(name: player.name, subtitle: subtitle ?? player.team?.code ?? "",
            portraits: player.headshot.map { [$0] } ?? [], teamLogo: player.team?.logo,
            primary: player.team?.color ?? slipPalette.surface, secondary: player.team?.secondaryColor ?? slipPalette.background)
    }

    private func tone(_ score: Int) -> Color {
        if score >= 6 { return Color(rgb: scheme == .dark ? 0x82EFB1 : 0x14613D) }
        if score >= 4 { return Color(rgb: scheme == .dark ? 0xFFD369 : 0x835612) }
        return Color(rgb: scheme == .dark ? 0xFF9C99 : 0xA52C36)
    }

    private func score(_ pair: DugoutSynergySlate.Matchup) -> Int {
        switch ranking {
        case .best: max(pair.batterScore, pair.pitcherScore)
        case .batter: pair.batterScore
        case .pitcher: pair.pitcherScore
        }
    }

    private var shareURL: URL? {
        var url = URLComponents()
        url.scheme = "https"
        url.host = SlipSurgeHTTP.site
        url.path = "/synergy"
        url.queryItems = [.init(name: "sort", value: ranking.rawValue)] + (game.isEmpty ? [] : [.init(name: "game", value: game)])
        return url.url
    }

    private func load(_ requested: DugoutMode) async {
        failure = nil
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/synergy", query: [.init(name: "mode", value: requested.rawValue)],
                account: api.account, userID: api.userID)
            let value = try JSONDecoder().decode(DugoutSynergySlate.self, from: data)
            guard !Task.isCancelled, value.mode == mode, requested == mode else { return }
            response = value
        } catch {
            if !Task.isCancelled, requested == mode { response = nil; failure = error }
        }
    }
}
