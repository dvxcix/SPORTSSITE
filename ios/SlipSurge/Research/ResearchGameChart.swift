import Charts
import SwiftUI

struct ResearchGameChart: View {
    enum Result: String {
        case hit = "Hit", miss = "Miss", push = "Push", recorded = "Recorded"

        init(value: Double, line: Double?, under: Bool, milestone: Bool) {
            guard let line else { self = .recorded; return }
            if !milestone && line == value { self = .push; return }
            self = (milestone ? value >= line : under ? value < line : value > line) ? .hit : .miss
        }

        func color(for scheme: ColorScheme) -> Color {
            switch self {
            case .hit: Brand.signal(1, for: scheme)
            case .miss: Brand.signal(-1, for: scheme)
            case .push: .secondary
            case .recorded: Brand.accent(for: scheme)
            }
        }

        var plural: String {
            switch self {
            case .hit: "hits"
            case .miss: "misses"
            case .push: "pushes"
            case .recorded: "recorded"
            }
        }

        var icon: String {
            switch self {
            case .hit: "checkmark.circle.fill"
            case .miss: "xmark.circle.fill"
            case .push: "equal.circle.fill"
            case .recorded: "circle.fill"
            }
        }
    }

    struct Game: Identifiable, Equatable {
        let id: String
        let label: String
        let value: Double
        let result: Result
    }

    let games: [Game]
    let line: Double?
    let metric: String
    var showLog = true
    @State private var selected: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if games.isEmpty {
                Text("No recorded games for this sample.").font(.caption).foregroundStyle(.secondary)
            } else {
                if line != nil { sampleResults }
                chart
                if let selected, games.indices.contains(selected) {
                    gameRow(games[selected])
                        .transition(.opacity)
                } else if let line {
                    Label("\(metric) line \(line.formatted())", systemImage: "minus")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if showLog {
                    DisclosureGroup("Game log") {
                        VStack(spacing: 8) {
                            ForEach(games.reversed()) { game in
                                gameRow(game)
                            }
                        }
                        .padding(.top, 7)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 4)
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selected) { _, next in next != nil }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: selected)
        .onChange(of: games) { _, _ in selected = nil }
    }

    private var sampleResults: some View {
        let counts = Dictionary(grouping: games, by: \.result).mapValues(\.count)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 9) { resultCounts(counts) }
            VStack(alignment: .leading, spacing: 4) { resultCounts(counts) }
        }
        .font(.caption.weight(.semibold))
        .accessibilityElement(children: .combine)
    }

    private func resultCounts(_ counts: [Result: Int]) -> some View {
        ForEach([Result.hit, .miss, .push], id: \.self) { result in
            if let count = counts[result] {
                Label("\(count) \(count == 1 ? result.rawValue.lowercased() : result.plural)", systemImage: result.icon)
                    .foregroundStyle(result.color(for: scheme))
                    .monospacedDigit()
            }
        }
    }

    private var chart: some View {
        Chart {
            if let line {
                RuleMark(y: .value("Line", line))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .accessibilityLabel("\(metric) line \(line.formatted())")
            }
            ForEach(Array(games.enumerated()), id: \.element.id) { index, game in
                BarMark(x: .value("Game", index), y: .value(metric, game.value))
                    .cornerRadius(3)
                    .foregroundStyle(game.result.color(for: scheme).gradient)
                    .opacity(selected == nil || selected == index ? 1 : 0.42)
                    .accessibilityLabel(game.label)
                    .accessibilityValue("\(game.value.formatted()) \(metric), \(game.result.rawValue)")
                if game.value == 0 {
                    PointMark(x: .value("Game", index), y: .value(metric, game.value))
                        .foregroundStyle(game.result.color(for: scheme))
                        .symbolSize(19)
                        .accessibilityHidden(true)
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4))
        }
        .chartXSelection(value: $selected)
        .frame(height: 140)
        .accessibilityLabel("\(metric) by game, oldest to newest")
    }

    private func gameRow(_ game: Game) -> some View {
        HStack {
            Text(game.label).font(.subheadline)
            Spacer(minLength: 6)
            Text(game.value.formatted()).font(.subheadline.weight(.bold)).monospacedDigit()
            Label(game.result.rawValue, systemImage: game.result.icon)
                .font(.caption.weight(.semibold)).foregroundStyle(game.result.color(for: scheme))
        }
        .accessibilityElement(children: .combine)
    }
}
