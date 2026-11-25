import SwiftUI

struct SlipSurgeTabBar: View {
    private static let buttonHeight: CGFloat = 50
    private static let contentPadding: CGFloat = 5
    private static let bottomPadding: CGFloat = 4
    static var minimumHeight: CGFloat { buttonHeight + 2 * contentPadding + bottomPadding }

    let selection: SlipSurgeTabs.Destination
    let profile: AccountStore.ProfileIdentity?
    let unread: Int
    let select: (SlipSurgeTabs.Destination) -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var selectionMotion

    var body: some View {
        Group {
            if #available(iOS 26, *) {
                buttons.glassEffect(.regular, in: .capsule)
            } else {
                buttons.background(.regularMaterial, in: .capsule)
                    .overlay { Capsule().strokeBorder(.secondary.opacity(0.15)) }
            }
        }
        .frame(maxWidth: 450)
        .padding(.horizontal, 15)
        .padding(.bottom, Self.bottomPadding)
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Main tabs")
    }

    private var buttons: some View {
        HStack(spacing: 3) {
            ForEach(SlipSurgeTabs.Destination.allCases, id: \.self) { tab in
                Button { select(tab) } label: {
                    VStack(spacing: 2) {
                        ZStack {
                            if tab == .you, let profile {
                                NativeMemberAvatar(url: profile.avatarUrl, name: profile.name, size: 22,
                                    style: profile.avatarRingStyle, color: profile.avatarRingColor)
                            } else {
                                Image(systemName: tab.symbol).font(.system(size: 19, weight: .semibold))
                            }
                        }
                        .frame(height: 28)
                        .overlay(alignment: .topTrailing) {
                            if tab == .inbox, unread > 0 {
                                InboxBadge(count: unread).offset(x: 11, y: -3)
                            }
                        }
                        Text(tab.rawValue)
                            .font(.caption2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(selection == tab ? Brand.accent(for: scheme) : Brand.text(for: scheme))
                    .frame(maxWidth: .infinity, minHeight: Self.buttonHeight)
                    .background {
                        if selection == tab {
                            Capsule().fill(Brand.accent(for: scheme).opacity(scheme == .dark ? 0.17 : 0.13))
                                .matchedGeometryEffect(id: "activeTab", in: selectionMotion)
                        }
                    }
                    .contentShape(.capsule)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityLabel(tab.rawValue)
                .accessibilityValue(accessibilityValue(for: tab))
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(Self.contentPadding)
        .animation(reduceMotion ? nil : .snappy(duration: 0.26), value: selection)
    }

    private func accessibilityValue(for tab: SlipSurgeTabs.Destination) -> String {
        switch tab {
        case .you: profile.map { "@\($0.username)" } ?? ""
        case .inbox where unread > 0: "\(unread.formatted()) unread"
        default: ""
        }
    }
}
