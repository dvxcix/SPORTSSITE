import SwiftUI

struct SlipBrandLockup: View {
    let width: CGFloat

    @Environment(\.slipPalette) private var palette

    var body: some View {
        Group {
            if palette == .color {
                HStack(spacing: width * 0.06) {
                    Image(.brandDarkIcon)
                        .resizable()
                        .scaledToFit()
                        .frame(width: width * 0.24, height: width * 0.24)
                        .clipShape(.rect(cornerRadius: width * 0.053))
                    Image(.brandWordmarkOnDark)
                        .resizable()
                        .scaledToFit()
                }
            } else {
                Image(.brand)
                    .resizable()
                    .scaledToFit()
            }
        }
        .frame(width: width, height: width * 0.294)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("SlipSurge")
    }
}
