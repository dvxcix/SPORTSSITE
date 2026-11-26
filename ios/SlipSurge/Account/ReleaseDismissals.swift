import Foundation

enum ReleaseDismissals {
    static func pending(for userID: UUID, defaults: UserDefaults = .standard) -> Set<UUID> {
        Set(defaults.stringArray(forKey: key(userID))?.compactMap(UUID.init(uuidString:)) ?? [])
    }

    static func enqueue(_ id: UUID, for userID: UUID, defaults: UserDefaults = .standard) {
        let queued = pending(for: userID, defaults: defaults).union([id])
        defaults.set(queued.map(\.uuidString), forKey: key(userID))
    }

    static func confirm(_ id: UUID, for userID: UUID, defaults: UserDefaults = .standard) {
        let queued = pending(for: userID, defaults: defaults).subtracting([id])
        if queued.isEmpty { defaults.removeObject(forKey: key(userID)) }
        else { defaults.set(queued.map(\.uuidString), forKey: key(userID)) }
    }

    private static func key(_ userID: UUID) -> String { "slipsurge.pendingReleases." + userID.uuidString }
}
