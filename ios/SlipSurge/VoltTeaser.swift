import SwiftUI

struct VoltTeaser: View {
    enum Jersey { case nfl, nba }

    var jersey = Jersey.nfl
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var open = false
    @State private var visible = false

    var body: some View {
        Button { open.toggle() } label: {
            VoltCharacter(jersey: jersey, paused: reduceMotion || !visible || scenePhase != .active)
                .frame(width: 36, height: 39)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("VOLT")
        .accessibilityHint("Opens the Sparks teaser")
        .onAppear { visible = true }
        .onDisappear { visible = false; open = false }
        .popover(isPresented: $open, arrowEdge: .top) {
            HStack(spacing: 11) {
                VoltCharacter(jersey: jersey, paused: reduceMotion || scenePhase != .active)
                    .frame(width: 47, height: 51)
                VStack(alignment: .leading, spacing: 4) {
                    Text("VOLT Sparks").font(.headline)
                    Text("Coming soon").font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                }
                Button("Close", systemImage: "xmark") { open = false }
                    .labelStyle(.iconOnly).buttonStyle(.borderless).frame(minWidth: 44, minHeight: 44)
            }
            .foregroundStyle(Brand.text(for: scheme))
            .padding(.vertical, 9).padding(.leading, 13).padding(.trailing, 4)
            .presentationCompactAdaptation(.none)
        }
    }
}

private struct VoltCharacter: View {
    let jersey: VoltTeaser.Jersey
    let paused: Bool

    private let dark = Color(rgb: 0x0A0A0B)

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: paused)) { timeline in
            Canvas { graphics, size in
                let elapsed = paused ? 0 : timeline.date.timeIntervalSinceReferenceDate
                let lift = swing(elapsed, seconds: 6)
                let breath = swing(elapsed, seconds: 3.2)
                var context = graphics
                context.scaleBy(x: size.width / 200, y: size.height / 212)
                context.translateBy(x: 0, y: 8)
                let spread = 61 * (1 - 0.18 * lift)
                let shadow = Path(ellipseIn: CGRect(x: 100 - spread, y: 187, width: spread * 2, height: 20))
                context.fill(shadow, with: .radialGradient(Gradient(colors: [Color(rgb: 0x061406).opacity(0.46), .clear]),
                    center: CGPoint(x: 100, y: 197), startRadius: 0, endRadius: 57))
                context.translateBy(x: 100, y: 190 - 10 * lift)
                context.scaleBy(x: 1 + 0.025 * breath, y: 1 - 0.025 * breath)
                context.translateBy(x: -100, y: -190)
                draw(in: context, elapsed: elapsed)
            }.accessibilityHidden(true)
        }
    }

    private func swing(_ elapsed: TimeInterval, seconds: Double) -> Double {
        (1 - cos(elapsed.truncatingRemainder(dividingBy: seconds) / seconds * 2 * .pi)) / 2
    }

    private func draw(in context: GraphicsContext, elapsed: TimeInterval) {
        let tuft = Path { shape in
            shape.move(to: CGPoint(x: 112, y: -4))
            for point in [CGPoint(x: 84, y: 32), .init(x: 101, y: 32), .init(x: 92, y: 54),
                          .init(x: 128, y: 20), .init(x: 109, y: 20), .init(x: 119, y: -4)] {
                shape.addLine(to: point)
            }
            shape.closeSubpath()
        }
        let tuftColors = Gradient(colors: [Color(rgb: 0xEDFFD1), Color(rgb: 0xBEFF60), Color(rgb: 0x81C42D)])
        context.fill(tuft, with: .linearGradient(tuftColors, startPoint: CGPoint(x: 84, y: -4), endPoint: CGPoint(x: 128, y: 54)))
        let sleeve = Gradient(colors: [Color(rgb: 0xD8FF9B), Color(rgb: 0xB4F64A), Color(rgb: 0x79BB2B)])
        for x in [7.0, 145.0] {
            context.fill(Path(ellipseIn: CGRect(x: x, y: 81, width: 48, height: 54)),
                with: .radialGradient(sleeve, center: CGPoint(x: x + 16, y: 95), startRadius: 0, endRadius: 44))
        }
        let body = silhouette
        let colors = Gradient(stops: [
            .init(color: Color(rgb: 0xE9FFC3), location: 0), .init(color: Color(rgb: 0xCAFF7B), location: 0.3),
            .init(color: Color(rgb: 0xB4F64A), location: 0.58), .init(color: Color(rgb: 0x8BD332), location: 0.82),
            .init(color: Color(rgb: 0x69AA22), location: 1),
        ])
        context.fill(body, with: .radialGradient(colors, center: CGPoint(x: 74, y: 65), startRadius: 0, endRadius: 136))
        context.stroke(body, with: .color(Color(rgb: 0xE7FFC3).opacity(0.28)), lineWidth: 1.4)
        drawTrim(in: context, silhouette: body)
        context.draw(Text("7").font(.system(size: 46, weight: .black)).foregroundStyle(dark),
            at: CGPoint(x: 99, y: 145), anchor: .center)
        let blink = elapsed.truncatingRemainder(dividingBy: 4.2) / 4.2
        let eyeHeight = 30 * min(1, 0.08 + abs(blink - 0.945) * 26.3)
        for x in [72.0, 113.0] {
            let eye = Path(roundedRect: CGRect(x: x, y: 91 - eyeHeight / 2, width: 15, height: eyeHeight), cornerRadius: 7.5)
            context.fill(eye, with: .color(dark))
        }
        context.fill(Path(ellipseIn: CGRect(x: 92, y: 107.5, width: 16, height: 13)), with: .color(dark))
    }

    private func drawTrim(in context: GraphicsContext, silhouette: Path) {
        let trim = Path { shape in
            if jersey == .nfl {
                let stripes: [(Double, Double, Double)] = [(9, 102, 27), (8, 113, 26), (191, 102, 173), (192, 113, 174)]
                for line in stripes {
                    shape.move(to: CGPoint(x: line.0, y: line.1))
                    shape.addLine(to: CGPoint(x: line.2, y: line.1))
                }
            } else {
                shape.move(to: CGPoint(x: 70, y: 30))
                shape.addQuadCurve(to: CGPoint(x: 130, y: 30), control: CGPoint(x: 100, y: 62))
                for (edge, control) in [(30.0, 52.0), (170.0, 148.0)] {
                    shape.move(to: CGPoint(x: edge, y: 70))
                    shape.addQuadCurve(to: CGPoint(x: edge, y: 150), control: CGPoint(x: control, y: 110))
                }
            }
        }
        var drawing = context
        if jersey == .nba { drawing.clip(to: silhouette) }
        drawing.stroke(trim, with: .color(dark), style: StrokeStyle(lineWidth: 5, lineCap: .round))
    }

    private var silhouette: Path {
        Path { shape in
            shape.move(to: CGPoint(x: 100, y: 34))
            shape.addCurve(to: CGPoint(x: 172, y: 112), control1: CGPoint(x: 152, y: 34), control2: CGPoint(x: 172, y: 58))
            shape.addCurve(to: CGPoint(x: 100, y: 190), control1: CGPoint(x: 172, y: 166), control2: CGPoint(x: 150, y: 190))
            shape.addCurve(to: CGPoint(x: 28, y: 112), control1: CGPoint(x: 50, y: 190), control2: CGPoint(x: 28, y: 166))
            shape.addCurve(to: CGPoint(x: 100, y: 34), control1: CGPoint(x: 28, y: 58), control2: CGPoint(x: 48, y: 34))
            shape.closeSubpath()
        }
    }
}
