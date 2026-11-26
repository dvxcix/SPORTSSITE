import SwiftUI

struct ReactionBurst: Equatable {
    let symbol: String
    let id = UUID()
}

private struct ReactionBurstEffect: ViewModifier {
    let burst: ReactionBurst?
    let alignment: Alignment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.slipPalette) private var slipPalette

    func body(content: Content) -> some View {
        content.overlay(alignment: alignment) {
            if !reduceMotion {
                ZStack {
                    NativeReactionArtwork(symbol: burst?.symbol ?? "", size: 30)
                    Image(systemName: "sparkle")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(slipPalette.accent)
                        .offset(x: -17, y: 11)
                    Image(systemName: "sparkle")
                        .font(.caption2)
                        .foregroundStyle(slipPalette.accent)
                        .offset(x: 16, y: -9)
                }
                .keyframeAnimator(initialValue: 0.0, trigger: burst?.id) { effect, progress in
                    effect
                        .scaleEffect(0.7 + 0.6 * sin(progress * .pi))
                        .rotationEffect(.degrees((alignment == .trailing ? -1 : 1) * 12 * progress))
                        .offset(x: (alignment == .trailing ? -1 : 1) * 14 * progress, y: -53 * progress)
                        .opacity(max(0, min(progress * 9, (1 - progress) * 4)))
                } keyframes: { _ in
                    LinearKeyframe(1.0, duration: 0.62)
                    MoveKeyframe(0.0)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
    }
}

extension View {
    func reactionBurst(_ burst: ReactionBurst?, alignment: Alignment = .leading) -> some View {
        modifier(ReactionBurstEffect(burst: burst, alignment: alignment))
    }
}
