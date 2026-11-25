import SwiftUI

enum InboxSection: String, CaseIterable {
    case activity = "Activity"
    case messages = "Messages"

    var symbol: String {
        switch self {
        case .activity: "bell"
        case .messages: "envelope"
        }
    }
}

struct InboxView: View {
    let account: AccountStore
    @Binding var section: InboxSection
    let unread: InboxUnread
    let signIn: () -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        content
            .navigationTitle("Inbox")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top, spacing: 0) { sectionPicker }
            .background(Brand.background(for: scheme))
    }

    @ViewBuilder private var content: some View {
        if let memberID = account.memberID {
            switch section {
            case .activity:
                ActivityView(api: .init(account: account, userID: memberID), inInbox: true) {
                    update(.activity, count: $0, memberID: memberID)
                }
            case .messages:
                MessagesView(api: .init(account: account, userID: memberID), inInbox: true) {
                    update(.messages, count: $0, memberID: memberID)
                }
            }
        } else {
            ContentUnavailableView {
                Label(section == .activity ? "See your activity" : "Start a conversation", systemImage: section.symbol)
            } description: {
                Text(section == .activity ? "Sign in to see replies, mentions and updates." : "Sign in to send and receive messages.")
            } actions: {
                Button(action: signIn) {
                    Text("Sign in").foregroundStyle(scheme == .dark ? .black : .white)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var sectionPicker: some View {
        HStack(spacing: 4) {
            ForEach(InboxSection.allCases, id: \.self) { item in
                let count = unread.count(for: item, memberID: account.memberID)
                Button {
                    withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) { section = item }
                } label: {
                    HStack(spacing: 6) {
                        ViewThatFits(in: .horizontal) {
                            Label(item.rawValue, systemImage: item.symbol).fixedSize(horizontal: true, vertical: false)
                            Text(item.rawValue)
                        }
                        if count > 0 { InboxBadge(count: count) }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(section == item ? Brand.accent(for: scheme) : Brand.text(for: scheme))
                    .padding(.horizontal, 6)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background {
                        if section == item { Capsule().fill(Brand.accent(for: scheme).opacity(0.14)) }
                    }
                    .contentShape(.capsule)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityLabel(item.rawValue)
                .accessibilityValue(count > 0 ? "\(count.formatted()) unread" : "")
                .accessibilityAddTraits(section == item ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Brand.surface(for: scheme), in: .capsule)
        .padding(.horizontal, 16)
        .padding(.vertical, 5)
        .background(Brand.background(for: scheme))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Inbox sections")
        .sensoryFeedback(.selection, trigger: section)
    }

    private func update(_ section: InboxSection, count: Int, memberID: UUID) {
        guard account.memberID == memberID else { return }
        unread.update(count, for: section, memberID: memberID)
    }
}

struct InboxBadge: View {
    let count: Int
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Text(count > 99 ? "99+" : count.formatted())
            .font(.caption2.bold()).monospacedDigit()
            .foregroundStyle(scheme == .dark ? .black : .white)
            .padding(.horizontal, 4)
            .frame(minWidth: 18, minHeight: 17)
            .background(Brand.accent(for: scheme), in: .capsule)
            .fixedSize()
            .accessibilityHidden(true)
    }
}
