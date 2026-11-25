import Foundation
import Observation

@MainActor @Observable
final class FeedReactionStore {
    private struct Change {
        var confirmed: Bool
        var intended: Bool
        var saving: Bool
        var renewed: Date
    }

    private var changes: [UUID: [String: Change]] = [:]

    func reactions(for post: FeedPost) -> (selected: Set<String>, counts: [String: Int]) {
        var selected = Set(post.reacted ?? [])
        var counts = post.reactionSummary ?? (post.reactions > 0 ? ["❤️": post.reactions] : [:])
        for (symbol, change) in changes[post.postID, default: [:]] where change.saving || Date.now.timeIntervalSince(change.renewed) < 90 {
            let included = selected.contains(symbol)
            guard included != change.intended else { continue }
            if change.intended { selected.insert(symbol) } else { selected.remove(symbol) }
            counts[symbol] = max(0, (counts[symbol] ?? 0) + (change.intended ? 1 : -1))
        }
        return (selected, counts)
    }

    func toggle(_ symbol: String, post: FeedPost, api: FeedAPI, failed: @escaping () -> Void) -> Bool {
        guard let userID = api.userID, api.account.memberID == userID else { return false }
        let id = post.postID
        let selected = reactions(for: post).selected.contains(symbol)
        if var current = changes[id]?[symbol], current.saving {
            current.intended = !selected
            changes[id, default: [:]][symbol] = current
        } else {
            let now = Date.now
            changes = changes.compactMapValues { entries in
                let recent = entries.filter { $0.value.saving || now.timeIntervalSince($0.value.renewed) < 90 }
                return recent.isEmpty ? nil : recent
            }
            changes[id, default: [:]][symbol] = Change(confirmed: selected, intended: !selected, saving: true, renewed: now)
            Task { await reconcile(symbol, id: id, api: api, userID: userID, failed: failed) }
        }
        return !selected
    }

    func reset() { changes.removeAll() }

    private func reconcile(_ symbol: String, id: UUID, api: FeedAPI, userID: UUID, failed: () -> Void) async {
        while api.account.memberID == userID, var current = changes[id]?[symbol] {
            if current.confirmed == current.intended {
                current.saving = false
                current.renewed = .now
                changes[id, default: [:]][symbol] = current
                return
            }
            let intended = current.intended
            do {
                try await api.mutate(id, action: .init(kind: "react", enabled: intended, emoji: symbol))
                guard api.account.memberID == userID, var latest = changes[id]?[symbol] else { return }
                latest.confirmed = intended
                changes[id, default: [:]][symbol] = latest
            } catch {
                guard api.account.memberID == userID, var latest = changes[id]?[symbol] else { return }
                latest.intended = latest.confirmed
                latest.saving = false
                latest.renewed = .now
                changes[id, default: [:]][symbol] = latest
                failed()
                return
            }
        }
    }
}
