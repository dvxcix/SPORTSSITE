import SwiftUI

private struct DugoutPitchWindow: Decodable {
    struct Sample: Decodable {
        let games: Int
        let dateFrom: String?
        let dateTo: String?
    }

    struct Pitch: Decodable {
        let pitchType: String
        let pitches: Int
        let usagePct: Double?
        let inPlay: Int
        let whiffPct: Double?
        let hardHitPct: Double?
        let barrelPct: Double?
        let homeRuns: Int
        let avgExitVelo: Double?
        let avgLaunchAngle: Double?
        let gbPct: Double?
        let fbPct: Double?
        let ldPct: Double?
        let puPct: Double?
        let label: String?
        let color: String?

        var title: String { label ?? pitchType }
        var pressure: Double { (barrelPct ?? 0) * 1.5 + (hardHitPct ?? 0) }
    }

    struct Snapshot: Decodable {
        let mode: String
        let observedAt: String?
        let frozen: Bool?
    }

    let window: Sample
    let pitcherRows: [String: [Pitch]]
    let batters: [String: [String: [String: Pitch]]]
    let researchSnapshot: Snapshot
}

struct DugoutPitcherReport: View {
    private enum Hand: String, CaseIterable {
        case right = "R", left = "L"
        var title: String { self == .right ? "Right-handed batters" : "Left-handed batters" }
    }

    private struct Starter: Identifiable {
        let game: DugoutBoard.Game
        let pitcher: DugoutBoard.Pitcher
        let team: DugoutBoard.Team
        let opponent: DugoutBoard.Team
        let lineup: [DugoutBoard.Batter]
        var id: String { "\(game.id):\(pitcher.id)" }
    }

    private struct PitchSelection: Identifiable {
        let hand: Hand
        let pitch: DugoutPitchWindow.Pitch
        var id: String { "\(hand.rawValue):\(pitch.pitchType)" }
    }

    private struct Request: Equatable {
        let date: String
        let game: Int
        let pitcher: Int
        let starts: Int
        let revision: Int
    }

    let api: DugoutAPI
    @State var date: Date
    var linkedStarter: String? = nil
    var linkedPitcher: Int? = nil
    @Environment(\.colorScheme) private var scheme
    @State private var slate: DugoutBoard?
    @State private var selection = ""
    @State private var range = 3
    @State private var viewAll = false
    @State private var pins: Set<String> = []
    @State private var revision = 0
    @State private var boardError: (any Error)?
    @State private var windowError: (Request, any Error)?
    @State private var window: (Request, DugoutPitchWindow)?

    var body: some View {
        let key = SlateDate.key(date)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                ResearchSlateControls(date: $date)
                if let slate, slate.date == key {
                    let starters = starters(on: slate)
                    if let starter = starters.first(where: { $0.id == selection }) ?? starters.first {
                        controls(starters, selected: starter)
                        starterHeader(starter)
                        report(starter)
                    } else {
                        ContentUnavailableView("No starters available", systemImage: "baseball")
                    }
                } else {
                    ResearchToolMessage(title: "Pitcher Report couldn’t load", error: boardError) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Pitcher Report")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(key):\(revision)") { await loadSlate(key) }
        .refreshable { revision += 1 }
        .onChange(of: key) {
            selection = ""
            pins = []
            viewAll = false
            boardError = nil
        }
    }

    private func controls(_ starters: [Starter], selected: Starter) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                ResearchArtworkPicker(title: "Choose starter", options: starters.map { starter in
                    .init(id: starter.id, title: "\(starter.pitcher.name) · \(starter.team.code) vs \(starter.opponent.code)",
                        url: starter.pitcher.headshot, playerTeamLogo: starter.team.logo,
                        playerColors: [starter.team.color, starter.team.secondaryColor], icon: "person.fill")
                }, selection: Binding(get: { selected.id }, set: { selection = $0 }))
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            Picker("Starts", selection: $range) {
                ForEach([3, 5, 10], id: \.self) { Text("Last \($0) starts").tag($0) }
            }
            .pickerStyle(.segmented)
        }
        .onChange(of: selected.id) { pins = []; viewAll = false }
        .onChange(of: range) { pins = []; viewAll = false }
    }

    private func starterHeader(_ starter: Starter) -> some View {
        ResearchToolCard(color: starter.team.color) {
            ResearchToolPortrait(name: starter.pitcher.name, subtitle: "\(starter.team.name) · \(starter.pitcher.hand)HP",
                portraits: [starter.pitcher.headshot], teamLogo: starter.team.logo, primary: starter.team.color,
                secondary: starter.team.secondaryColor)
        } content: {
            HStack {
                ResearchArtwork(urls: starter.opponent.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 22, height: 22)
                Text("vs. \(starter.opponent.name)").font(.subheadline.weight(.semibold))
                Spacer()
                if !starter.pitcher.markets.isEmpty {
                    NavigationLink {
                        DugoutPitcherView(pitcher: starter.pitcher, team: starter.team,
                            watchTarget: api.watchTarget(date: date, game: starter.game.id, player: starter.pitcher.id))
                    } label: { Label("Odds", systemImage: "chart.bar").font(.caption.weight(.semibold)) }
                }
            }
        }
    }

    private func report(_ starter: Starter) -> some View {
        let request = Request(date: SlateDate.key(date), game: starter.game.id, pitcher: starter.pitcher.id, starts: range, revision: revision)
        return VStack(alignment: .leading, spacing: 13) {
            if let window, window.0 == request {
                reportContent(starter, value: window.1)
            } else {
                ResearchToolMessage(title: "Pregame pitch window unavailable",
                    error: windowError.flatMap { $0.0 == request ? $0.1 : nil }) { revision += 1 }
            }
        }
        .task(id: request) { await loadWindow(request) }
        .task(id: "\(request.game):\(request.pitcher):\(request.starts):\(starter.game.snapshot.startAt ?? "")") {
            if starter.game.snapshot.frozen == false, let start = starter.game.snapshot.startAt.flatMap(SidelineBoard.timestamp),
               start > .now {
                do { try await Task.sleep(for: .seconds(start.timeIntervalSinceNow + 0.15)) } catch { return }
                revision += 1
            }
        }
    }

    private func reportContent(_ starter: Starter, value: DugoutPitchWindow) -> some View {
        let groups = Hand.allCases.flatMap { hand in
            (value.pitcherRows[hand.rawValue] ?? []).map { PitchSelection(hand: hand, pitch: $0) }
        }
        let shown = if !pins.isEmpty { groups.filter { pins.contains($0.id) } }
        else if viewAll { groups }
        else {
            Hand.allCases.flatMap { hand in
                groups.filter { $0.hand == hand && $0.pitch.pitches >= 10 }
                    .sorted { $0.pitch.pressure > $1.pitch.pressure }.prefix(2)
            }
        }
        return VStack(alignment: .leading, spacing: 12) {
            if let from = value.window.dateFrom, let to = value.window.dateTo {
                Label("\(value.window.games) starts · \(from) to \(to)", systemImage: "clock")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Hand.allCases, id: \.self) { hand in
                let rows = groups.filter { $0.hand == hand }.sorted { ($0.pitch.usagePct ?? 0) > ($1.pitch.usagePct ?? 0) }
                if !rows.isEmpty {
                    ResearchSectionTitle(title: hand.title)
                    ForEach(rows) { pitchRow($0, starter: starter) }
                }
            }
            if groups.isEmpty {
                ContentUnavailableView("No pitches tracked in this window", systemImage: "chart.bar")
            } else {
                HStack {
                    ResearchSectionTitle(title: pins.isEmpty ? "Batter matchups" : "Pinned pitches")
                    Spacer()
                    if pins.isEmpty {
                        Button(viewAll ? "Top pitches" : "Show all") { viewAll.toggle() }
                            .buttonStyle(.bordered)
                    } else {
                        Button("Clear pins") { pins = [] }.buttonStyle(.bordered)
                    }
                }
                Text("Each batter’s own last \(range) games against \(starter.pitcher.hand == "L" ? "left" : "right")-handed pitching.")
                    .font(.caption).foregroundStyle(.secondary)
                if shown.isEmpty {
                    Text("No pitch reached the 10-pitch threshold.").font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(shown) { matchup($0, starter: starter, value: value) }
            }
        }
    }

    private func pitchRow(_ row: PitchSelection, starter: Starter) -> some View {
        let pitch = row.pitch
        let pinned = pins.contains(row.id)
        let tone = Color(hex: pitch.color) ?? starter.team.secondaryColor
        return ResearchToolCard(color: tone) {
            Button {
                if pinned { pins.remove(row.id) } else { pins.insert(row.id) }
            } label: {
                HStack(spacing: 8) {
                    Circle().fill(tone).frame(width: 10, height: 10).accessibilityHidden(true)
                    Text(pitch.title).font(.headline)
                    Spacer()
                    Text(ResearchFormat.decimal(pitch.usagePct, suffix: "%")).font(.subheadline.weight(.semibold))
                    Image(systemName: pinned ? "pin.fill" : "pin")
                        .foregroundStyle(pinned ? Brand.accent(for: scheme) : .secondary)
                }.frame(minHeight: 40)
            }
            .buttonStyle(SlipSurgePressStyle())
            .accessibilityAddTraits(pinned ? .isSelected : [])
            .accessibilityHint(pinned ? "Unpin pitch matchup" : "Pin pitch matchup")
        } content: {
            if let usage = pitch.usagePct {
                ProgressView(value: min(max(usage, 0), 100), total: 100).tint(tone)
                    .accessibilityLabel("Usage")
            }
            metrics(pitch)
        }
    }

    private func matchup(_ row: PitchSelection, starter: Starter, value: DugoutPitchWindow) -> some View {
        ResearchToolCard(color: Color(hex: row.pitch.color) ?? starter.opponent.color) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.pitch.title).font(.headline)
                Text(row.hand.title).font(.caption).foregroundStyle(.secondary)
            }
        } content: {
            let batters = starter.lineup.filter { batterSide($0.bats, vs: starter.pitcher.hand) == row.hand }
            if batters.isEmpty { Text("No batters available for this side").font(.caption).foregroundStyle(.secondary) }
            ForEach(batters) { batter in
                let read = value.batters[String(batter.id)]?[row.pitch.pitchType]?[starter.pitcher.hand]
                DisclosureGroup {
                    if let read { metrics(read) }
                    else { Text("No tracked pitches in this sample").font(.caption).foregroundStyle(.secondary) }
                    NavigationLink {
                        DugoutPlayerView(player: batter, game: starter.game, window: .l5,
                            watchTarget: api.watchTarget(date: date, game: starter.game.id, player: batter.id), showsDone: false)
                    } label: { Label("Player research", systemImage: "chart.bar.xaxis").font(.subheadline) }
                } label: {
                    HStack {
                        ResearchToolPortrait(name: batter.name, subtitle: "\(batter.team) · \(batter.position)", portraits: [batter.headshot],
                            teamLogo: starter.opponent.logo, primary: starter.opponent.color, secondary: starter.opponent.secondaryColor)
                        Spacer()
                        if let read {
                            Text(ResearchFormat.decimal(read.hardHitPct, suffix: "% hard hit"))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle((read.hardHitPct ?? 0) >= 40 ? Brand.accent(for: scheme) : .secondary)
                        }
                    }
                }
            }
        }
    }

    private func metrics(_ pitch: DugoutPitchWindow.Pitch) -> some View {
        ResearchToolValues(items: [
            .init(label: "Pitches", text: pitch.pitches.formatted()),
            .init(label: "Batted balls", text: pitch.inPlay.formatted()),
            .init(label: "Whiff", text: ResearchFormat.decimal(pitch.whiffPct, suffix: "%")),
            .init(label: "Hard hit", text: ResearchFormat.decimal(pitch.hardHitPct, suffix: "%")),
            .init(label: "Barrels", text: ResearchFormat.decimal(pitch.barrelPct, suffix: "%")),
            .init(label: "Home runs", text: pitch.homeRuns.formatted()),
            .init(label: "Exit velocity", text: ResearchFormat.decimal(pitch.avgExitVelo, suffix: " mph")),
            .init(label: "Launch angle", text: ResearchFormat.decimal(pitch.avgLaunchAngle, suffix: "°")),
            .init(label: "Ground balls", text: ResearchFormat.decimal(pitch.gbPct, suffix: "%")),
            .init(label: "Fly balls", text: ResearchFormat.decimal(pitch.fbPct, suffix: "%")),
            .init(label: "Line drives", text: ResearchFormat.decimal(pitch.ldPct, suffix: "%")),
            .init(label: "Pop-ups", text: ResearchFormat.decimal(pitch.puPct, suffix: "%")),
        ])
    }

    private func batterSide(_ bats: String, vs pitcher: String) -> Hand {
        if bats == "S" { return pitcher == "L" ? .right : .left }
        return bats == "L" ? .left : .right
    }

    private func starters(on slate: DugoutBoard) -> [Starter] {
        slate.games.flatMap { game in
            var values: [Starter] = []
            if let pitcher = game.awayPitcher {
                values.append(.init(game: game, pitcher: pitcher, team: game.away, opponent: game.home, lineup: game.homeLineup))
            }
            if let pitcher = game.homePitcher {
                values.append(.init(game: game, pitcher: pitcher, team: game.home, opponent: game.away, lineup: game.awayLineup))
            }
            return values
        }
    }

    private func loadSlate(_ key: String) async {
        do {
            let loaded = try await api.board(date: key, mode: .pregame)
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            slate = loaded
            if selection.isEmpty {
                let all = starters(on: loaded)
                if let linkedStarter, all.contains(where: { $0.id == linkedStarter }) {
                    selection = linkedStarter
                } else if let linkedPitcher, let matching = all.first(where: { $0.pitcher.id == linkedPitcher }) {
                    selection = matching.id
                }
            }
            boardError = nil
        } catch {
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            boardError = error
        }
    }

    private func loadWindow(_ request: Request) async {
        do {
            let bytes = try await SlipSurgeHTTP.memberData("/api/mobile/dugout/pitcher-window", query: [
                .init(name: "date", value: request.date), .init(name: "gamePk", value: String(request.game)),
                .init(name: "pitcherId", value: String(request.pitcher)), .init(name: "games", value: String(request.starts)),
            ], account: api.account, userID: api.userID)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let decoded = try decoder.decode(DugoutPitchWindow.self, from: bytes)
            guard decoded.researchSnapshot.mode == "pregame" else { throw URLError(.cannotParseResponse) }
            guard !Task.isCancelled else { return }
            window = (request, decoded)
            windowError = nil
        } catch {
            if !Task.isCancelled { windowError = (request, error) }
        }
    }
}
