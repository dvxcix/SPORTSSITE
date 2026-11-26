import SwiftUI

struct NativeWelcome: View {
    enum Action { case feed, research, signIn, createAccount }

    enum Scene: Int, CaseIterable, Identifiable {
        case research, games, community

        var id: Int { rawValue }
        var label: String {
            switch self {
            case .research: "Research"
            case .games: "Live Games"
            case .community: "Community"
            }
        }

        var headline: String {
            switch self {
            case .research: "See the matchup clearly."
            case .games: "Stay with the action."
            case .community: "Game day is better together."
            }
        }

        var detail: String {
            switch self {
            case .research: "Compare lines and read player trends before tipoff or kickoff."
            case .games: "Follow the score and watch the game unfold play by play."
            case .community: "Share picks, react to plays, and talk in your rooms."
            }
        }
    }

    let isSignedIn: Bool
    let choose: (Action) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.scenePhase) private var phase
    @State private var scene = Scene.research
    @State private var playing = true

    private var canAdvance: Bool {
        playing && !reduceMotion && !voiceOverEnabled && !textSize.isAccessibilitySize && phase == .active && scene != .community
    }

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= 780 && !textSize.isAccessibilitySize
            let previewHeight = wide ? 345 : min(310, max(216, geometry.size.height * 0.37))
            if textSize.isAccessibilitySize {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        guideCopy
                        preview(height: min(200, geometry.size.height * 0.3))
                        exploreResearch
                    }
                    .frame(maxWidth: 510)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 18)
                    .frame(maxWidth: .infinity)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    primaryActions
                        .frame(maxWidth: 510)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity)
                        .background(SlipPalette.color.background)
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: wide ? 28 : 18) {
                        header
                        if wide {
                            HStack(alignment: .center, spacing: 38) {
                                preview(height: previewHeight)
                                guide.frame(maxWidth: 380, alignment: .leading)
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 20) {
                                preview(height: previewHeight)
                                guide
                            }
                        }
                    }
                    .frame(maxWidth: wide ? 980 : 510)
                    .padding(.horizontal, wide ? 32 : 22)
                    .padding(.vertical, wide ? 36 : 18)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .center)
                }
                .scrollIndicators(.hidden)
            }
        }
        .background { SlipBackdrop() }
        .environment(\.slipAppearance, .color)
        .foregroundStyle(SlipPalette.color.text)
        .tint(SlipPalette.color.accent)
        .accessibilityAddTraits(.isModal)
        .task(id: canAdvance ? scene : nil) {
            guard canAdvance else { return }
            do { try await Task.sleep(for: .seconds(3.2)) } catch { return }
            guard !Task.isCancelled, canAdvance, let next = Scene(rawValue: scene.rawValue + 1) else { return }
            withAnimation(.easeInOut(duration: 0.38)) { scene = next }
        }
    }

    private var header: some View {
        HStack {
            SlipBrandLockup(width: 145)
            Spacer(minLength: 10)
            Button("Skip") { choose(.feed) }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 13)
                .frame(minHeight: 44)
                .background(.white.opacity(0.08), in: .capsule)
                .buttonStyle(.plain)
                .accessibilityLabel("Skip introduction")
        }
    }

    private func preview(height: CGFloat) -> some View {
        VStack(spacing: 4) {
            TabView(selection: Binding(get: { scene }, set: { next in
                if next != scene { playing = false; scene = next }
            })) {
                ForEach(Scene.allCases) { item in
                    WelcomeFeaturePreview(scene: item, active: item == scene)
                        .tag(item)
                        .dynamicTypeSize(...DynamicTypeSize.large)
                        .accessibilityHidden(true)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: height)

            HStack(spacing: 2) {
                Text("Preview")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SlipPalette.color.text.opacity(0.70))
                Spacer(minLength: 4)
                ForEach(Scene.allCases) { item in
                    Button {
                        playing = false
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { scene = item }
                    } label: {
                        Capsule().fill(item == scene ? SlipPalette.color.accent : .white.opacity(0.27))
                            .frame(width: item == scene ? 19 : 7, height: 6)
                            .frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.label)
                    .accessibilityAddTraits(item == scene ? .isSelected : [])
                }
                Spacer(minLength: 4)
                if !reduceMotion && !voiceOverEnabled && !textSize.isAccessibilitySize {
                    Button(scene == .community ? "Replay preview" : playing ? "Pause preview" : "Play preview",
                           systemImage: scene == .community ? "arrow.counterclockwise" : playing ? "pause.fill" : "play.fill") {
                        if scene == .community {
                            withAnimation(.easeInOut(duration: 0.3)) { scene = .research }
                            playing = true
                        } else { playing.toggle() }
                    }
                    .labelStyle(.iconOnly)
                    .frame(width: 44, height: 44)
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var guide: some View {
        VStack(alignment: .leading, spacing: 18) {
            guideCopy
            primaryActions
            exploreResearch
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var guideCopy: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(scene.label)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(SlipPalette.color.accent)
            Text(scene.headline)
                .font(.system(.largeTitle, design: .default, weight: .black))
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            Text(scene.detail)
                .font(.subheadline)
                .foregroundStyle(SlipPalette.color.text.opacity(0.76))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .id(scene)
        .transition(textSize.isAccessibilitySize ? .identity : .opacity)
    }

    @ViewBuilder private var primaryActions: some View {
        if isSignedIn {
            callToAction("Open Feed") { choose(.feed) }
        } else if textSize.isAccessibilitySize {
            VStack(spacing: 9) { signIn; signUp }
        } else {
            HStack(spacing: 10) { signIn; signUp }
        }
    }

    private var exploreResearch: some View {
        Button("Explore Research") { choose(.research) }
            .frame(maxWidth: .infinity, minHeight: 44)
    }

    private var signIn: some View {
        Button { choose(.signIn) } label: {
            Text("Sign in")
                .font(.subheadline.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(SlipPalette.color.text)
                .background(.white.opacity(0.09), in: .capsule)
        }
        .buttonStyle(SlipSurgePressStyle())
    }

    private var signUp: some View {
        callToAction("Create account") { choose(.createAccount) }
    }

    private func callToAction(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(Color(rgb: 0x102000))
                .background(SlipPalette.iconGradient, in: .capsule)
        }
        .buttonStyle(SlipSurgePressStyle())
    }
}
