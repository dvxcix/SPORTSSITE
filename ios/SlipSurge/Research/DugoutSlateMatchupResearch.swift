import Charts
import SwiftUI

struct DugoutSlateMatchupResearch: View {
    typealias Slate = DugoutSlateBreakdownData
    typealias Pitch = DugoutPlayerPitchLog.Row
    private enum Scope: String, CaseIterable {
        case season = "Season", one = "Last Game", three = "Last 3 Games", five = "Last 5 Games", ten = "Last 10 Games"
        case pitcher = "Vs. This Pitcher", team = "Vs. This Team"

        var days: Int? {
            switch self { case .one: 1; case .three: 3; case .five: 5; case .ten: 10; default: nil }
        }
    }

    private enum BatterSample: Sendable {
        case recorded([Pitch]), unavailable, failure
    }

    let api: DugoutSlateBreakdownAPI
    let date: String
    let mode: DugoutMode
    let matchup: Slate.Matchup
    let side: Slate.Side
    let starter: Slate.Starter
    let batters: [Slate.Batter]
    var workspaceBatter: Binding<Int?>? = nil
    var workspaceWindow: Int? = nil
    @Environment(\.colorScheme) private var scheme
    @State private var selectedWindow = 0
    @State private var scope = Scope.season
    @State private var starterSample: Slate.Sample?
    @State private var starterFailure: (any Error)?
    @State private var staff: Slate.Sample?
    @State private var staffFailure: (any Error)?
    @State private var lineup: [Int: [Pitch]] = [:]
    @State private var loadedBatters: Set<Int> = []
    @State private var failedBatters: Set<Int> = []
    @State private var pinned: Set<String> = []
    @State private var pitchOrder = "pitches"
    @State private var pitchAscending = false
    @State private var batterOrder = "pa"
    @State private var batterAscending = false
    @State private var viewingBatter: Int?
    @State private var revision = 0

    private var game: Int { matchup.game.id }
    private var ownTeam: DugoutBoard.Team { matchup.game.team(side) }
    private var opponent: DugoutBoard.Team { matchup.game.opposition(side) }
    private var profileAPI: DugoutPlayerProfileAPI { .init(account: api.account, userID: api.userID) }

    var body: some View {
        Group {
            if let starterFailure {
                if let status = starterFailure as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView("Basic access required for pitch research", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Starter sample couldn’t load", error: starterFailure) { revision += 1 }
                }
            } else if let starterSample {
                if let raw = starterSample.sample?.rows {
                    research(starterSample, rows: raw)
                } else {
                    ResearchToolCard(color: ownTeam.color) {
                        starterLink
                    } content: {
                        Text("No pregame pitch sample was saved for this starter.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    lineupNames
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(18).accessibilityLabel("Loading starter sample")
            }
        }
        .onAppear {
            if let workspaceWindow, let initial = Scope.allCases.first(where: { $0.days == workspaceWindow }) { scope = initial }
            if let person = workspaceBatter?.wrappedValue, batters.contains(where: { $0.id == person }) { viewingBatter = person }
        }
        .task(id: revision) { await loadSamples() }
        .task(id: scope) {
            if scope == .team, staff == nil {
                do {
                    staffFailure = nil
                    let result = try await api.sample(date: date, mode: mode, game: game, side: side, view: "team")
                    try Task.checkCancellation()
                    staff = result
                } catch {
                    if !Task.isCancelled { staffFailure = error }
                }
            }
        }
    }

    @ViewBuilder
    private func research(_ sample: Slate.Sample, rows: [Pitch]) -> some View {
        let window = windowRows(rows, games: selectedWindow == 0 ? nil : selectedWindow)
        let byPitch = Dictionary(grouping: window.filter { $0.pitchType != nil }, by: { $0.pitchType ?? "" })
        let active = pinned.isEmpty ? Set(byPitch.keys) : pinned
        ResearchToolCard(color: ownTeam.color) {
            starterLink
        } content: {
            Picker("Pitcher sample", selection: $selectedWindow) {
                Text("Season").tag(0)
                ForEach([10, 5, 3], id: \.self) { Text("Last \($0) starts").tag($0) }
            }
            .onChange(of: selectedWindow) { pinned = [] }
            if !window.isEmpty {
                lineValues(DugoutPitchLine(window), fields: Self.pitcherSummary)
            } else {
                Text("No recorded pitches in this window").foregroundStyle(.secondary)
            }
            Label(sample.archive.label, systemImage: sample.archive.live ? "dot.radiowaves.left.and.right" : "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        if !byPitch.isEmpty {
            arsenal(byPitch, total: window.count)
            ResearchToolCard(color: ownTeam.color) {
                ResearchSectionTitle(title: "Zone Profile")
            } content: {
                DugoutProfileZoneGrid(rows: window.filter { active.contains($0.pitchType ?? "") }, opponentRows: nil, pitcher: true)
            }
        }
        lineupResearch(mix: active, starterPitches: window)
    }

    private var starterLink: some View {
        NavigationLink {
            DugoutPlayerProfileView(api: profileAPI, playerID: starter.id, preferredRole: .pitcher)
        } label: {
            ResearchToolPortrait(name: starter.name, subtitle: [ownTeam.name, starter.hand.map { "\($0)HP" }].compactMap { $0 }.joined(separator: " · "),
                portraits: [starter.headshot].compactMap { $0 }, teamLogo: ownTeam.logo, primary: ownTeam.color, secondary: ownTeam.secondaryColor)
        }
        .buttonStyle(SlipSurgePressStyle())
    }

    private var lineupNames: some View {
        ResearchToolCard(color: opponent.color) {
            ResearchSectionTitle(title: "\(opponent.code) Lineup")
        } content: {
            if batters.isEmpty {
                Text("No lineup was saved for this matchup").foregroundStyle(.secondary)
            }
            ForEach(batters) { batter in
                NavigationLink {
                    DugoutPlayerProfileView(api: profileAPI, playerID: batter.id, preferredRole: .batter)
                } label: { batterLabel(batter) }
                .buttonStyle(SlipSurgePressStyle())
            }
        }
    }

    private func arsenal(_ groups: [String: [Pitch]], total: Int) -> some View {
        let lines = groups.mapValues { DugoutPitchLine($0, total: total) }
        let ordering = lines.keys.sorted { compare(lines[$0], lines[$1], field: pitchOrder, ascending: pitchAscending, name: ($0, $1)) }
        let fields = DugoutPitchLine.metrics.filter { $0.id != "avgBatSpeed" }
        let pools = Dictionary(uniqueKeysWithValues: fields.map { field in
            (field.id, lines.values.filter { $0.count >= 10 }.compactMap { $0.values[field.id] })
        })
        return ResearchToolCard(color: ownTeam.color) {
            ResearchSectionTitle(title: "Pitch Mix")
        } content: {
            HStack {
                sortMenu("Pitch sort", fields: fields, selection: $pitchOrder, ascending: $pitchAscending)
                Spacer()
                if !pinned.isEmpty { Button("Reset") { pinned.removeAll() }.font(.subheadline.weight(.semibold)) }
            }
            Chart {
                ForEach(ordering, id: \.self) { code in
                    if let usage = lines[code]?.values["usage"] {
                        BarMark(x: .value("Usage", usage), y: .value("Pitch", code))
                            .foregroundStyle((Color(hex: matchup.pitch(code).color) ?? .blue).opacity(pinned.isEmpty || pinned.contains(code) ? 1 : 0.28))
                            .cornerRadius(4)
                            .accessibilityValue(ResearchFormat.decimal(usage, suffix: "%"))
                    }
                }
            }
            .chartXScale(domain: 0...100)
            .chartYAxis {
                AxisMarks { mark in
                    if let code = mark.as(String.self) { AxisValueLabel { Text(matchup.pitch(code).label) } }
                }
            }
            .frame(height: CGFloat(max(92, 21 * lines.count)))
            .accessibilityLabel("Pitch usage")
            ForEach(ordering, id: \.self) { code in
                if let line = lines[code] {
                    HStack {
                        Button {
                            if !pinned.insert(code).inserted { pinned.remove(code) }
                        } label: {
                            Image(systemName: pinned.contains(code) ? "pin.fill" : "pin").frame(width: 39, height: 44)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityLabel(pinned.contains(code) ? "Unpin \(matchup.pitch(code).label)" : "Pin \(matchup.pitch(code).label)")
                        DisclosureGroup {
                            lineValues(line, fields: fields.map(\.id), pool: pools, asPitcher: true)
                        } label: {
                            DugoutProfilePitchBadge(pitch: matchup.pitch(code))
                        }
                    }
                }
            }
        }
    }

    private func lineupResearch(mix: Set<String>, starterPitches: [Pitch]) -> some View {
        let scoped = lineup.mapValues { rows in scopedBatter(rows, mix: mix) }
        let lines = scoped.mapValues { DugoutPitchLine($0) }
        let ordered = batters.sorted {
            if batterOrder == "name" { return compare(nil, nil, field: "name", ascending: batterAscending, name: ($0.name, $1.name)) }
            return compare(lines[$0.id], lines[$1.id], field: batterOrder, ascending: batterAscending, name: ($0.name, $1.name))
        }
        let fields = DugoutPitchLine.metrics.filter { !["usage", "runValuePer100"].contains($0.id) }
        let pools = Dictionary(uniqueKeysWithValues: fields.map { field in
            (field.id, lines.values.filter { $0.count >= 10 }.compactMap { $0.values[field.id] })
        })
        return ResearchToolCard(color: opponent.color) {
            ResearchSectionTitle(title: "\(opponent.code) Lineup")
        } content: {
            Picker("Batter sample", selection: $scope) {
                ForEach(Scope.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            sortMenu("Batter sort", fields: fields, selection: $batterOrder, ascending: $batterAscending)
            if let staffFailure, scope == .team {
                if (staffFailure as? SlipSurgeHTTP.Status)?.code == 403 {
                    Text("Advanced access required for the full pitching staff.").font(.subheadline).foregroundStyle(.secondary)
                } else {
                    Text("The team’s pitching staff couldn’t load.").font(.subheadline).foregroundStyle(.secondary)
                }
            } else if scope == .team, staff?.sample?.pitcherIds == nil {
                if staff != nil { Text("No pregame pitching staff was saved.").font(.subheadline).foregroundStyle(.secondary) }
                else { ProgressView().accessibilityLabel("Loading pitching staff") }
            }
            ForEach(ordered) { batter in
                DisclosureGroup(isExpanded: Binding(get: { viewingBatter == batter.id }, set: { expanded in
                    viewingBatter = expanded ? batter.id : nil
                    if expanded { workspaceBatter?.wrappedValue = batter.id }
                })) {
                    if scope == .team && staff?.sample?.pitcherIds == nil {
                        Text("The pitching staff is required for this view.").font(.caption).foregroundStyle(.secondary)
                    } else if let line = lines[batter.id], let rows = scoped[batter.id], !rows.isEmpty {
                        lineValues(line, fields: fields.map(\.id), pool: pools)
                        DugoutProfileZoneGrid(rows: rows, opponentRows: nil, pitcher: false)
                        if !starterPitches.isEmpty {
                            DisclosureGroup("Matchup zone score") {
                                DugoutProfileZoneGrid(rows: rows, opponentRows: starterPitches, pitcher: false)
                            }
                        }
                        pitchDetails(rows)
                        if workspaceBatter != nil {
                            DugoutWorkspaceSpray(name: batter.name, matchup: matchup, rows: rows).id(batter.id)
                        }
                    } else if failedBatters.contains(batter.id) {
                        Button("Retry pitch sample", systemImage: "arrow.clockwise") {
                            failedBatters.remove(batter.id)
                            Task {
                                let result = await Self.loadBatter(api, date: date, mode: mode, game: game, side: side, id: batter.id)
                                if !Task.isCancelled { accept(result, for: batter.id) }
                            }
                        }
                    } else if loadedBatters.contains(batter.id) {
                        Text(lineup[batter.id] == nil && mode == .pregame ? "No pregame sample was saved for this batter."
                            : "No recorded pitches match this sample.")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        ProgressView().accessibilityLabel("Loading \(batter.name)’s pitches")
                    }
                    NavigationLink("Open player profile") {
                        DugoutPlayerProfileView(api: profileAPI, playerID: batter.id, preferredRole: .batter)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.vertical, 7)
                } label: {
                    batterLabel(batter)
                }
                Divider()
            }
        }
    }

    private func batterLabel(_ batter: Slate.Batter) -> some View {
        let subtitle = [batter.position, batter.bats.map { "Bats \($0)" }].compactMap { $0 }.joined(separator: " · ")
        return DugoutOpponentArtwork(name: batter.name, subtitle: subtitle, headshot: batter.headshot, logo: opponent.logo)
    }

    private func pitchDetails(_ rows: [Pitch]) -> some View {
        let headToHead = rows.filter { $0.opponentId == starter.id }
        let samples = headToHead.isEmpty ? rows : headToHead
        return DisclosureGroup(headToHead.isEmpty ? "Pitch log" : "Head-to-head pitch log") {
            let last = samples.sorted { $0.gameDate > $1.gameDate }.prefix(75)
            ForEach(Array(last.enumerated()), id: \.offset) { _, row in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        if let pitch = row.pitchType { DugoutProfilePitchBadge(pitch: matchup.pitch(pitch)) }
                        Text([row.gameDate, row.pitchCount, row.description.map(dugoutProfileWord)].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(ResearchFormat.decimal(row.velocity, suffix: " mph")).font(.caption.monospacedDigit())
                }
                .padding(.vertical, 4)
            }
            if samples.count > 75 { Text("Showing 75 of \(samples.count.formatted()) pitches").font(.caption2).foregroundStyle(.secondary) }
        }
    }

    private func sortMenu(_ title: String, fields: [DugoutProfileMetric], selection: Binding<String>, ascending: Binding<Bool>) -> some View {
        Menu {
            Picker(title, selection: selection) {
                Text("Name").tag("name")
                ForEach(fields) { Text($0.label).tag($0.id) }
            }
            Toggle("Ascending", isOn: ascending)
        } label: {
            Label("Sort", systemImage: "arrow.up.arrow.down").font(.subheadline.weight(.semibold))
        }
    }

    private func compare(_ a: DugoutPitchLine?, _ b: DugoutPitchLine?, field: String, ascending: Bool, name: (String, String)) -> Bool {
        let first = a?.values[field]
        let second = b?.values[field]
        if first == second {
            let comparison = name.0.localizedStandardCompare(name.1)
            return comparison == (field == "name" && !ascending ? .orderedDescending : .orderedAscending)
        }
        guard let first else { return false }
        guard let second else { return true }
        return ascending ? first < second : first > second
    }

    private func lineValues(_ line: DugoutPitchLine, fields: [String], pool: [String: [Double]] = [:], asPitcher: Bool = false) -> some View {
        let items = fields.compactMap { key -> ResearchToolValues.Value? in
            guard let field = DugoutPitchLine.metrics.first(where: { $0.id == key }) else { return nil }
            let value = line.values[key]
            let normalized = !DugoutPitchLine.metrics.prefix(10).contains { $0.id == key }
            let tone = value.flatMap {
                line.count >= 10 && normalized ? profileHeat($0, pool: pool[field.id] ?? [],
                    lower: key == "runValuePer100" ? true : asPitcher != field.lowerIsBetter, scheme: scheme) : nil
            }
            return .init(label: field.label, text: field.format(value), tone: tone)
        }
        return ResearchToolValues(items: items)
    }

    private func scopedBatter(_ rows: [Pitch], mix: Set<String>) -> [Pitch] {
        let eligible = windowRows(rows, games: scope.days).filter { mix.contains($0.pitchType ?? "") }
        if scope == .pitcher { return eligible.filter { $0.opponentId == starter.id } }
        if scope == .team {
            let staff = Set(staff?.sample?.pitcherIds ?? [])
            return eligible.filter { staff.contains($0.opponentId) }
        }
        return eligible
    }

    private func windowRows(_ rows: [Pitch], games: Int?) -> [Pitch] {
        guard let games else { return rows }
        let gameKeys = rows.sorted { left, right in
            if left.gameDate != right.gameDate { return left.gameDate > right.gameDate }
            return (left.gamePk.text ?? "") > (right.gamePk.text ?? "")
        }.compactMap(\.gamePk.text)
        var seen = Set<String>()
        let selected = Set(gameKeys.filter { seen.insert($0).inserted }.prefix(games))
        return rows.filter { $0.gamePk.text.map(selected.contains) == true }
    }

    private func loadSamples() async {
        starterFailure = nil
        do {
            let result = try await api.sample(date: date, mode: mode, game: game, side: side, view: "starter")
            try Task.checkCancellation()
            starterSample = result
        } catch {
            if !Task.isCancelled { starterFailure = error }
            return
        }
        guard starterSample?.sample?.rows != nil else { return }
        let ids = batters.map(\.id)
        let mainAPI = api
        let date = date
        let mode = mode
        let game = game
        let side = side
        await withTaskGroup(of: (Int, BatterSample).self) { group in
            var remaining = ids.makeIterator()
            for _ in 0..<3 {
                guard let id = remaining.next() else { break }
                group.addTask {
                    (id, await Self.loadBatter(mainAPI, date: date, mode: mode, game: game, side: side, id: id))
                }
            }
            for await (id, result) in group {
                if Task.isCancelled { group.cancelAll(); return }
                accept(result, for: id)
                if let next = remaining.next() {
                    group.addTask {
                        (next, await Self.loadBatter(mainAPI, date: date, mode: mode, game: game, side: side, id: next))
                    }
                }
            }
        }
    }

    private static func loadBatter(_ api: DugoutSlateBreakdownAPI, date: String, mode: DugoutMode, game: Int,
        side: Slate.Side, id: Int) async -> BatterSample {
        do {
            let sample = try await api.sample(date: date, mode: mode, game: game, side: side, view: "batter", batter: id)
            if let rows = sample.sample?.rows { return .recorded(rows) }
            return .unavailable
        } catch { return .failure }
    }

    private func accept(_ result: BatterSample, for id: Int) {
        switch result {
        case .recorded(let rows): lineup[id] = rows; loadedBatters.insert(id)
        case .unavailable: lineup.removeValue(forKey: id); loadedBatters.insert(id)
        case .failure: loadedBatters.remove(id); failedBatters.insert(id)
        }
    }

    private static let pitcherSummary = ["pitches", "pa", "avg", "obp", "whiffPct", "chasePct", "hardHitPct", "runValuePer100"]
}
