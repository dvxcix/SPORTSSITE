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
        SocialSectionBar(title: "Inbox sections", sections: InboxSection.allCases, selection: $section) { item in
            let count = unread.count(for: item, memberID: account.memberID)
            HStack(spacing: 6) {
                Text(item.rawValue)
                if count > 0 { InboxBadge(count: count) }
            }
            .accessibilityElement(children: .combine)
            .accessibilityValue(count > 0 ? "\(count.formatted()) unread" : "")
        }
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
