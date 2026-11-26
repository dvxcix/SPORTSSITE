import SwiftUI

private struct CourtShotSample: Decodable {
    struct Shot: Decodable, Identifiable {
        let gameId: Int
        let order: Int
        let playerId: Int
        let teamId: Int
        let period: Int
        let clock: String
        let text: String
        let made: Bool
        let points: Int
        let x: Double?
        let y: Double?
        let halfCourt: Bool
        var id: Int { order }
        var periodLabel: String { period > 4 ? "OT\(period - 4)" : "Q\(period)" }
        var coordinate: CGPoint? {
            guard halfCourt, let x, let y, (0...50).contains(x), (-5.25...41.75).contains(y) else { return nil }
            return CGPoint(x: x, y: y + 5.25)
        }
    }

    let gameId: Int
    let playerId: Int
    let shots: [Shot]
    let boxScoreAttempts: Int?
    let coverageMatches: Bool?
    let fetchedAt: String?
    let stale: Bool?
}

struct CourtShotView: View {
    private enum Result: String, CaseIterable { case all = "Made + missed", made = "Made", missed = "Missed" }
    private enum Style { case shots, heat }
    private struct Request: Equatable { let played: Int; let revision: Int }

    let api: CourtToolAPI
    let player: CourtBoard.Player
    let game: CourtBoard.Game
    let mode: CourtResearchMode
    var embedded = false
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var played = ""
    @State private var period = 0
    @State private var result = Result.all
    @State private var points = 0
    @State private var style = Style.shots
    @State private var selected: Int?
    @State private var retry = 0
    @State private var sample: (Request, CourtShotSample)?
    @State private var failure: (Request, any Error)?

    private var completed: [CourtBoard.PlayerLog.LoggedGame] {
        var seen = Set<Int>()
        return (player.logs ?? []).filter {
            $0.played && ($0.game.season ?? 0) >= 2025 && ($0.game.statusState == "final" || $0.game.status == "Final")
        }.map(\.game).sorted { ($0.date, $0.id) > ($1.date, $1.id) }.filter { seen.insert($0.id).inserted }
    }

    var body: some View {
        let candidates = completed
        let current = candidates.first(where: { String($0.id) == played }) ?? candidates.first
        let request = Request(played: current?.id ?? 0, revision: retry)
        Group {
            if embedded {
                shotContent(candidates, request: request)
            } else {
                ScrollView {
                    shotContent(candidates, request: request).padding(16)
                }
                .navigationTitle("Shot map")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: request) {
            if request.played > 0 { await load(request) }
        }
        .onChange(of: request.played) { selected = nil; period = 0 }
        .onChange(of: period) { selected = nil }
        .onChange(of: result) { selected = nil }
        .onChange(of: points) { selected = nil }
        .sensoryFeedback(.selection, trigger: selected)
    }

    private func shotContent(_ candidates: [CourtBoard.PlayerLog.LoggedGame], request: Request) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            if !embedded {
                CourtPlayerIdentity(player: player)
            }
            if request.played > 0 {
                filters(candidates, current: request.played, data: sample.flatMap { $0.0 == request ? $0.1 : nil })
                if let sample, sample.0 == request {
                    chart(sample.1)
                } else {
                    ResearchToolMessage(title: mode == .pregame ? "Pregame shot sample unavailable" : "Shot locations couldn’t load",
                        error: failure.flatMap { $0.0 == request ? $0.1 : nil }) { retry += 1 }
                }
            } else {
                ContentUnavailableView("No completed games with shot data", systemImage: "scope")
            }
        }
    }

    private func filters(_ games: [CourtBoard.PlayerLog.LoggedGame], current: Int, data: CourtShotSample?) -> some View {
        let periods = Set([1, 2, 3, 4] + (data?.shots.map(\.period) ?? [])).sorted()
        return VStack(alignment: .leading, spacing: 7) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchArtworkPicker(title: "Shot chart game", options: games.map { game in
                        .init(id: String(game.id), title: shotDate(game.date), icon: "calendar")
                    }, selection: Binding(get: { String(current) }, set: { played = $0 }))
                    ResearchToolFilter(title: "Period", symbol: "clock", selection: periodText(period)) {
                        Picker("Period", selection: $period) {
                            Text("All periods").tag(0)
                            ForEach(periods, id: \.self) { Text(periodText($0)).tag($0) }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 4) { resultFilters }
                VStack(alignment: .leading, spacing: 4) { resultFilters }
            }
        }
    }

    @ViewBuilder
    private var resultFilters: some View {
        ResearchToolFilter(title: "Result", symbol: "target", selection: result.rawValue) {
            Picker("Result", selection: $result) { ForEach(Result.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
        }
        ResearchToolFilter(title: "Shot value", symbol: "basketball", selection: points == 0 ? "Twos + threes" : "\(points)-pointers") {
            Picker("Shot value", selection: $points) {
                Text("Twos + threes").tag(0)
                Text("Two-pointers").tag(2)
                Text("Three-pointers").tag(3)
            }
        }
        Picker("Shot display", selection: $style) {
            Text("Shots").tag(Style.shots)
            Text("Heatmap").tag(Style.heat)
        }
        .pickerStyle(.segmented)
    }

    private func chart(_ sample: CourtShotSample) -> some View {
        let shots = sample.shots.filter { shot in
            (period == 0 || shot.period == period) && (result == .all || shot.made == (result == .made)) &&
                (points == 0 || shot.points == points)
        }
        let located = shots.filter { $0.coordinate != nil }
        let made = shots.filter(\.made).count
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        return VStack(alignment: .leading, spacing: 11) {
            ResearchToolCard(color: colors.primary) {
                ResearchToolValues(items: [
                    .init(label: "Field goals", text: "\(made)/\(shots.count)"),
                    .init(label: "FG%", text: shots.isEmpty ? "—" : (Double(made) / Double(shots.count)).formatted(.percent.precision(.fractionLength(0)))),
                    .init(label: "Located", text: located.count.formatted()),
                ])
            } content: {
                CourtHalfCourt(shots: located, selected: selected, heat: style == .heat, color: colors.primary) { selected = $0 }
                HStack(spacing: 15) {
                    Label("Made", systemImage: "circle.fill").foregroundStyle(Brand.signal(1, for: scheme))
                    Label("Missed", systemImage: "circle").foregroundStyle(Brand.signal(-1, for: scheme))
                }
                .font(.caption.weight(.semibold))
                if shots.count != located.count {
                    Text("\(shots.count - located.count) attempts without a half-court location").font(.caption).foregroundStyle(.secondary)
                }
                if sample.coverageMatches == false || sample.stale == true {
                    let coverage = sample.boxScoreAttempts.map(String.init) ?? "—"
                    Text(sample.stale == true ? "Last available shot sample" : "Partial feed · \(sample.shots.count)/\(coverage) recorded attempts")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let detail = shots.first(where: { $0.order == selected }) {
                    shotDescription(detail).padding(.vertical, 3)
                }
            }
            if shots.isEmpty {
                ContentUnavailableView("No shots match these filters", systemImage: "basketball")
            } else {
                DisclosureGroup("Browse \(shots.count) shots") {
                    ForEach(shots) { shot in
                        Button { selected = shot.order } label: {
                            shotDescription(shot)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityAddTraits(selected == shot.order ? .isSelected : [])
                    }
                }.font(.subheadline.weight(.semibold))
            }
        }
    }

    private func shotDescription(_ shot: CourtShotSample.Shot) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: shot.made ? "circle.fill" : "circle")
                .foregroundStyle(Brand.signal(shot.made ? 1 : -1, for: scheme))
                .font(.caption)
                .accessibilityLabel(shot.made ? "Made" : "Missed")
            VStack(alignment: .leading, spacing: 3) {
                Text("\(shot.periodLabel) · \(shot.clock)").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(shot.text).font(.subheadline)
            }
        }
    }

    private func shotDate(_ date: String) -> String {
        let day = String(date.prefix(10))
        return SlateDate.fromKey(day).map { SlateDate.label($0, year: true) } ?? day
    }

    private func periodText(_ number: Int) -> String {
        number == 0 ? "All periods" : number <= 4 ? "Quarter \(number)" : "Overtime \(number - 4)"
    }

    private func load(_ request: Request) async {
        do {
            let data = try await api.read(CourtShotSample.self, tool: "shots", publicPath: "/the-paint/shots", query: [
                .init(name: "game", value: String(request.played)), .init(name: "player", value: String(player.id)),
                .init(name: "researchGame", value: String(game.id)), .init(name: "mode", value: mode.rawValue),
            ])
            guard data.gameId == request.played, data.playerId == player.id,
                  data.shots.allSatisfy({ $0.gameId == request.played && $0.playerId == player.id }) else {
                throw URLError(.cannotParseResponse)
            }
            guard !Task.isCancelled else { return }
            sample = (request, data)
            failure = nil
        } catch { if !Task.isCancelled { failure = (request, error) } }
    }
}

private struct CourtHalfCourt: View {
    let shots: [CourtShotSample.Shot]
    let selected: Int?
    let heat: Bool
    let color: Color
    let choose: (Int) -> Void
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let factor = min(size.width / 50, size.height / 47)
            let transform = CGAffineTransform(a: factor, b: 0, c: 0, d: factor,
                tx: (size.width - 50 * factor) / 2, ty: (size.height - 47 * factor) / 2)
            Canvas { context, _ in
                let border = Path(roundedRect: CGRect(x: 0, y: 0, width: 50, height: 47), cornerRadius: 1)
                context.fill(border.applying(transform), with: .color(color.opacity(scheme == .dark ? 0.24 : 0.12)))
                if heat { drawHeat(context, transform: transform) }
                context.stroke(border.applying(transform), with: .color(.secondary.opacity(0.55)), lineWidth: 1)
                context.stroke(Self.lines.applying(transform), with: .color(slipPalette.text.opacity(0.59)), lineWidth: 1.15)
                if !heat {
                    for shot in shots {
                        guard let center = shot.coordinate?.applying(transform) else { continue }
                        let radius: CGFloat = shot.order == selected ? 6 : 4
                        let dot = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
                        let tone = Brand.signal(shot.made ? 1 : -1, for: scheme)
                        if shot.made { context.fill(dot, with: .color(tone)) }
                        context.stroke(dot, with: .color(shot.order == selected ? slipPalette.text : tone), lineWidth: shot.made ? 1 : 1.7)
                    }
                }
            }
            .contentShape(.rect)
            .gesture(SpatialTapGesture().onEnded { tap in
                guard !heat else { return }
                let candidates = shots.compactMap { shot -> (Int, CGFloat)? in
                    guard let point = shot.coordinate?.applying(transform) else { return nil }
                    return (shot.id, hypot(point.x - tap.location.x, point.y - tap.location.y))
                }
                if let choice = candidates.min(by: { $0.1 < $1.1 }), choice.1 <= 21 { choose(choice.0) }
            })
        }
        .aspectRatio(50.0 / 47.0, contentMode: .fit)
        .accessibilityLabel("Half-court \(heat ? "heatmap" : "shot map")")
        .accessibilityValue("\(shots.count) located attempts. Browse shots to select an attempt.")
    }

    private func drawHeat(_ context: GraphicsContext, transform: CGAffineTransform) {
        let bins = Dictionary(grouping: shots.compactMap(\.coordinate)) { value in
            [min(45, Int(value.x / 5) * 5), min(45, Int(value.y / 5) * 5)]
        }
        let most = max(1, bins.values.map(\.count).max() ?? 0)
        for (cell, points) in bins {
            let square = CGRect(x: cell[0], y: cell[1], width: 5, height: min(5, 47 - cell[1]))
            context.fill(Path(square).applying(transform),
                with: .color(slipPalette.accent.opacity(0.10 + Double(points.count) / Double(most) * 0.65)))
        }
    }

    private static let lines = Path { path in
        path.addLines([CGPoint(x: 17, y: 0), CGPoint(x: 17, y: 19), CGPoint(x: 33, y: 19), CGPoint(x: 33, y: 0)])
        path.addEllipse(in: CGRect(x: 19, y: 13, width: 12, height: 12))
        path.addEllipse(in: CGRect(x: 24.25, y: 4.5, width: 1.5, height: 1.5))
        path.move(to: CGPoint(x: 21, y: 4))
        path.addLine(to: CGPoint(x: 29, y: 4))
        path.move(to: CGPoint(x: 3, y: 0))
        for x in stride(from: 3.0, through: 47.0, by: 0.5) {
            let y = 5.25 + sqrt(23.75 * 23.75 - (x - 25) * (x - 25))
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: 47, y: 0))
    }
}
