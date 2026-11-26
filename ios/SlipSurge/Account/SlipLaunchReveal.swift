import SwiftUI

struct SlipLaunchReveal: View {
    let dismiss: () -> Void
    @State private var illuminated = false

    var body: some View {
        Button(action: dismiss) {
            ZStack {
                Color(.launchBackground)
                RadialGradient(colors: [SlipPalette.glow.opacity(0.54), .clear],
                    center: .center, startRadius: 18, endRadius: 320)
                    .opacity(illuminated ? 1 : 0)
                Image(.launchMark)
                    .resizable().scaledToFit()
                    .frame(width: 170, height: 50)
                    .scaleEffect(illuminated ? 1.09 : 1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open SlipSurge")
        .onAppear {
            withAnimation(.easeOut(duration: 0.45)) { illuminated = true }
        }
    }
}
