import SwiftUI

enum SlipGlyph: String {
    case feed = "ss-icon-feed"
    case research = "ss-icon-research"
    case community = "ss-icon-community"
    case inbox = "ss-icon-inbox"
    case you = "ss-icon-you"
    case oddsBoard = "ss-icon-odds-board"
    case mismatch = "ss-icon-mismatch"
    case cheatsheets = "ss-icon-cheatsheets"
    case slateEdge = "ss-icon-slate-edge"
    case compareBooks = "ss-icon-compare-books"
    case firstBasket = "ss-icon-first-basket"
    case marketStory = "ss-icon-market-story"

    static func image(_ name: String, filled: Bool = false) -> Image {
        guard let glyph = Self(rawValue: name) else { return Image(systemName: name) }
        return Image(filled ? "\(glyph.rawValue)-filled" : glyph.rawValue).renderingMode(.template)
    }

    static func view(_ name: String, size: CGFloat) -> some View {
        SlipGlyphView(name: name, size: size)
    }
}

extension Label where Title == Text, Icon == Image {
    init(_ title: String, glyph: String, filled: Bool = false) {
        self.init(title: { Text(title) }, icon: { SlipGlyph.image(glyph, filled: filled) })
    }
}

private struct SlipGlyphView: View {
    let name: String
    let size: CGFloat
    @Environment(\.slipPalette) private var palette

    var body: some View {
        let image = SlipGlyph.image(name, filled: palette == .color)
            .resizable()
            .scaledToFit()
        Group {
            if palette == .color {
                SlipPalette.iconGradient.mask { image }
            } else {
                image
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
