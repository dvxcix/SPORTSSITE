import SwiftUI

enum NativeSpotlight: String, Identifiable {
    case ultimate, court, sideline, creators

    var id: String { rawValue }
    var isCreator: Bool { self == .creators }
    var title: String {
        switch self {
        case .ultimate: "Unlock the full slate"
        case .court: "Go deeper in The Court"
        case .sideline: "Go deeper in The Sideline"
        case .creators: "Make it your community"
        }
    }
    var detail: String {
        switch self {
        case .ultimate: "Ultimate opens the full Odds Boards and player research across NBA and NFL."
        case .court: "Ultimate gives you the full NBA slate, from matchup boards to player research and sportsbook comparisons."
        case .sideline: "Ultimate gives you the full NFL slate, with player props, matchup research and sportsbook comparisons."
        case .creators: "Open a free community or set up a paid membership for your picks and chat."
        }
    }
}

extension EnvironmentValues {
    @Entry var presentNativeSpotlight: ((NativeSpotlight) -> Void)? = nil
}

struct NativeFeatureSpotlight: View {
    private enum Destination: Hashable { case plans, freeCommunity, paidCommunity }

    let spotlight: NativeSpotlight
    let account: AccountStore
    @Binding var appearance: Appearance
    let browseCreators: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false

    private var detents: Set<PresentationDetent> {
        UIDevice.current.userInterfaceIdiom == .phone && !textSize.isAccessibilitySize
            ? [.fraction(0.82), .large] : [.large]
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        artwork
                            .frame(height: textSize.isAccessibilitySize ? 94 : 136)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 7) {
                            Text(spotlight.title)
                                .font(.system(.largeTitle, weight: .black))
                                .accessibilityAddTraits(.isHeader)
                            Text(spotlight.detail)
                                .font(.body)
                                .foregroundStyle(palette.text.opacity(0.76))
                        }
                        benefits
                        if textSize.isAccessibilitySize { secondaryActions }
                    }
                    .frame(maxWidth: 460, alignment: .leading)
                    .padding(.horizontal, 22)
                    .padding(.top, 20)
                    .padding(.bottom, 22)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height,
                        alignment: textSize.isAccessibilitySize ? .top : .center)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 6) {
                    if spotlight.isCreator {
                        primary("Create a free community", destination: .freeCommunity)
                    } else {
                        primary("See Ultimate plans", destination: .plans)
                    }
                    if !textSize.isAccessibilitySize { secondaryActions }
                }
                .frame(maxWidth: 460)
                .padding(.horizontal, 22)
                .padding(.top, 8)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity)
                .background(palette.background)
            }
            .background { SlipBackdrop() }
            .foregroundStyle(palette.text)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly)
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .plans:
                    NativeMembershipOverview(account: account)
                case .freeCommunity:
                    NativeMemberIntent(account: account, appearance: $appearance,
                        purpose: "Sign in to create your free community.") { userID in
                        CommunityCreateView(api: .init(account: account, userID: userID), freeOnly: true)
                    }
                case .paidCommunity:
                    NativeMemberIntent(account: account, appearance: $appearance,
                        purpose: "Sign in to set up your paid creator membership.") { userID in
                        CreatorStoreView(api: .init(account: account, userID: userID), startsPaid: true)
                    }
                }
            }
        }
        .tint(palette.accent)
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .task {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.32)) { revealed = true }
        }
    }

    private var artwork: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 18).fill(palette.selectionGradient)
            if spotlight.isCreator {
                HStack(spacing: 12) {
                    artworkTile("person.2.fill")
                    artworkTile("lock.fill")
                    Image("sign-in-discord").resizable().scaledToFit().frame(width: 28, height: 28)
                        .frame(width: 62, height: 62)
                        .background(palette.surface, in: .rect(cornerRadius: 16))
                }
                .frame(maxWidth: .infinity)
                .scaleEffect(revealed || reduceMotion ? 1 : 0.95)
            } else {
                SpotlightChart(accent: palette.accent, shown: revealed || reduceMotion)
                Image(systemName: "bolt.fill")
                    .font(.title2.weight(.black))
                    .foregroundStyle(palette.background)
                    .frame(width: 51, height: 51)
                    .background(palette.accent, in: .circle)
                    .padding(.leading, 16)
                    .frame(maxHeight: .infinity, alignment: .topLeading)
                    .padding(.top, 16)
            }
        }
        .clipShape(.rect(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(palette.accent.opacity(0.24)) }
    }

    private func artworkTile(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.title2.weight(.semibold))
            .foregroundStyle(palette.accent)
            .frame(width: 62, height: 62)
            .background(palette.surface, in: .rect(cornerRadius: 16))
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 12) {
            if spotlight.isCreator {
                benefit("Choose free or member-only access", symbol: "person.badge.key")
                benefit("Share picks with community members", symbol: "lock.doc")
                benefit("Connect Discord and manage member roles", symbol: "person.2.badge.gearshape")
            } else {
                benefit("Compare sportsbook lines", symbol: "square.stack.3d.up")
                benefit("Explore The Court and The Sideline", symbol: "sportscourt")
                benefit("Dig into matchup and player trends", symbol: "chart.line.uptrend.xyaxis")
            }
        }
    }

    private func benefit(_ title: String, symbol: String) -> some View {
        Label {
            Text(title).font(.subheadline.weight(.medium))
        } icon: {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(palette.accent)
                .frame(width: 27)
                .accessibilityHidden(true)
        }
    }

    private var secondaryActions: some View {
        VStack(spacing: 6) {
            if spotlight.isCreator {
                NavigationLink("Set up paid access", value: Destination.paidCommunity)
                    .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                Button("Browse creators", action: browseCreators)
                    .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            } else {
                Button("Keep exploring") { dismiss() }
                    .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            }
        }
    }

    private func primary(_ title: String, destination: Destination) -> some View {
        NavigationLink(value: destination) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color(rgb: 0x102000))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, minHeight: 51)
                .background(SlipPalette.iconGradient, in: .capsule)
        }
        .buttonStyle(SlipSurgePressStyle())
    }
}

private struct SpotlightChart: View {
    let accent: Color
    let shown: Bool

    var body: some View {
        Canvas { context, size in
            for row in 1...6 {
                let y = CGFloat(row) * size.height / 7
                var line = Path()
                line.move(to: .init(x: 10, y: y))
                line.addLine(to: .init(x: size.width - 10, y: y))
                context.stroke(line, with: .color(accent.opacity(0.19)), lineWidth: 1)
            }
            let columns: [CGFloat] = [0.23, 0.36, 0.49, 0.64, 0.82]
            let width = size.width * 0.112
            let bottom = size.height - 1
            var trend = Path()
            for (index, fraction) in columns.enumerated() {
                let x = size.width * (0.28 + CGFloat(index) * 0.142)
                let y = bottom - size.height * fraction
                let bar = CGRect(x: x - width / 2, y: y + 10, width: width, height: bottom - y - 10)
                context.fill(Path(roundedRect: bar, cornerRadius: 6),
                    with: .linearGradient(.init(colors: [accent.opacity(0.64), accent.opacity(0.045)]),
                                          startPoint: .init(x: x, y: y), endPoint: .init(x: x, y: bottom)))
                let point = CGPoint(x: x, y: y)
                if index == 0 { trend.move(to: point) } else { trend.addLine(to: point) }
                context.fill(Path(ellipseIn: .init(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(accent))
            }
            context.stroke(trend, with: .color(accent), style: .init(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        }
        .opacity(shown ? 1 : 0.52)
        .scaleEffect(x: 1, y: shown ? 1 : 0.85, anchor: .bottom)
    }
}

struct NativeMemberIntent<Content: View>: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    let purpose: String
    @ViewBuilder let content: (UUID) -> Content

    var body: some View {
        if let userID = account.memberID, !account.needsNewPassword, !account.needsVerification {
            content(userID)
        } else if account.user != nil, !account.needsVerification, !account.needsNewPassword {
            NativeOnboarding(account: account, completed: {})
        } else {
            AccountView(account: account, appearance: $appearance, signInPurpose: purpose)
        }
    }
}

struct UltimateSpotlightButton: View {
    let account: AccountStore
    var spotlight = NativeSpotlight.ultimate
    @Environment(\.presentNativeSpotlight) private var present

    var body: some View {
        if let present {
            Button("Explore Ultimate", systemImage: "bolt.fill") { present(spotlight) }
                .buttonStyle(SlipSurgePrimaryButtonStyle())
        } else {
            NavigationLink {
                NativeMembershipOverview(account: account)
            } label: {
                Label("Explore Ultimate", systemImage: "bolt.fill")
            }
            .buttonStyle(SlipSurgePrimaryButtonStyle())
        }
    }
}
