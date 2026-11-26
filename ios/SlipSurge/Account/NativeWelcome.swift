import SwiftUI

struct NativeWelcome: View {
    let choose: (SlipSurgeTabs.Destination) -> Void
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                SlipBrandLockup(width: 150)
                Text("Get started")
                    .font(.largeTitle.weight(.bold))
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 15) {
                    Label("Research matchups and player trends", systemImage: "chart.bar.xaxis")
                    Label("Follow live scores and community picks", systemImage: "sportscourt")
                }
                .font(.body)
                .foregroundStyle(.secondary)
                VStack(spacing: 10) {
                    Button { choose(.research) } label: {
                        Text("Explore Research").frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                            .foregroundStyle(scheme == .dark ? .black : .white)
                    }
                    .buttonStyle(.borderedProminent)
                    Button { choose(.feed) } label: {
                        Text("Continue to Feed").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    Button("Sign in") { choose(.you) }
                        .frame(minHeight: 44)
                }
                .controlSize(.large)
            }
            .frame(maxWidth: 420, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 34)
            .frame(maxWidth: .infinity)
        }
        .background {
            SlipBackdrop()
            LinearGradient(colors: [slipPalette.accent.opacity(0.13), .clear],
                startPoint: .topLeading, endPoint: .center)
                .allowsHitTesting(false)
        }
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
        .presentationDetents(textSize.isAccessibilitySize ? [.large] : [.fraction(0.60), .large])
        .presentationDragIndicator(.visible)
    }
}
