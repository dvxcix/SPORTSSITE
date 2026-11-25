import SwiftUI

@main
struct SlipSurgeApp: App {
    @AppStorage("appearance") private var appearance = Appearance.system

    @State private var account = AccountStore()

    var body: some Scene {
        WindowGroup {
            SlipSurgeTabs(account: account, appearance: $appearance)
            .preferredColorScheme(appearance.scheme)
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
        guard let hex, hex.count == 7, hex.hasPrefix("#"),
              let rgb = UInt32(hex.dropFirst(), radix: 16) else { return nil }
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
