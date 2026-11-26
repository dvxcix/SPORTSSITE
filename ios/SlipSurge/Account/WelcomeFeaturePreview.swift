import SwiftUI

struct WelcomeFeaturePreview: View {
    let scene: NativeWelcome.Scene
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false

    private var accent: Color {
        switch scene {
        case .research: Color(rgb: 0xB9F490)
        case .games: Color(rgb: 0x8AC9FC)
        case .community: Color(rgb: 0xD3B6FF)
        case .creators: Color(rgb: 0xB9F490)
        }
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [accent.opacity(0.26), Color(rgb: 0x12231A), Color(rgb: 0x0A1510)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            pitch
            VStack(spacing: 10) {
                switch scene {
                case .research: research
                case .games: game
                case .community: community
                case .creators: creators
                }
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: 440)
            .opacity(revealed || reduceMotion ? 1 : 0.68)
            .offset(y: revealed || reduceMotion ? 0 : 12)
        }
        .clipShape(.rect(cornerRadius: 24))
        .overlay { RoundedRectangle(cornerRadius: 24).strokeBorder(accent.opacity(0.23)) }
        .task(id: active) {
            guard active else { revealed = false; return }
            guard !reduceMotion else { revealed = true; return }
            do { try await Task.sleep(for: .milliseconds(85)) } catch { return }
            withAnimation(.timingCurve(0.25, 0.8, 0.25, 1, duration: 0.65)) { revealed = true }
        }
    }

    private var pitch: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width * 0.78, y: size.height * 0.18)
            for radius in [42.0, 86, 140, 204, 272] {
                let circle = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
                context.stroke(Path(ellipseIn: circle), with: .color(accent.opacity(0.10)), lineWidth: 1)
            }
            var marks = Path()
            let index = 36.0
            for x in stride(from: index, to: size.width, by: index) {
                marks.move(to: .init(x: x, y: size.height - 7))
                marks.addLine(to: .init(x: x, y: size.height - 17))
            }
            context.stroke(marks, with: .color(accent.opacity(0.30)), lineWidth: 1)
        }
    }

    private var research: some View {
        VStack(alignment: .leading, spacing: 9) {
            cardHeader("Player trends", glyph: "chart.bar.xaxis")
            HStack(spacing: 8) {
                ZStack(alignment: .bottom) {
                    LinearGradient(colors: [Color(rgb: 0x0076B6), Color(rgb: 0x182D3B)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image("intro-nfl-det")
                        .resizable().scaledToFit().padding(3).opacity(0.38)
                    Image("intro-amon-ra-st-brown")
                        .resizable().scaledToFit().frame(width: 48, height: 34)
                }
                .frame(width: 43, height: 38)
                .clipShape(.rect(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Amon-Ra St. Brown").font(.subheadline.weight(.heavy)).lineLimit(1)
                    Text("Receiving yards").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 2)
                Text("Last 10").font(.caption2.weight(.bold)).foregroundStyle(accent)
            }
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(Array([0.35, 0.63, 0.49, 0.74, 0.83, 0.52, 0.88, 0.73, 0.94, 0.80].enumerated()),
                        id: \.offset) { _, fraction in
                    UnevenRoundedRectangle(topLeadingRadius: 4, topTrailingRadius: 4)
                        .fill(fraction >= 0.63 ? accent.gradient : Color(rgb: 0xCD676D).gradient)
                        .frame(height: 67 * fraction)
                        .frame(maxWidth: .infinity)
                        .scaleEffect(y: revealed || reduceMotion ? 1 : 0.25, anchor: .bottom)
                }
            }
            .frame(height: 67, alignment: .bottom)
            HStack(spacing: 5) {
                Image("book-fanduel").resizable().scaledToFit().frame(width: 19, height: 19)
                Image("book-draftkings").resizable().scaledToFit().frame(width: 19, height: 19)
                Text("Compare books").font(.caption.weight(.semibold))
                Spacer()
                Image(systemName: "arrow.up.right").font(.caption.weight(.bold)).foregroundStyle(accent)
            }
            .padding(.top, 4)
        }
        .padding(15)
        .background(panel)
    }

    private var game: some View {
        VStack(alignment: .leading, spacing: 11) {
            cardHeader("Game Center", glyph: "waveform.path")
            HStack(alignment: .center, spacing: 7) {
                team("CHI", asset: "intro-nfl-chi")
                Text("14").font(.title.weight(.black)).monospacedDigit()
                Spacer(minLength: 5)
                Text("Q4").font(.caption2.bold()).foregroundStyle(accent)
                Spacer(minLength: 5)
                Text(revealed ? "20" : "17").font(.title.weight(.black)).monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText(countsDown: false))
                team("DET", asset: "intro-nfl-det")
            }
            Label("Field goal", systemImage: "arrow.up.right")
                .foregroundStyle(accent)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(accent.opacity(0.12), in: .capsule)
                .opacity(revealed || reduceMotion ? 1 : 0)
        }
        .padding(15)
        .background(panel)
    }

    private var community: some View {
        VStack(alignment: .leading, spacing: 8) {
            cardHeader("Game Day", glyph: "number")
            HStack(alignment: .top, spacing: 10) {
                Image(.brandDarkIcon).resizable().scaledToFit().frame(width: 30, height: 30)
                    .clipShape(.circle)
                VStack(alignment: .leading, spacing: 7) {
                    Text("That fourth-quarter stop.")
                        .font(.subheadline.weight(.semibold))
                    HStack(spacing: 6) {
                        reaction("🔥", count: revealed || reduceMotion ? 8 : 7)
                        reaction("🏈", count: 4)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 7)
        }
        .padding(15)
        .background(panel)
    }

    private var panel: some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(Color(rgb: 0x15271E))
            .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(accent.opacity(0.2)) }
    }

    private var creators: some View {
        VStack(alignment: .leading, spacing: 12) {
            cardHeader("Creator Studio", glyph: "storefront.fill")
            Label("Free groups and paid memberships", systemImage: "person.2.fill")
            Label("Members-only picks", systemImage: "lock.doc")
            Label {
                Text("Discord roles")
            } icon: {
                Image("sign-in-discord").resizable().scaledToFit().frame(width: 19, height: 19)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(15)
        .background(panel)
    }

    private func cardHeader(_ title: String, glyph: String) -> some View {
        Label(title, systemImage: glyph)
            .font(.caption.weight(.bold))
            .foregroundStyle(accent)
    }

    private func team(_ code: String, asset: String) -> some View {
        VStack(spacing: 3) {
            Image(asset).resizable().scaledToFit().frame(width: 38, height: 36)
            Text(code).font(.caption2.weight(.bold))
        }
    }

    private func reaction(_ emoji: String, count: Int) -> some View {
        Text("\(emoji) \(count)")
            .font(.caption.weight(.bold))
            .monospacedDigit()
            .contentTransition(reduceMotion ? .identity : .numericText(countsDown: false))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(accent.opacity(0.12), in: .capsule)
    }
}
