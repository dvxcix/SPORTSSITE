import SwiftUI

@main
struct SlipSurgeApp: App {
    @AppStorage("appearance") private var appearance = Appearance.system
    @UIApplicationDelegateAdaptor(PushNotifications.self) private var push
    @Environment(\.scenePhase) private var phase
    @State private var account = AccountStore()
    @State private var notificationOpen: InboxNotificationOpen?
    @State private var incomingURL: URL?

    var body: some Scene {
        WindowGroup {
            SlipSurgeTabs(account: account, appearance: $appearance, incomingURL: $incomingURL, notificationOpen: $notificationOpen)
                .environmentObject(push)
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
                    await push.updateAccount(account)
                }
                .onChange(of: phase) { _, state in
                    if state == .active { Task { await push.sync() } }
                }
        }
    }
}

enum Appearance: String, CaseIterable {
    case system = "System"
    case light = "Light"
    case dark = "Dark"

    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum Brand {
    static func accent(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? 0xB4FF4D : 0x3F6A13)
    }

    static func background(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? 0x0C1118 : 0xEDF0F4)
    }

    static func surface(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? 0x141B25 : 0xFFFFFF)
    }

    static func text(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? 0xF1F5FB : 0x182331)
    }
}

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
