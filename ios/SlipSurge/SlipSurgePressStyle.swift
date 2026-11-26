import SwiftUI

struct SlipSurgePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(SlipSurgeButtonFeedback(pressed: configuration.isPressed))
    }
}

struct SlipSurgePrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    @Environment(\.slipPalette) private var slipPalette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(enabled ? Color(rgb: 0x14220C) : slipPalette.text)
            .padding(.horizontal, 13)
            .frame(minHeight: 44)
            .background(enabled ? slipPalette.actionFill : AnyShapeStyle(Color.secondary.opacity(0.15)), in: .rect(cornerRadius: 11))
            .contentShape(.rect(cornerRadius: 11))
            .modifier(SlipSurgeButtonFeedback(pressed: configuration.isPressed))
    }
}

private struct SlipSurgeButtonFeedback: ViewModifier {
    let pressed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(pressed ? 0.84 : 1)
            .scaleEffect(pressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: pressed ? 0.12 : 0.09), value: pressed)
    }
}
