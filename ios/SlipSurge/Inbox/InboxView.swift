import SwiftUI

enum InboxSection: String, CaseIterable {
    case activity = "Activity"
    case messages = "Messages"

    var symbol: String {
        switch self {
        case .activity: "bell"
        case .messages: "bubble.left.and.bubble.right"
        }
    }
}

struct InboxView: View {
    let account: AccountStore
    @Binding var section: InboxSection
    @Binding var notificationOpen: InboxNotificationOpen?
    let active: Bool
    let unread: InboxUnread
    let signIn: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var openedDestination: ActivityNotification.Destination?
    @State private var problem: NotificationProblem?

    private enum NotificationProblem: String, Identifiable {
        case unavailable = "This notification is no longer available."
        case failed = "The notification couldn’t load."
        var id: Self { self }
    }

    private struct OpenRequest: Equatable {
        let notification: InboxNotificationOpen
        let memberID: UUID
    }

    private var openRequest: OpenRequest? {
        guard active, let notificationOpen, let memberID = account.memberID else { return nil }
        return .init(notification: notificationOpen, memberID: memberID)
    }

    var body: some View {
        content
            .navigationTitle("Inbox")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top, spacing: 0) { sectionPicker }
            .background(Brand.background(for: scheme))
            .navigationDestination(item: $openedDestination) { destination in
                if let memberID = account.memberID {
                    ActivityDestinationView(api: .init(account: account, userID: memberID), destination: destination)
                }
            }
            .task(id: openRequest) { if let openRequest { await openNotification(openRequest) } }
            .alert("Notification unavailable", item: $problem) { _ in
                Button("OK", role: .cancel) {}
            } message: { problem in
                Text(problem.rawValue)
            }
    }

    private func openNotification(_ request: OpenRequest) async {
        let api = ActivityAPI(account: account, userID: request.memberID)
        let id = request.notification.notificationID
        do {
            let notice = try await api.load(id: id).first
            guard !Task.isCancelled, openRequest == request else { return }
            if let notice, notice.id == id {
                section = notice.type == "message" ? .messages : .activity
                openedDestination = notice.destination
                if !notice.read {
                    Task {
                        if (try? await api.markRead([id])) != nil {
                            await unread.refreshActivity(account: account, memberID: request.memberID)
                            NotificationCenter.default.post(name: .slipSurgeActivityChanged, object: nil)
                        }
                    }
                }
            } else {
                problem = .unavailable
            }
        } catch {
            guard !Task.isCancelled, openRequest == request else { return }
            problem = .failed
        }
        notificationOpen = nil
    }

    @ViewBuilder private var content: some View {
        if let memberID = account.memberID {
            switch section {
            case .activity:
                ActivityView(api: .init(account: account, userID: memberID), inInbox: true,
                    initialActivity: { unread.recentActivity(for: memberID) }) {
                    update(.activity, count: $0, memberID: memberID)
                }
            case .messages:
                MessagesView(api: .init(account: account, userID: memberID), inInbox: true,
                    initialInbox: { unread.recentMessages(for: memberID) }) {
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
                Label(item.rawValue, systemImage: item.symbol)
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
