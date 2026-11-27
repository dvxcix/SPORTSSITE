import SwiftUI

struct SlipBackdrop: View {
    var animatedFor: SlipSurgeTabs.Destination?
    var profileColors: [Color]?

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
            if let profileColors {
                profileBackground(profileColors)
            } else if palette == .color {
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
        RadialGradient(colors: [SlipPalette.glow, .clear], center: UnitPoint(x: 0.16, y: 0),
                       startRadius: 8, endRadius: 420)
            .padding(.horizontal, -110)
    }

    private func profileBackground(_ colors: [Color]) -> some View {
        let tinted = palette == .color
        let primary = tinted ? SlipPalette.glow : colors.first ?? palette.accent
        let secondary = tinted ? Color(rgb: 0x207747) : colors.dropFirst().first ?? primary
        let strength = tinted ? 0.68 : palette.colorScheme == .dark ? 0.20 : 0.11
        return palette.background.overlay {
            if !reduceTransparency {
                EllipticalGradient(colors: [primary.opacity(strength), primary.opacity(strength * 0.42), .clear],
                                   center: UnitPoint(x: 0.3, y: 0.04), startRadiusFraction: 0.02, endRadiusFraction: 0.79)
                EllipticalGradient(colors: [secondary.opacity(strength * 0.44), .clear],
                                   center: UnitPoint(x: 0.84, y: 0), endRadiusFraction: 0.53)
            }
        }
    }
}

extension EnvironmentValues {
    @Entry var slipActiveDestination: SlipSurgeTabs.Destination = .feed
}
