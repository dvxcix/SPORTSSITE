import Combine
import Foundation
import UIKit
import UserNotifications

@MainActor
final class PushNotifications: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, ObservableObject {
    private(set) var deviceToken: String?
    private var account: AccountStore?
    private var registered: Registration?
    private var pendingRegistration: (registration: Registration, task: Task<Void, Error>)?
    private var attempt = 0
    private var lastContact: Date?
    var onOpen: ((UUID) -> Void)? {
        didSet {
            if let pending, let onOpen {
                self.pending = nil
                onOpen(pending)
            }
        }
    }
    private var pending: UUID?

    enum State { case unknown, available, authorized, off, connecting, connected, unavailable, failed }

    private enum Category: String, CaseIterable {
        case activity = "SLIPSURGE_ACTIVITY"
        case message = "SLIPSURGE_MESSAGE"
        case game = "SLIPSURGE_GAME"

        static let markRead = "SLIPSURGE_MARK_READ"

        var systemCategory: UNNotificationCategory {
            let read = UNNotificationAction(identifier: Self.markRead, title: "Mark as Read", options: [.authenticationRequired])
            return UNNotificationCategory(identifier: rawValue, actions: [read], intentIdentifiers: [], options: [])
        }
    }

    private struct Registration: Equatable {
        let userID: UUID
        let deviceToken: String
    }

    static var topic: String { Bundle.main.bundleIdentifier ?? "" }

    static var environment: String? {
        let value = Bundle.main.object(forInfoDictionaryKey: "SLIPSURGE_APNS_ENVIRONMENT") as? String
        return value == "development" || value == "production" ? value : nil
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Set(Category.allCases.map(\.systemCategory)))
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        self.deviceToken = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await sync() }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        self.deviceToken = nil
        state = .failed
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let raw = response.notification.request.content.userInfo["notificationId"] as? String,
              let id = UUID(uuidString: raw) else { return }
        switch response.actionIdentifier {
        case UNNotificationDefaultActionIdentifier: await open(id)
        case Category.markRead: await markRead(id)
        default: break
        }
    }

    private func markRead(_ id: UUID) async {
        // The user may choose this action while iOS is restoring a cold app session.
        for _ in 0..<10 {
            if let account, let userID = account.memberID, !signingOut {
                do {
                    try await ActivityAPI(account: account, userID: userID).markRead([id])
                    NotificationCenter.default.post(name: .slipSurgeActivityChanged, object: nil)
                } catch { /* Leave the item unread when the server cannot confirm it. */ }
                return
            }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { return }
        }
    }

    private func open(_ id: UUID) {
        if let onOpen { onOpen(id) } else { pending = id }
    }

    @Published private(set) var state = State.unknown
    @Published private(set) var signingOut = false

    func updateAccount(_ account: AccountStore) async {
        let previous = self.account
        self.account = account
        if registered?.userID != account.memberID, previous != nil {
            registered = nil
            lastContact = nil
        }
        await sync()
    }

    func requestPermission() async {
        guard Self.environment != nil else { state = .unavailable; return }
        do {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            await sync()
        } catch {
            state = .failed
        }
    }

    func sync() async {
        guard !signingOut else { return }
        guard Self.environment != nil else { state = .unavailable; return }
        let account = self.account
        let userID = account?.memberID
        let authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        guard !signingOut, self.account?.memberID == userID else { return }
        switch authorization {
        case .notDetermined: state = .available
        case .denied:
            if let account, let userID { await disconnect(account: account, userID: userID) }
            if self.account?.memberID == userID { state = .off }
        case .authorized, .provisional, .ephemeral:
            guard let account, let userID else { state = .authorized; return }
            if let deviceToken {
                await connect(account: account, current: Registration(userID: userID, deviceToken: deviceToken))
            } else {
                state = .connecting
                UIApplication.shared.registerForRemoteNotifications()
            }
        @unknown default: state = .unavailable
        }
    }

    private func connect(account: AccountStore, current: Registration) async {
        guard pendingRegistration == nil, !signingOut else { return }
        if current == registered, let lastContact, Date.now.timeIntervalSince(lastContact) < 21_600 {
            state = .connected
        } else {
            attempt += 1
            let generation = attempt
            state = .connecting
            let task = Task { try await send("POST", account: account, registration: current) }
            pendingRegistration = (current, task)
            defer { pendingRegistration = nil }
            do {
                try await task.value
                if generation == attempt, account.memberID == current.userID {
                    registered = current
                    lastContact = .now
                    state = .connected
                }
            } catch {
                if generation == attempt { state = .failed }
            }
        }
    }

    func signOut(account: AccountStore) async {
        guard !signingOut, !account.isBusy else { return }
        signingOut = true
        if let userID = account.memberID { await disconnect(account: account, userID: userID) }
        await account.signOut()
        signingOut = false
        if account.memberID != nil { await sync() }
    }

    private func disconnect(account: AccountStore, userID: UUID) async {
        attempt += 1
        var tokens = Set([deviceToken].compactMap { $0 })
        if let registered, registered.userID == userID { tokens.insert(registered.deviceToken) }
        if let pendingRegistration, pendingRegistration.registration.userID == userID {
            tokens.insert(pendingRegistration.registration.deviceToken)
            _ = await pendingRegistration.task.result
        }
        for token in tokens {
            try? await send("DELETE", account: account, registration: Registration(userID: userID, deviceToken: token))
        }
        if registered?.userID == userID {
            registered = nil
            lastContact = nil
        }
    }

    private func send(_ method: String, account: AccountStore, registration: Registration) async throws {
        guard let environment = Self.environment else { throw URLError(.unsupportedURL) }
        let auth = try await account.accessToken(for: registration.userID)
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/push", timeout: 8)
        request.httpMethod = method
        request.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["token": registration.deviceToken, "topic": Self.topic, "environment": environment])
        _ = try await SlipSurgeHTTP.send(request)
    }
}

extension Notification.Name {
    static let slipSurgeActivityChanged = Notification.Name("SlipSurge.ActivityChanged")
}
