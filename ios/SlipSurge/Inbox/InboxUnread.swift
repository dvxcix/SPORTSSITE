import Foundation
import Observation

@MainActor @Observable
final class InboxUnread {
    struct Scope: Equatable {
        let memberID: UUID?
        let active: Bool
    }

    private var memberID: UUID?
    private var counts: [InboxSection: Int] = [:]
    @ObservationIgnored private var revisions: [InboxSection: Int] = [:]
    @ObservationIgnored private var activitySnapshot: Snapshot<[ActivityNotification]>?
    @ObservationIgnored private var messagesSnapshot: Snapshot<MessageInbox>?

    private struct Snapshot<Value> {
        let value: Value
        let received = Date.now
        var recentValue: Value? { Date.now.timeIntervalSince(received) < 30 ? value : nil }
    }

    func recentActivity(for memberID: UUID) -> [ActivityNotification]? {
        self.memberID == memberID ? activitySnapshot?.recentValue : nil
    }

    func recentMessages(for memberID: UUID) -> MessageInbox? {
        self.memberID == memberID ? messagesSnapshot?.recentValue : nil
    }

    func count(for section: InboxSection, memberID: UUID?) -> Int {
        self.memberID == memberID ? counts[section, default: 0] : 0
    }

    func total(for memberID: UUID?) -> Int {
        self.memberID == memberID ? counts.values.reduce(0, +) : 0
    }

    func update(_ count: Int, for section: InboxSection, memberID: UUID) {
        setMember(memberID)
        switch section {
        case .activity: activitySnapshot = nil
        case .messages: messagesSnapshot = nil
        }
        if counts[section] != count { counts[section] = count }
        revisions[section, default: 0] += 1
    }

    func observe(account: AccountStore) async {
        let memberID = account.memberID
        setMember(memberID)
        guard let memberID else { return }
        while !Task.isCancelled {
            async let activity: Void = refresh(.activity, account: account, memberID: memberID)
            async let messages: Void = refresh(.messages, account: account, memberID: memberID)
            _ = await (activity, messages)
            do { try await Task.sleep(for: .seconds(60)) } catch { return }
        }
    }

    private func setMember(_ memberID: UUID?) {
        guard self.memberID != memberID else { return }
        self.memberID = memberID
        counts = [:]
        revisions = [:]
        activitySnapshot = nil
        messagesSnapshot = nil
    }

    private func refresh(_ section: InboxSection, account: AccountStore, memberID: UUID) async {
        let revision = revisions[section, default: 0]
        let count: Int
        var activity: [ActivityNotification]?
        var messages: MessageInbox?
        do {
            switch section {
            case .activity:
                let loaded = try await ActivityAPI(account: account, userID: memberID).load()
                activity = loaded
                count = loaded.unreadCount
            case .messages:
                let loaded = try await MessagesAPI(account: account, userID: memberID).inbox()
                messages = loaded
                count = loaded.unreadCount
            }
        } catch let status as SlipSurgeHTTP.Status where [401, 403, 404].contains(status.code) {
            count = 0
        } catch {
            return
        }
        // A load or mutation from the visible Inbox wins over a poll already in flight.
        guard !Task.isCancelled, account.memberID == memberID, self.memberID == memberID,
              revisions[section, default: 0] == revision else { return }
        update(count, for: section, memberID: memberID)
        if let activity { activitySnapshot = Snapshot(value: activity) }
        if let messages { messagesSnapshot = Snapshot(value: messages) }
    }
}
