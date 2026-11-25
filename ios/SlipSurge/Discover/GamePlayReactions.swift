import SwiftUI

struct GamePlayReactions: View {
    private struct Burst: Equatable {
        let symbol: String
        let id = UUID()
    }

    let reactions: [String: GameCenterData.Play.Reaction]
    let enabled: Bool
    let react: (String, Bool) async -> Void

    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pending: [String: Bool] = [:]
    @State private var burst: Burst?
    @State private var feedback = 0

    private static let choices = ["🔥", "❤️", "⚡", "👏", "😂", "👀", "🏆", "👍"]

    private var displayed: [String: GameCenterData.Play.Reaction] {
        var result = reactions
        for (emoji, selected) in pending {
            let current = result[emoji] ?? .init(count: 0, mine: false)
            if current.mine != selected {
                result[emoji] = .init(count: max(0, current.count + (selected ? 1 : -1)), mine: selected)
            }
        }
        return result
    }

    var body: some View {
        let display = displayed
        let total = display.values.reduce(0) { $0 + $1.count }
        HStack(spacing: 3) {
            if enabled {
                Menu {
                    ForEach(Self.choices, id: \.self) { emoji in
                        Button {
                            select(emoji)
                        } label: {
                            if display[emoji]?.mine == true { Label(emoji, systemImage: "checkmark") }
                            else { Text(emoji) }
                        }
                        .disabled(pending[emoji] != nil)
                    }
                } label: {
                    reactionTotal(total)
                        .padding(.horizontal, 7)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("React to play, \(total) reactions")
                if total == 0 {
                    Button { select("🔥") } label: {
                        NativeReactionArtwork(symbol: "🔥", size: 17)
                            .frame(width: 44, height: 44)
                            .background {
                                Capsule().fill(Brand.accent(for: scheme).opacity(0.12))
                                    .frame(width: 30, height: 24)
                            }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .disabled(pending["🔥"] != nil)
                    .accessibilityLabel("React with fire")
                }
            } else if total > 0 {
                reactionTotal(total).accessibilityLabel("\(total) reactions")
            }

            ForEach(display.keys.filter { display[$0, default: .init(count: 0, mine: false)].count > 0 }
                .sorted { (display[$0]?.count ?? 0) == (display[$1]?.count ?? 0) ? $0 < $1 : (display[$0]?.count ?? 0) > (display[$1]?.count ?? 0) }
                .prefix(2), id: \.self) { emoji in
                if let info = display[emoji] {
                    Button { select(emoji) } label: {
                        HStack(spacing: 3) {
                            NativeReactionArtwork(symbol: emoji, size: 15)
                            Text(info.count, format: .number).font(.caption2.monospacedDigit().weight(.semibold))
                                .contentTransition(reduceMotion ? .identity : .numericText())
                        }
                        .padding(.horizontal, 5)
                        .frame(minHeight: 44)
                        .background {
                            Capsule().fill(info.mine ? Brand.accent(for: scheme).opacity(0.18) : Color.secondary.opacity(0.08))
                                .frame(height: 24)
                        }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .disabled(!enabled || pending[emoji] != nil)
                    .accessibilityAddTraits(info.mine ? .isSelected : [])
                    .accessibilityLabel("\(emoji), \(info.count) reactions")
                }
            }
        }
        .foregroundStyle(.secondary)
        .sensoryFeedback(.selection, trigger: feedback)
        .overlay(alignment: .leading) {
            if !reduceMotion {
                NativeReactionArtwork(symbol: burst?.symbol ?? "", size: 23)
                    .font(.title3)
                    .keyframeAnimator(initialValue: 0.0, trigger: burst?.id) { content, time in
                        content.scaleEffect(0.72 + 0.5 * sin(time * .pi))
                            .offset(x: 12 + 19 * time, y: -52 * time)
                            .opacity(max(0, min(time * 9, (1 - time) * 3)))
                    } keyframes: { _ in
                        LinearKeyframe(1.0, duration: 0.63)
                        MoveKeyframe(0.0)
                    }
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .onChange(of: reactions) { previous, current in
            if let increased = Self.choices.first(where: {
                pending[$0] == nil && (current[$0]?.count ?? 0) > (previous[$0]?.count ?? 0)
            }), !reduceMotion {
                burst = Burst(symbol: increased)
            }
        }
    }

    private func reactionTotal(_ count: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "face.smiling")
            if count > 0 {
                Text(count, format: .number).font(.caption.weight(.semibold)).monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.21), value: count)
            }
        }
    }

    private func select(_ emoji: String) {
        guard enabled, pending[emoji] == nil else { return }
        let next = reactions[emoji]?.mine != true
        pending[emoji] = next
        feedback += 1
        if next && !reduceMotion { burst = Burst(symbol: emoji) }
        Task {
            await react(emoji, next)
            pending.removeValue(forKey: emoji)
        }
    }
}
