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

    private var image: Image { Image(rawValue).renderingMode(.template) }

    static func image(_ name: String) -> Image {
        Self(rawValue: name)?.image ?? Image(systemName: name)
    }

    static func view(_ name: String, size: CGFloat) -> some View {
        image(name)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

extension Label where Title == Text, Icon == Image {
    init(_ title: String, glyph: String) {
        self.init(title: { Text(title) }, icon: { SlipGlyph.image(glyph) })
    }
}
