import SwiftUI

@main
struct SlipSurgeApp: App {
    @AppStorage("appearance") private var appearance = Appearance.color
    @UIApplicationDelegateAdaptor(PushNotifications.self) private var push
    @Environment(\.scenePhase) private var phase
    @State private var account = AccountStore()
    @State private var notificationOpen: InboxNotificationOpen?
    @State private var incomingURL: URL?

    var body: some Scene {
        WindowGroup {
            SlipSurgeTabs(account: account, appearance: $appearance, incomingURL: $incomingURL, notificationOpen: $notificationOpen)
                .environmentObject(push)
                .environment(\.slipAppearance, appearance)
                .environment(\.symbolVariants, appearance == .color ? .fill : .none)
                .preferredColorScheme(appearance.scheme)
                .onOpenURL { url in
                    if url.scheme == EmailAuthAttempt.scheme {
                        Task { await account.openEmail(url) }
                    } else if ResearchDeepLink(url) != nil || NativeSiteLink(url) != nil {
                        incomingURL = url
                    }
                }
                .task(id: account.memberID) {
                    push.onOpen = { notificationOpen = InboxNotificationOpen(notificationID: $0) }
                    push.onOpenGame = { incomingURL = $0 }
                    await push.updateAccount(account)
                }
                .task(id: account.memberID) {
                    guard let userID = account.memberID else { return }
                    await UltimateAppleSubscription.observe(account: account, userID: userID)
                }
                .onChange(of: phase) { _, state in
                    if state == .active { Task { await push.sync() } }
                }
        }
    }
}

@Observable final class IncomingNavigation {
    private(set) var revision = 0

    func receivedLink() { revision += 1 }
}

extension EnvironmentValues {
    @Entry var incomingNavigation: IncomingNavigation?
}

enum Appearance: String, CaseIterable {
    case color = "Color"
    case system = "System"
    case light = "Light"
    case dark = "Dark"

    var symbol: String {
        switch self {
        case .color: "paintpalette.fill"
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark, .color: .dark
        }
    }
}

enum Brand {}

extension Color {
    init?(hex: String?) {
        guard let hex else { return nil }
        let digits = hex.hasPrefix("#") ? hex.dropFirst() : hex[...]
        guard digits.count == 6, digits.allSatisfy({ $0.isASCII && $0.isHexDigit }),
              let rgb = UInt32(digits, radix: 16) else { return nil }
        self.init(rgb: rgb)
    }

    init(rgb: UInt32) {
        self.init(
            red: Double((rgb >> 16) & 255) / 255,
            green: Double((rgb >> 8) & 255) / 255,
            blue: Double(rgb & 255) / 255
        )
    }
}
