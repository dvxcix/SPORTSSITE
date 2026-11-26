import Foundation
import os
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
    private let delivery = OSAllocatedUnfairLock(initialState: Optional<Delivery>.none)

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        let original = request.content
        guard let artwork = NotificationArtwork(userInfo: original.userInfo) else {
            contentHandler(original)
            return
        }

        let current = Delivery(content: original, handler: contentHandler)
        let previous = delivery.withLock { value in
            let previous = value
            value = current
            return previous
        }
        previous?.finish()

        Task {
            let attachment = await artwork.attachment()
            current.finish(attachment: attachment)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        delivery.withLock { $0 }?.finish()
    }

    private final class Delivery: Sendable {
        private struct Pending {
            let content: UNNotificationContent
            let handler: (UNNotificationContent) -> Void
        }

        private let pending: OSAllocatedUnfairLock<Pending?>

        init(content: UNNotificationContent, handler: @escaping (UNNotificationContent) -> Void) {
            pending = OSAllocatedUnfairLock(uncheckedState: Pending(content: content, handler: handler))
        }

        func finish(attachment: UNNotificationAttachment? = nil) {
            let value = pending.withLockUnchecked { pending in
                let value = pending
                pending = nil
                return value
            }
            guard let value else { return }
            if let attachment, let enriched = value.content.mutableCopy() as? UNMutableNotificationContent {
                enriched.attachments = [attachment]
                value.handler(enriched)
            } else {
                value.handler(value.content)
            }
        }
    }
}
