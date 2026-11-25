import SwiftUI

extension Brand {
    static func signal(_ value: Double?, for scheme: ColorScheme) -> Color {
        guard let value, value != 0 else { return .secondary }
        if value > 0 { return Color(rgb: scheme == .dark ? 0xB4FF4D : 0x356915) }
        return Color(rgb: scheme == .dark ? 0xFF868B : 0xA4253A)
    }
}

struct ResearchSampleBars: View {
    let labels: [String]
    let rates: [Double?]
    let counts: [String?]
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 9))
            : AnyLayout(HStackLayout(alignment: .bottom, spacing: 8))
        layout {
            ForEach(labels.indices, id: \.self) { index in
                let rate = rates.indices.contains(index) ? rates[index] : nil
                let count = counts.indices.contains(index) ? counts[index] : nil
                bar(label: labels[index], rate: rate, count: count)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Hit rates by sample")
    }

    private func bar(label: String, rate: Double?, count: String?) -> some View {
        let tone = Brand.signal(rate.map { $0 - 0.5 }, for: scheme)
        let formatted = rate.map { $0.formatted(.percent.precision(.fractionLength(0))) } ?? "—"
        return VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            Text(formatted).font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(tone)
                .contentTransition(reduceMotion ? .identity : .numericText())
            GeometryReader { proxy in
                Capsule().fill(tone.opacity(0.2)).overlay(alignment: .leading) {
                    if let rate {
                        Capsule().fill(tone).frame(width: proxy.size.width * min(1, max(0, rate)))
                    }
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
            if let count {
                Text(count).font(.caption2).foregroundStyle(.secondary).monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: rate)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(rate == nil ? "unavailable" : formatted)" + (count.map { ", " + $0 } ?? ""))
    }
}
