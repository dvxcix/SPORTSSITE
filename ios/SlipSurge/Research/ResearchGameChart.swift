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

        func color(in palette: SlipPalette) -> Color {
            switch self {
            case .hit: Brand.signal(1, for: palette.colorScheme)
            case .miss: Brand.signal(-1, for: palette.colorScheme)
            case .push: .secondary
            case .recorded: palette.accent
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
    let showLog: Bool
    let isExpanded: Bool
    @State private var inspectedID: Game.ID?
    @State private var showAverage = false
    @State private var showInspector = false
    @State private var showGameLog: Bool
    @Environment(\.slipPalette) private var slipPalette

    init(games: [Game], line: Double?, metric: String, showLog: Bool = true, isExpanded: Bool = false,
         inspectedID: Game.ID? = nil, showAverage: Bool = false) {
        self.games = games
        self.line = line
        self.metric = metric
        self.showLog = showLog
        self.isExpanded = isExpanded
        _inspectedID = State(initialValue: inspectedID)
        _showAverage = State(initialValue: showAverage)
        _showGameLog = State(initialValue: isExpanded)
    }

    private var selected: Int? {
        games.firstIndex { $0.id == inspectedID }
    }

    private var selection: Binding<Int?> {
        Binding(get: { selected }, set: { index in
            // Charts sends nil when a drag finishes. Preserve the inspected game.
            if let index, games.indices.contains(index) { inspectedID = games[index].id }
        })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if games.isEmpty {
                Text("No recorded games for this sample.").font(.caption).foregroundStyle(.secondary)
            } else {
                if line != nil { sampleResults }
                if !isExpanded || games.count >= 3 { chartControls }
                chart
                if let sample = games.first { selectionReadout(sizingFrom: sample) }
                if showLog {
                    DisclosureGroup("Game log", isExpanded: $showGameLog) {
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
        .sensoryFeedback(.selection, trigger: inspectedID) { _, next in next != nil }
        .onChange(of: games) {
            if selected == nil { inspectedID = nil }
        }
        .sheet(isPresented: $showInspector) {
            NavigationStack {
                ScrollView {
                    ResearchGameChart(games: games, line: line, metric: metric, isExpanded: true,
                                      inspectedID: inspectedID, showAverage: showAverage)
                        .padding(16).frame(maxWidth: 680).frame(maxWidth: .infinity)
                }
                .background(slipPalette.background)
                .navigationTitle(metric)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close chart", systemImage: "xmark") { showInspector = false }.labelStyle(.iconOnly)
                    }
                }
            }
            .presentationDragIndicator(.visible)
        }
    }

    private var chartControls: some View {
        HStack(spacing: 9) {
            if games.count >= 3 {
                Toggle("3-game average", systemImage: "chart.line.uptrend.xyaxis", isOn: $showAverage)
                    .toggleStyle(.button).controlSize(.small).frame(minHeight: 44)
            }
            Spacer(minLength: 0)
            if !isExpanded {
                Button("Expand chart", systemImage: "arrow.up.left.and.arrow.down.right") { showInspector = true }
                    .labelStyle(.iconOnly).buttonStyle(.bordered).buttonBorderShape(.circle)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
        .font(.caption.weight(.semibold))
    }

    private func selectionReadout(sizingFrom sample: Game) -> some View {
        ZStack(alignment: .leading) {
            gameRow(sample).hidden().accessibilityHidden(true)
            if let selected, games.indices.contains(selected) {
                HStack(spacing: 5) {
                    gameRow(games[selected])
                    Button("Clear selected game", systemImage: "xmark.circle.fill") { inspectedID = nil }
                        .labelStyle(.iconOnly).buttonStyle(.plain).frame(width: 44, height: 44)
                        .foregroundStyle(.secondary)
                }
            } else if let line {
                Label("\(metric) line \(line.formatted())", systemImage: "minus")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(minHeight: 44)
        .lineLimit(1)
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
                    .foregroundStyle(result.color(in: slipPalette))
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
                    .foregroundStyle(game.result.color(in: slipPalette).gradient)
                    .opacity(selected == nil || selected == index ? 1 : 0.42)
                    .accessibilityLabel(game.label)
                    .accessibilityValue("\(game.value.formatted()) \(metric), \(game.result.rawValue)")
                if game.value == 0 {
                    PointMark(x: .value("Game", index), y: .value(metric, game.value))
                        .foregroundStyle(game.result.color(in: slipPalette))
                        .symbolSize(19)
                        .accessibilityHidden(true)
                }
            }
            if showAverage {
                ForEach(games.indices.dropFirst(2), id: \.self) { index in
                    let average = games[(index - 2)...index].map(\.value).reduce(0, +) / 3
                    LineMark(x: .value("Game", index), y: .value("3-game average", average))
                        .foregroundStyle(slipPalette.text)
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [3, 3]))
                        .symbolSize(18)
                        .accessibilityLabel("\(games[index].label), 3-game average")
                        .accessibilityValue(average.formatted(.number.precision(.fractionLength(0...2))))
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4))
        }
        .chartXSelection(value: selection)
        .frame(height: isExpanded ? 260 : 140)
        .accessibilityLabel("\(metric) by game, oldest to newest")
    }

    private func gameRow(_ game: Game) -> some View {
        HStack {
            Text(game.label).font(.subheadline)
            Spacer(minLength: 6)
            Text(game.value.formatted()).font(.subheadline.weight(.bold)).monospacedDigit()
            Label(game.result.rawValue, systemImage: game.result.icon)
                .font(.caption.weight(.semibold)).foregroundStyle(game.result.color(in: slipPalette))
        }
        .accessibilityElement(children: .combine)
    }
}
