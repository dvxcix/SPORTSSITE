import SwiftUI

struct SlipBackdrop: View {
    var animatedFor: SlipSurgeTabs.Destination?

    @Environment(\.slipPalette) private var palette
    @Environment(\.slipActiveDestination) private var activeDestination
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.scenePhase) private var scenePhase

    private var animates: Bool {
        !reduceMotion && !reduceTransparency && scenePhase == .active && animatedFor == activeDestination
    }

    var body: some View {
        Group {
            if palette == .color {
                LinearGradient(colors: [Color(rgb: 0x193424), palette.background, Color(rgb: 0x070B08)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .overlay(alignment: .top) {
                        if animates {
                            Color.clear
                                .phaseAnimator([false, true]) { _, shifted in
                                    glow.opacity(shifted ? 0.7 : 0.4)
                                        .offset(x: shifted ? 75 : -35)
                                } animation: { _ in
                                    .easeInOut(duration: 5)
                                }
                        } else if !reduceTransparency {
                            glow.opacity(0.45)
                        }
                    }
                    .clipped()
            } else {
                palette.background
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var glow: some View {
        RadialGradient(colors: [SlipPalette.glow, .clear], center: .topLeading, startRadius: 8, endRadius: 420)
    }
}

extension EnvironmentValues {
    @Entry var slipActiveDestination: SlipSurgeTabs.Destination = .feed
}
