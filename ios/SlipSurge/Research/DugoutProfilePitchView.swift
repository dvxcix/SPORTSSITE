import SwiftUI

struct DugoutProfilePitchView: View {
    typealias Row = DugoutPlayerPitchLog.Row
    let api: DugoutPlayerProfileAPI
    let profile: DugoutProfile
    let kind: DugoutPlayerPitchLog.Kind
    @Environment(\.colorScheme) private var scheme
    @State private var payload: DugoutPlayerPitchLog?
    @State private var context: DugoutPlayerPitchLog.Today?
    @State private var failure: (any Error)?
    @State private var revision = 0
    @State private var range = 0
    @State private var hand = "all"
    @State private var time = "all"
    @State private var inning = 0
    @State private var pitch = "all"
    @State private var opponent = "all"
    @State private var inPlay = false
    @State private var start: Date?
    @State private var end: Date?
    @State private var sort = "pitches"
    @State private var ascending = false

    var body: some View {
        Group {
            if let payload {
                if payload.rows.isEmpty {
                    ContentUnavailableView(kind == .spray ? "No recorded batted balls" : "No recorded pitches", systemImage: "baseball")
                } else if kind == .spray {
                    DugoutProfileSprayChart(profile: profile, log: payload)
                } else {
                    explorer(payload)
                }
            } else {
                ResearchToolMessage(title: "\(kind.title) couldn’t load", error: failure) { revision += 1 }
            }
        }
        .task(id: revision) {
            do {
                failure = nil
                let loaded = try await api.log(profile.player.mlbId, kind: kind)
                try Task.checkCancellation()
                payload = loaded
            } catch {
                if !Task.isCancelled { failure = error }
            }
        }
        .task {
            guard kind != .spray else { return }
            let today = try? await api.today(profile.player.mlbId)
            guard !Task.isCancelled, let today,
                  today.role.rawValue == (kind == .batting ? "batter" : "pitcher") else { return }
            context = today
            if opponent == "all", today.opponentPitcher != nil || !today.opponentLineup.isEmpty { opponent = "today" }
        }
    }

    @ViewBuilder
    private func explorer(_ log: DugoutPlayerPitchLog) -> some View {
        let options = opponentOptions(log)
        let rows = filtered(log.rows)
        ResearchToolCard(color: profile.accent) {
            ResearchSectionTitle(title: kind.title)
        } content: {
            ResearchArtworkPicker(title: kind == .batting ? "Opposing pitcher" : "Opposing batter",
                options: options, selection: $opponent)
            filters(log.rows)
            if rows.isEmpty {
                Text("No pitches match these filters").font(.subheadline).foregroundStyle(.secondary)
            } else if kind == .pitching {
                DugoutProfileZoneGrid(rows: rows, opponentRows: nil, pitcher: true)
            } else {
                pitchBreakdown(rows)
            }
        }
        if let id = selectedOpponent, let option = options.first(where: { $0.id == opponent }) {
            DugoutProfileZoneScore(api: api, profile: profile, myRows: log.rows, opponentID: id,
                opponentName: option.title, pitcher: kind == .pitching).id(id)
        }
    }

    private var selectedOpponent: Int? {
        opponent == "today" ? context?.opponentPitcher?.id : Int(opponent)
    }

    private func opponentOptions(_ log: DugoutPlayerPitchLog) -> [ResearchArtworkPicker.Option] {
        let groups = Dictionary(grouping: log.rows, by: \.opponentId)
        let all = ResearchArtworkPicker.Option(id: "all", title: kind == .batting ? "All pitchers" : "All batters", icon: "person.2")
        var options = [all]
        if let context, let pitcher = context.opponentPitcher {
            options.append(opponentOption(key: "today", name: "Today · \(pitcher.name)", teamCode: context.opponentTeam, headshot: log.opponents[String(pitcher.id)]))
        } else if let context, !context.opponentLineup.isEmpty {
            let marker = context.lineupConfirmed ? "" : " (Projected)"
            options.append(.team(id: "today", title: "Today vs. \(context.opponentTeamName)\(marker)", logo: profile.teams[context.opponentTeam]?.logo))
        }
        options += groups.values.sorted { $0.count > $1.count }.compactMap { group in
            guard let row = group.first else { return nil }
            return opponentOption(key: String(row.opponentId), name: row.opponentName, teamCode: row.opponentTeam,
                headshot: log.opponents[String(row.opponentId)])
        }
        return options
    }

    private func opponentOption(key: String, name: String, teamCode: String?, headshot: URL?) -> ResearchArtworkPicker.Option {
        let team = teamCode.flatMap { profile.teams[$0] }
        return .init(id: key, title: name, url: headshot ?? team?.logo, playerTeamLogo: headshot == nil ? nil : team?.logo,
            playerColors: team.map { [$0.color, $0.secondaryColor] } ?? [], icon: "person.fill")
    }

    @ViewBuilder
    private func filters(_ rows: [Row]) -> some View {
        DisclosureGroup("Filters") {
            VStack(alignment: .leading, spacing: 5) {
                if kind == .batting {
                    Picker("Games", selection: $range) {
                        Text("Season").tag(0)
                        ForEach([30, 15, 7], id: \.self) { Text("Last \($0) games").tag($0) }
                    }
                    Picker("First pitch", selection: $time) {
                        Text("Any time").tag("all")
                        Text("Day").tag("day")
                        Text("Night").tag("night")
                    }
                    Picker("Inning", selection: $inning) {
                        Text("All innings").tag(0)
                        ForEach(Set(rows.compactMap(\.inning)).sorted(), id: \.self) { Text("Inning \($0)").tag($0) }
                    }
                    Toggle("Balls in play only", isOn: $inPlay)
                } else {
                    Menu {
                        Button("All pitch types") { pitch = "all" }
                        ForEach(Set(rows.compactMap(\.pitchType)).sorted(), id: \.self) { code in
                            Button { pitch = code } label: { DugoutProfilePitchBadge(pitch: profile.pitch(code)) }
                        }
                    } label: {
                        if pitch == "all" { Label("All pitch types", systemImage: "chevron.up.chevron.down") }
                        else { DugoutProfilePitchBadge(pitch: profile.pitch(pitch)) }
                    }
                }
                Picker(kind == .batting ? "Pitcher hand" : "Batter hand", selection: $hand) {
                    Text("Both hands").tag("all")
                    Text("Left").tag("L")
                    Text("Right").tag("R")
                }
                DateFilter(title: "From", date: $start)
                DateFilter(title: "Through", date: $end)
            }
            .padding(.top, 5)
        }
    }

    private func filtered(_ rows: [Row]) -> [Row] {
        let from = start.map(SlateDate.key)
        let through = end.map(SlateDate.key)
        let last = range > 0 && from == nil && through == nil ? Set(Set(rows.map(\.gameDate)).sorted().suffix(range)) : nil
        let lineup = Set(context?.opponentLineup.map(\.mlbId) ?? [])
        return rows.filter { row in
            let matchup = opponent == "all" || selectedOpponent == row.opponentId || (opponent == "today" && lineup.contains(row.opponentId))
            return matchup && (from.map { row.gameDate >= $0 } ?? true) && (through.map { row.gameDate <= $0 } ?? true)
                && (last?.contains(row.gameDate) ?? true)
                && (hand == "all" || (kind == .batting ? row.pThrows : row.stand) == hand)
                && (time == "all" || row.dayNight?.lowercased() == time)
                && (inning == 0 || row.inning == inning)
                && (!inPlay || row.isInPlay == true)
                && (pitch == "all" || row.pitchType == pitch)
        }
    }

    @ViewBuilder
    private func pitchBreakdown(_ rows: [Row]) -> some View {
        let totals = DugoutPitchLine(rows)
        let groups = Dictionary(grouping: rows.filter { $0.pitchType != nil }, by: { $0.pitchType ?? "" })
        let lines = groups.mapValues { DugoutPitchLine($0, total: rows.count) }
        let metrics = DugoutPitchLine.metrics.filter { $0.id != "runValuePer100" }
        let pools = Dictionary(uniqueKeysWithValues: metrics.map { field in
            (field.id, lines.values.filter { $0.count >= 10 }.compactMap { $0.values[field.id] })
        })
        let featured = ["pitches", "pa", "avg", "obp", "slg", "whiffPct", "hr", "avgEv", "hardHitPct"]
        let summary = featured.compactMap { key -> ResearchToolValues.Value? in
            guard let metric = metrics.first(where: { $0.id == key }) else { return nil }
            return .init(label: metric.label, text: metric.format(totals.values[metric.id]))
        }
        ResearchToolValues(items: summary)
        Menu {
            Picker("Pitch sort", selection: $sort) {
                Text("Pitch type").tag("pitch")
                ForEach(metrics) { Text($0.label).tag($0.id) }
            }
            Toggle("Ascending", isOn: $ascending)
        } label: { Label("Sort pitches", systemImage: "arrow.up.arrow.down") }
        ForEach(ordered(lines), id: \.self) { code in
            if let line = lines[code] {
                DisclosureGroup {
                    ResearchToolValues(items: metrics.map { metric in
                        let value = line.values[metric.id]
                        let highlight = line.count >= 10 && !metrics.prefix(10).contains { $0.id == metric.id }
                        let tone = value.flatMap { highlight ? profileHeat($0, pool: pools[metric.id] ?? [],
                            lower: metric.lowerIsBetter, scheme: scheme) : nil }
                        return .init(label: metric.label, text: metric.format(value), tone: tone)
                    })
                    .padding(.bottom, 8)
                } label: {
                    HStack {
                        DugoutProfilePitchBadge(pitch: profile.pitch(code))
                        Spacer()
                        Text("\(line.count) pitches").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Divider()
            }
        }
    }

    private func ordered(_ lines: [String: DugoutPitchLine]) -> [String] {
        lines.keys.sorted { a, b in
            if sort == "pitch" {
                return profile.pitch(a).label.localizedStandardCompare(profile.pitch(b).label) == (ascending ? .orderedAscending : .orderedDescending)
            }
            let lhs = lines[a]?.values[sort]
            let rhs = lines[b]?.values[sort]
            if lhs == rhs { return a < b }
            guard let lhs else { return false }
            guard let rhs else { return true }
            return ascending ? lhs < rhs : lhs > rhs
        }
    }

    private struct DateFilter: View {
        let title: String
        @Binding var date: Date?

        var body: some View {
            if let value = date {
                HStack {
                    DatePicker(title, selection: Binding(get: { date ?? value }, set: { date = $0 }), displayedComponents: .date)
                        .environment(\.timeZone, SlateDate.zone)
                    Button("Clear \(title.lowercased()) date", systemImage: "xmark.circle") { date = nil }.labelStyle(.iconOnly)
                }
            } else {
                Button("Add \(title.lowercased()) date", systemImage: "calendar.badge.plus") { date = .now }
            }
        }
    }
}

private struct DugoutProfileZoneScore: View {
    let api: DugoutPlayerProfileAPI
    let profile: DugoutProfile
    let myRows: [DugoutPlayerPitchLog.Row]
    let opponentID: Int
    let opponentName: String
    let pitcher: Bool
    @State private var log: DugoutPlayerPitchLog?
    @State private var failure: (any Error)?
    @State private var revision = 0

    var body: some View {
        ResearchToolCard(color: profile.accent) {
            ResearchSectionTitle(title: "Zone Score")
        } content: {
            Text("\(profile.name) vs. \(opponentName)").font(.subheadline.weight(.semibold))
            if let log {
                DugoutProfileZoneGrid(rows: myRows, opponentRows: log.rows, pitcher: pitcher)
            } else {
                ResearchToolMessage(title: "Opponent’s zone profile couldn’t load", error: failure) { revision += 1 }
            }
        }
        .task(id: revision) {
            do {
                let data = try await api.log(opponentID, kind: pitcher ? .batting : .pitching)
                try Task.checkCancellation()
                log = data
            } catch {
                if !Task.isCancelled { failure = error }
            }
        }
    }
}
