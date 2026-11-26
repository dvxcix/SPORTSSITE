import Charts
import SwiftUI

struct GameScoreTrend: View {
    let game: Scoreboard.Match
    let plays: [GameCenterData.Play]
    @Environment(\.colorScheme) private var scheme
    @State private var highlighted: Int?

    private struct Point: Identifiable {
        let id: String
        let period: String
        let clock: String
        let home: Int
        let away: Int

        var margin: Int { home - away }
    }

    private var points: [Point] {
        var previous: (Int, Int)?
        return plays.reversed().compactMap { play in
            guard play.scoring, let home = play.home, let away = play.away,
                  previous?.0 != home || previous?.1 != away else { return nil }
            previous = (home, away)
            return Point(id: play.id, period: play.period ?? "", clock: play.clock ?? "", home: home, away: away)
        }
    }

    var body: some View {
        let samples = points
        if samples.count >= 2 {
            VStack(alignment: .leading, spacing: 8) {
                Text("Scoring run").font(.headline).accessibilityAddTraits(.isHeader)
                if let selected = highlighted, samples.indices.contains(selected) {
                    let sample = samples[selected]
                    Text("\(sample.period) \(sample.clock) · \(game.away.abbreviation) \(sample.away) – \(game.home.abbreviation) \(sample.home)")
                        .font(.caption.weight(.semibold)).monospacedDigit()
                } else {
                    Text("Score margin at recent scoring plays")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Chart {
                    RuleMark(y: .value("Tied", 0)).foregroundStyle(.secondary.opacity(0.6))
                    ForEach(Array(samples.enumerated()), id: \.element.id) { index, play in
                        let leading = play.margin >= 0 ? game.home.abbreviation : game.away.abbreviation
                        BarMark(x: .value("Score", index), y: .value("Margin", play.margin))
                            .cornerRadius(3)
                            .foregroundStyle(play.margin >= 0 ? Brand.accent(for: scheme) : Color.blue)
                            .opacity(highlighted == nil || highlighted == index ? 1 : 0.45)
                            .accessibilityLabel("\(play.period), \(play.clock)")
                            .accessibilityValue(play.margin == 0 ? "Tied" : "\(leading) leads by \(abs(play.margin))")
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) }
                .chartXSelection(value: $highlighted)
                .frame(height: 103)
                HStack {
                    Label(game.home.abbreviation + " lead", systemImage: "circle.fill").foregroundStyle(Brand.accent(for: scheme))
                    Spacer()
                    Label(game.away.abbreviation + " lead", systemImage: "circle.fill").foregroundStyle(.blue)
                }
                .font(.caption2.weight(.semibold))
            }
            .padding(12)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
            .onChange(of: samples.map(\.id)) { _, _ in highlighted = nil }
        }
    }
}
