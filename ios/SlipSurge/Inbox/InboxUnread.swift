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

    func count(for section: InboxSection, memberID: UUID?) -> Int {
        self.memberID == memberID ? counts[section, default: 0] : 0
    }

    func total(for memberID: UUID?) -> Int {
        self.memberID == memberID ? counts.values.reduce(0, +) : 0
    }

    func update(_ count: Int, for section: InboxSection, memberID: UUID) {
        setMember(memberID)
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
    }

    private func refresh(_ section: InboxSection, account: AccountStore, memberID: UUID) async {
        let revision = revisions[section, default: 0]
        let count: Int
        do {
            switch section {
            case .activity:
                count = try await ActivityAPI(account: account, userID: memberID).load().unreadCount
            case .messages:
                count = try await MessagesAPI(account: account, userID: memberID).inbox().unreadCount
            }
        } catch let status as SlipSurgeHTTP.Status where status.code == 403 {
            count = 0
        } catch {
            return
        }
        // A load or mutation from the visible Inbox wins over a poll already in flight.
        guard !Task.isCancelled, account.memberID == memberID, self.memberID == memberID,
              revisions[section, default: 0] == revision else { return }
        update(count, for: section, memberID: memberID)
    }
}
