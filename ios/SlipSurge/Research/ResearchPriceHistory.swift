import Charts
import SwiftUI

struct ResearchPriceHistory: View {
    private struct PriceObservation: Identifiable {
        let label: String
        let odds: Int?
        let date: Date?

        var id: String { label }
    }

    let price: ResearchOddsSlate.Price
    let live: Bool

    var body: some View {
        let observations = [
            PriceObservation(label: "Last observed", odds: price.current, date: price.observedAt),
            PriceObservation(label: "Earlier", odds: price.earlier, date: price.earlierAt),
            PriceObservation(label: OddsComparison.opening.label(live: live), odds: price.opening, date: price.openingAt)
        ]
        let samples = observations.compactMap { observation -> (Date, Int)? in
            guard let date = observation.date, let odds = observation.odds else { return nil }
            return (date, odds)
        }
        let unique = Dictionary(samples, uniquingKeysWith: { latest, _ in latest })
        let timeline = unique.keys.sorted()
        return List {
            Section {
                quoteObservation("Last observed", value: price.current, at: price.observedAt)
                if timeline.count > 1 {
                    PriceHistoryChart(timeline: timeline, prices: unique)
                }
                ForEach(observations.dropFirst()) { quoteObservation($0.label, value: $0.odds, at: $0.date) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private struct PriceHistoryChart: View {
        let timeline: [Date]
        let prices: [Date: Int]
        @Environment(\.colorScheme) private var scheme
        @State private var selectedCapture: Date?

        private var chartSelection: Binding<Date?> {
            Binding(get: { selectedCapture }, set: { date in
                guard let date else { return }
                selectedCapture = timeline.min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
            })
        }

        private var spansOneDay: Bool {
            guard let first = timeline.first, let last = timeline.last else { return false }
            return Calendar.current.isDate(first, inSameDayAs: last)
        }

        var body: some View {
            let selected = selectedCapture
            VStack(alignment: .leading, spacing: 8) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        chartTitle
                        Spacer(minLength: 0)
                        captureLabel(selected)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        chartTitle
                        captureLabel(selected)
                    }
                }
                chart(selected: selected)
            }
            .sensoryFeedback(.selection, trigger: selected) { _, date in date != nil }
        }

        private var chartTitle: some View {
            Text("Implied probability").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }

        @ViewBuilder
        private func captureLabel(_ date: Date?) -> some View {
            if let date, let odds = prices[date] {
                let style: Date.FormatStyle = spansOneDay ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day().hour().minute()
                Text("\(date.formatted(style)) · \(ResearchOddsBoard.price(odds))")
                    .font(.caption.weight(.semibold)).monospacedDigit()
                    .accessibilityHidden(true)
            }
        }

        private func chart(selected: Date?) -> some View {
            let probabilities = prices.values.map(ResearchOddsSlate.Price.implied)
            let lower = max(0, (probabilities.min() ?? 0) - 0.06)
            let upper = min(1, (probabilities.max() ?? 1) + 0.06)
            let dateFormat: Date.FormatStyle = spansOneDay ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day()
            let accent = Brand.accent(for: scheme)

            return Chart {
                if let selected {
                    RuleMark(x: .value("Selected observation", selected))
                        .foregroundStyle(.secondary.opacity(0.6))
                        .lineStyle(.init(lineWidth: 1, dash: [3, 3]))
                        .accessibilityHidden(true)
                }
                ForEach(timeline, id: \.self) { date in
                    if let odds = prices[date] {
                        let probability = ResearchOddsSlate.Price.implied(odds)
                        LineMark(x: .value("Observed at", date), y: .value("Implied probability", probability))
                            .interpolationMethod(.stepEnd)
                            .foregroundStyle(accent)
                            .accessibilityHidden(true)
                        PointMark(x: .value("Observed at", date), y: .value("Implied probability", probability))
                            .foregroundStyle(accent)
                            .symbolSize(selected == date ? 64 : 28)
                            .accessibilityLabel(date.formatted(date: .abbreviated, time: .shortened))
                            .accessibilityValue("\(ResearchOddsBoard.price(odds)), \(probability.formatted(.percent.precision(.fractionLength(1)))) implied probability")
                    }
                }
            }
            .chartXSelection(value: chartSelection)
            .chartGesture { proxy in
                SpatialTapGesture()
                    .onEnded { proxy.selectXValue(at: $0.location.x) }
                    .simultaneously(with: DragGesture(minimumDistance: 10).onChanged { drag in
                        guard abs(drag.translation.width) > abs(drag.translation.height) else { return }
                        proxy.selectXValue(at: drag.location.x)
                    })
            }
            .chartYScale(domain: lower...upper)
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let fraction = value.as(Double.self) { Text(fraction, format: .percent.precision(.fractionLength(0))) }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let date = value.as(Date.self) { Text(date, format: dateFormat) }
                    }
                }
            }
            .frame(height: 108)
            .padding(.vertical, 8)
        }
    }

    private func quoteObservation(_ label: String, value: Int?, at: Date?) -> some View {
        LabeledContent {
            Text(ResearchOddsBoard.price(value)).font(.headline).monospacedDigit()
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                if let at { Text(at.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}
