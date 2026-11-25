import SwiftUI

struct SiteLink: View {
    let title: String
    let path: String

    init(_ title: String, path: String) {
        self.title = title
        self.path = path
    }

    var body: some View {
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = path
        return Group {
            if let url = components.url {
                Link(destination: url) {
                    HStack {
                        Text(title)
                        Spacer()
                        Image(systemName: "arrow.up.right").accessibilityHidden(true)
                    }
                }
                .accessibilityHint("Opens the SlipSurge website")
            }
        }
    }
}
