import SwiftUI

enum SlipPalette {
    case light, dark, color

    var colorScheme: ColorScheme { self == .light ? .light : .dark }

    var accent: Color {
        switch self {
        case .light: Color(rgb: 0x3F6A13)
        case .dark: Color(rgb: 0xB4FF4D)
        case .color: Color(rgb: 0xA5E89C)
        }
    }

    var background: Color {
        switch self {
        case .light: Color(rgb: 0xEDF0F4)
        case .dark: Color(rgb: 0x0C1118)
        case .color: Color(rgb: 0x0B1510)
        }
    }

    var surface: Color {
        switch self {
        case .light: .white
        case .dark: Color(rgb: 0x141B25)
        case .color: Color(rgb: 0x14271C)
        }
    }

    var text: Color {
        switch self {
        case .light: Color(rgb: 0x182331)
        case .dark: Color(rgb: 0xF1F5FB)
        case .color: Color(rgb: 0xF0F8EE)
        }
    }

    static let glow = Color(rgb: 0x327747)
    static let iconHighlight = Color(rgb: 0xCCF4A0)
    static let iconShadow = Color(rgb: 0x62CA8C)

    static var iconGradient: LinearGradient {
        LinearGradient(colors: [iconHighlight, iconShadow], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var actionFill: AnyShapeStyle {
        self == .color ? AnyShapeStyle(Self.iconGradient) : AnyShapeStyle(Color(rgb: 0xB4FF4D))
    }

    var selectionGradient: LinearGradient {
        let colors = self == .color
            ? [Color(rgb: 0x32633D), Color(rgb: 0x1B3B2A)]
            : [accent.opacity(self == .dark ? 0.17 : 0.13)]
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

extension EnvironmentValues {
    @Entry var slipAppearance: Appearance = .system

    var slipPalette: SlipPalette {
        if slipAppearance == .color { return .color }
        return colorScheme == .dark ? .dark : .light
    }
}
