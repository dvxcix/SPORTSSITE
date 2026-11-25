import Charts
import SwiftUI

struct MlbPitchDetailsView: View {
    let pitches: [GameCenterData.Play.Pitch]
    let title: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selected: Int?

    private var active: GameCenterData.Play.Pitch? { pitches.first { $0.id == selected } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if pitches.contains(where: { $0.x != nil && $0.z != nil }) { zone }
                Text("Pitches").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                ForEach(pitches) { pitch in
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { selected = pitch.id }
                    } label: {
                        pitchRow(pitch)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityAddTraits(selected == pitch.id ? .isSelected : [])
                }
            }.padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if selected == nil { selected = pitches.last?.id }
        }
    }

    private var zone: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("Pitch locations", systemImage: "scope").font(.headline).accessibilityAddTraits(.isHeader)
        } content: {
            Chart {
                if let lower = active?.zoneBottom, let upper = active?.zoneTop, upper > lower {
                    RectangleMark(xStart: .value("Left edge", -17.0 / 24.0), xEnd: .value("Right edge", 17.0 / 24.0),
                        yStart: .value("Bottom", lower), yEnd: .value("Top", upper))
                        .foregroundStyle(Brand.accent(for: scheme).opacity(0.12))
                }
                ForEach(pitches) { pitch in
                    if let x = pitch.x, let z = pitch.z {
                        PointMark(x: .value("Horizontal", x), y: .value("Height", z))
                            .foregroundStyle(pitch.strike ? Brand.accent(for: scheme) : Color.cyan)
                            .symbolSize(pitch.id == selected ? 135 : 64)
                            .annotation(position: .top) {
                                if pitch.id == selected, let number = pitch.number {
                                    Text("#\(number)").font(.caption2.bold())
                                }
                            }
                            .accessibilityLabel(pitch.call)
                            .accessibilityValue("\(ResearchFormat.decimal(x)) feet across, \(ResearchFormat.decimal(z)) feet high")
                    }
                }
            }
            .chartXAxisLabel("Feet across plate")
            .chartYAxisLabel("Feet above ground")
            .frame(height: 212)
        }
    }

    private func pitchRow(_ pitch: GameCenterData.Play.Pitch) -> some View {
        ResearchToolCard(color: pitch.strike ? Brand.accent(for: scheme) : .cyan) {
            HStack {
                Text(pitch.kind ?? "Pitch").font(.headline)
                Spacer()
                if let number = pitch.number {
                    Text("#\(number)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
        } content: {
            if !pitch.call.isEmpty { Text(verbatim: pitch.call).font(.subheadline).foregroundStyle(.secondary) }
            let metrics = figures(pitch)
            if !metrics.isEmpty { ResearchToolValues(items: metrics) }
        }
    }

    private func figures(_ pitch: GameCenterData.Play.Pitch) -> [ResearchToolValues.Value] {
        let readings: [(String, Double?, String)] = [
            ("Velocity", pitch.speed, " mph"), ("Spin", pitch.spin, " rpm"),
            ("Exit velocity", pitch.exitVelocity, " mph"), ("Launch angle", pitch.launchAngle, "°"), ("Distance", pitch.distance, " ft"),
        ]
        return readings.compactMap { label, value, unit in
            guard let value else { return nil }
            return .init(label: label, text: ResearchFormat.decimal(value, suffix: unit))
        }
    }
}
