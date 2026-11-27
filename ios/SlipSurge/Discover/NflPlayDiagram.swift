import SwiftUI

struct NflPlayDiagram: View {
    let entry: GameTimeline.Entry
    let game: Scoreboard.Match
    var showsEarlierPlay = false
    var autoPlay = true

    @Environment(\.slipPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .footnote) private var fieldHeight = 112.0
    @State private var progress = 1.0
    @State private var replay = 0

    private var field: GameCenterData.Play.Field? {
        guard let field = entry.play.field, field.valid else { return nil }
        return field
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(showsEarlierPlay ? "Last mapped play" : "Play diagram")
                        .font(.subheadline.bold()).accessibilityAddTraits(.isHeader)
                    let moment = [entry.play.period, entry.play.clock].compactMap { $0 }.joined(separator: " · ")
                    if !moment.isEmpty {
                        Text(moment).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 6)
                if let field, field.yards != 0, !reduceMotion {
                    Button("Replay", systemImage: "play.fill") { replay += 1 }
                        .font(.caption.bold())
                        .buttonStyle(.bordered).buttonBorderShape(.capsule)
                        .frame(minHeight: 44)
                        .accessibilityLabel("Replay play diagram")
                }
            }
            if let field {
                Field(widthProgress: progress, play: field)
                    .frame(height: min(fieldHeight, 155))
                    .accessibilityHidden(true)
                spotReadout(field)
            }
            HStack(spacing: 9) {
                if let person = entry.person { participant(person) }
                if let person = entry.secondary, person != entry.person { participant(person) }
                if entry.person == nil, let team = playTeam {
                    ResearchArtwork(urls: game.logo(for: team).map { [$0] } ?? [], fallback: "shield")
                        .frame(width: 34, height: 34).accessibilityLabel(team.name)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.headline).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                    if let field {
                        Text(field.yards == 0 ? "No gain" : field.yards > 0 ? "\(field.yards) yd gain" : "\(-field.yards) yd loss")
                            .font(.caption.weight(.semibold)).foregroundStyle(palette.accent)
                    } else {
                        Text("Field positions unavailable").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surface, in: .rect(cornerRadius: 17))
        .overlay { RoundedRectangle(cornerRadius: 17).strokeBorder(palette.accent.opacity(0.2)).allowsHitTesting(false) }
        .task(id: AnimationKey(play: entry.id, field: field, replay: replay, reduceMotion: reduceMotion)) {
            if reduceMotion || field?.yards == 0 || (!autoPlay && replay == 0) {
                progress = 1
                return
            }
            progress = 0
            do { try await Task.sleep(for: .milliseconds(80)) } catch { return }
            withAnimation(.easeInOut(duration: 0.56)) { progress = 1 }
        }
        .onChange(of: entry.id) { replay = 0 }
    }

    private var playTeam: Scoreboard.Match.Team? {
        [game.away, game.home].first { $0.id == entry.play.teamId }
    }

    private func spotReadout(_ field: GameCenterData.Play.Field) -> some View {
        let start = yardLine(field.startToGoal)
        let end = yardLine(field.endToGoal)
        let spot = Text(field.yards == 0 ? start : "\(start) → \(end)")
            .fontWeight(.semibold)
            .accessibilityLabel(field.yards == 0 ? "Ball at \(start)" : "Ball moved from \(start) to \(end)")
        return ViewThatFits(in: .horizontal) {
            HStack {
                downAndDistance(field).fixedSize()
                Spacer(minLength: 9)
                spot.fixedSize()
            }
            VStack(alignment: .leading, spacing: 3) {
                downAndDistance(field)
                spot
            }
        }
        .font(.caption).foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func downAndDistance(_ field: GameCenterData.Play.Field) -> some View {
        if let down = field.down, (1...4).contains(down), let distance = field.distance {
            Text("\(down)\(suffix(down)) & \(distance)")
        }
    }

    private func yardLine(_ yardsToGoal: Int) -> String {
        if yardsToGoal == 50 { return "Midfield" }
        guard let offense = playTeam else { return "\(yardsToGoal) yd to goal" }
        let defense = offense.id == game.away.id ? game.home : game.away
        if yardsToGoal == 0 { return "\(defense.abbreviation) end zone" }
        if yardsToGoal == 100 { return "\(offense.abbreviation) end zone" }
        return yardsToGoal > 50 ? "\(offense.abbreviation) \(100 - yardsToGoal)" : "\(defense.abbreviation) \(yardsToGoal)"
    }

    private func participant(_ person: GameTimeline.Person) -> some View {
        let team = [game.away, game.home].first { $0.abbreviation == person.team } ?? playTeam
        return HStack {
            PlayerArtwork(portraits: person.portrait.map { [$0] } ?? [],
                          logo: team.flatMap(game.logo(for:)),
                          primary: Color(hex: team?.color) ?? palette.accent,
                          secondary: Color(hex: team?.secondary) ?? palette.surface, size: 37)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(person.name)
    }

    private func suffix(_ down: Int) -> String {
        switch down {
        case 1: "st"
        case 2: "nd"
        case 3: "rd"
        default: "th"
        }
    }

    private struct AnimationKey: Equatable {
        let play: String
        let field: GameCenterData.Play.Field?
        let replay: Int
        let reduceMotion: Bool
    }

    private struct Field: View {
        let widthProgress: Double
        let play: GameCenterData.Play.Field

        var body: some View {
            GeometryReader { proxy in
                let coordinate: (Int) -> CGFloat = { proxy.size.width * (0.06 + 0.88 * (1 - CGFloat($0) / 100)) }
                let start = coordinate(play.startToGoal)
                let end = coordinate(play.endToGoal)
                let y = proxy.size.height * 0.53
                ZStack(alignment: .topLeading) {
                    Canvas { context, size in
                        var grid = Path()
                        let chalk = Color.white.opacity(0.56)
                        for yard in 0...100 {
                            let x = coordinate(yard)
                            if yard.isMultiple(of: 5) {
                                grid.move(to: CGPoint(x: x, y: 0))
                                grid.addLine(to: CGPoint(x: x, y: size.height))
                            } else {
                                for band in [0.35, 0.71] {
                                    grid.move(to: CGPoint(x: x, y: size.height * band - 2))
                                    grid.addLine(to: CGPoint(x: x, y: size.height * band + 2))
                                }
                            }
                            if yard.isMultiple(of: 10), (10...90).contains(yard) {
                                let label = Text(min(yard, 100 - yard).formatted()).font(.caption2.bold()).foregroundStyle(chalk)
                                context.draw(label, at: CGPoint(x: x, y: size.height * 0.88))
                            }
                        }
                        context.stroke(grid, with: .color(.white.opacity(0.22)), lineWidth: 1)
                    }
                    .background(LinearGradient(colors: [Color(rgb: 0x17472A), Color(rgb: 0x0A2B22)],
                                               startPoint: .topLeading, endPoint: .bottomTrailing))
                    if let first = play.firstDownToGoal {
                        Rectangle().fill(Color(rgb: 0xFBD369).opacity(0.82))
                            .frame(width: 2).position(x: coordinate(first), y: proxy.size.height / 2)
                    }
                    Rectangle().fill(Color(rgb: 0x71D8FF).opacity(0.84))
                        .frame(width: 2).position(x: start, y: proxy.size.height / 2)
                    Path { line in
                        line.move(to: CGPoint(x: start, y: y))
                        line.addLine(to: CGPoint(x: end, y: y))
                    }
                    .trim(from: 0, to: widthProgress)
                    .stroke(Color(rgb: 0xA8F8C2), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    Circle().fill(Color(rgb: 0xC5FFD6)).frame(width: 9, height: 9)
                        .position(x: start + (end - start) * widthProgress, y: y)
                }
                .clipShape(.rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.2)) }
            }
        }
    }
}
