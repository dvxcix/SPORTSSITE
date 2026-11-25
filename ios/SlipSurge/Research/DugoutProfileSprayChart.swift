import SwiftUI

struct DugoutProfileSprayChart: View {
    typealias Row = DugoutPlayerPitchLog.Row

    private enum Result: String, CaseIterable {
        case all = "All contact"
        case homeRun = "Home runs"
        case near = "Near home runs"
        case hits = "Hits"
        case outs = "Outs"

        static func classify(_ row: Row) -> Self {
            if row.isHomeRun == true || row.events == "home_run" { return .homeRun }
            if row.isNearHr == true { return .near }
            if ["single", "double", "triple"].contains(row.events ?? "") { return .hits }
            return .outs
        }

        static func color(_ row: Row) -> Color {
            switch classify(row) {
            case .homeRun: Color(rgb: 0xA3FF3F)
            case .near: Color(rgb: 0xFF9F43)
            case .hits:
                if row.events == "triple" { Color(rgb: 0xD78CFF) }
                else if row.events == "double" { Color(rgb: 0x49A8FF) }
                else { Color(rgb: 0x30E6D0) }
            case .all, .outs: Color(rgb: 0xA6B0C4)
            }
        }
    }

    private struct Event: Identifiable {
        let id: Int
        let point: CGPoint
        let row: Row
    }

    let profile: DugoutProfile
    let log: DugoutPlayerPitchLog
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var park = ""
    @State private var window = 0
    @State private var result = Result.all
    @State private var hand = "all"
    @State private var pitch = "all"
    @State private var heat = false
    @State private var selection: Int?
    @State private var percent = 1.0

    var body: some View {
        let eligible = log.rows.enumerated().compactMap { index, row -> Event? in
            guard row.isInPlay == true, let x = row.hcX, let y = row.hcY, x.isFinite, y.isFinite else { return nil }
            return Event(id: index, point: CGPoint(x: x, y: y), row: row)
        }
        let groups = Dictionary(grouping: eligible, by: { $0.row.parkKey ?? "" })
        let parks = groups.keys.sorted { (groups[$0]?.count ?? 0) > (groups[$1]?.count ?? 0) }
        let chosen = parks.contains(park) ? park : parks.first ?? ""
        let venue = log.parks?[chosen]
        let events = groups[chosen] ?? []
        let filtered = filtered(events)
        let selected = filtered.first { $0.id == selection } ?? filtered.first { Result.classify($0.row) == .homeRun } ?? filtered.first
        ResearchToolCard(color: venue?.team?.color ?? profile.accent) {
            ResearchSectionTitle(title: "Spray Chart")
        } content: {
            if eligible.isEmpty {
                ContentUnavailableView("No recorded landing points", systemImage: "baseball.diamond")
            } else {
                ResearchArtworkPicker(title: "Ballpark", options: parks.map { key in
                    let details = log.parks?[key]
                    return .team(id: key, title: details?.name ?? "Unknown venue", logo: details?.team?.logo)
                }, selection: Binding(get: { chosen }, set: { new in
                    park = new
                    pitch = "all"
                    selection = nil
                }))
                filters(events)
                ResearchToolValues(items: [
                    .init(label: "Batted balls", text: filtered.count.formatted()),
                    .init(label: "Home runs", text: filtered.filter { Result.classify($0.row) == .homeRun }.count.formatted()),
                    .init(label: "Near home runs", text: log.nearHrAvailable ? filtered.filter { Result.classify($0.row) == .near }.count.formatted() : "—"),
                ])
                if filtered.isEmpty {
                    Text("No recorded contact matches these filters").font(.caption).foregroundStyle(.secondary)
                }
                field(venue, events: filtered, selected: selected)
                if let selected {
                    eventDetails(selected)
                    DisclosureGroup("Browse \(filtered.count) batted balls") {
                        ForEach(filtered) { event in
                            Button { choose(event) } label: {
                                let row = event.row
                                DugoutOpponentArtwork(name: row.events.map(dugoutProfileWord) ?? "Ball in play",
                                    subtitle: "\(row.gameDate) · \(row.opponentName)",
                                    headshot: log.opponents[String(row.opponentId)],
                                    logo: row.opponentTeam.flatMap { profile.teams[$0]?.logo })
                            }
                            .buttonStyle(SlipSurgePressStyle())
                            .accessibilityAddTraits(selected.id == event.id ? .isSelected : [])
                        }
                    }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func filters(_ events: [Event]) -> some View {
        DisclosureGroup("Filters") {
            VStack(alignment: .leading, spacing: 5) {
                Picker("Games at this park", selection: $window) {
                    Text("Season").tag(0)
                    ForEach([10, 5, 3, 1], id: \.self) { Text($0 == 1 ? "Last game" : "Last \($0) games").tag($0) }
                }
                Picker("Result", selection: $result) {
                    ForEach(Result.allCases.filter { $0 != .near || log.nearHrAvailable }, id: \.self) { Text($0.rawValue).tag($0) }
                }
                Picker("Pitcher hand", selection: $hand) {
                    Text("Both hands").tag("all")
                    Text("Left").tag("L")
                    Text("Right").tag("R")
                }
                Picker("Pitch type", selection: $pitch) {
                    Text("All pitches").tag("all")
                    ForEach(Set(events.compactMap { $0.row.pitchType }).sorted(), id: \.self) { code in
                        DugoutProfilePitchBadge(pitch: profile.pitch(code)).tag(code)
                    }
                }
                Picker("Chart mode", selection: $heat) {
                    Text("Spray").tag(false)
                    Text("Heat").tag(true)
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private func filtered(_ candidates: [Event]) -> [Event] {
        var gameIDs: Set<String> = []
        for event in candidates {
            if window > 0 && gameIDs.count >= window { break }
            if let key = event.row.gamePk.text { gameIDs.insert(key) }
        }
        return candidates.filter { event in
            let row = event.row
            return (window == 0 || row.gamePk.text.map(gameIDs.contains) == true)
                && (result == .all || Result.classify(row) == result)
                && (hand == "all" || hand == row.pThrows) && (pitch == "all" || pitch == row.pitchType)
        }
    }

    private func field(_ park: DugoutPlayerPitchLog.Park?, events: [Event], selected: Event?) -> some View {
        GeometryReader { proxy in
            let bounds = park?.shape?.bounds ?? CGRect(x: 0, y: 0, width: 250, height: 250)
            let transform = DugoutParkField.transform(bounds: bounds, in: proxy.size)
            let team = park?.team ?? .init(code: "MLB", name: "MLB", score: nil, logo: nil, primary: "#263149", secondary: "#91A0BA")
            ZStack {
                if let logo = team.logo {
                    ResearchArtwork(urls: [logo], fallback: "baseball.diamond").frame(width: 125, height: 125).opacity(0.20)
                }
                DugoutParkField(shape: park?.shape, team: team)
                Canvas { context, _ in
                    for event in events {
                        let point = event.point.applying(transform)
                        let color = Result.color(event.row)
                        let radius = selected?.id == event.id ? 5.5 : 3.3
                        if heat {
                            context.fill(circle(point, radius: 12), with: .radialGradient(
                                Gradient(colors: [color.opacity(0.48), .clear]), center: point, startRadius: 0, endRadius: 12))
                        }
                        context.fill(circle(point, radius: radius), with: .color(color))
                        if selected?.id == event.id {
                            context.stroke(circle(point, radius: radius), with: .color(.white), lineWidth: 1.25)
                        }
                    }
                }
                if let selected {
                    let destination = selected.point.applying(transform)
                    Path { path in
                        path.move(to: CGPoint(x: 125, y: 203).applying(transform))
                        path.addQuadCurve(to: destination, control: CGPoint(x: 125, y: max(25, selected.point.y - 53)).applying(transform))
                    }
                    .trim(from: 0, to: percent)
                    .stroke(Result.color(selected.row).opacity(0.75), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    .allowsHitTesting(false)
                }
            }
            .contentShape(.rect)
            .gesture(SpatialTapGesture().onEnded { tap in
                let match = events.compactMap { event -> (Event, CGFloat)? in
                    let point = event.point.applying(transform)
                    let distance = hypot(tap.location.x - point.x, tap.location.y - point.y)
                    return distance <= 23 ? (event, distance) : nil
                }.min { $0.1 < $1.1 }
                if let match { choose(match.0) }
            })
        }
        .frame(height: 232)
        .background(.black.opacity(0.16), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Spray chart at \(park?.name ?? "this ballpark")")
        .accessibilityValue("\(events.count) recorded batted balls. Use Browse batted balls to select details.")
    }

    private func circle(_ point: CGPoint, radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
    }

    private func choose(_ event: Event) {
        selection = event.id
        if !reduceMotion {
            percent = 0
            withAnimation(.easeOut(duration: 0.35)) { percent = 1 }
        }
    }

    private func eventDetails(_ event: Event) -> some View {
        let row = event.row
        return VStack(alignment: .leading, spacing: 7) {
            DugoutOpponentArtwork(name: row.events.map(dugoutProfileWord) ?? "Ball in play",
                subtitle: "\(row.gameDate) · vs. \(row.opponentName)", headshot: log.opponents[String(row.opponentId)],
                logo: row.opponentTeam.flatMap { profile.teams[$0]?.logo })
            if let pitch = row.pitchType { DugoutProfilePitchBadge(pitch: profile.pitch(pitch)) }
            ResearchToolValues(items: [
                .init(label: "Exit velocity", text: ResearchFormat.decimal(row.launchSpeed, suffix: " mph")),
                .init(label: "Launch angle", text: ResearchFormat.decimal(row.launchAngle, suffix: "°")),
                .init(label: "Distance", text: ResearchFormat.decimal(row.hitDistance, suffix: " ft")),
                .init(label: "HR parks", text: row.parksHrCount?.formatted() ?? "—"),
            ])
        }
    }
}
