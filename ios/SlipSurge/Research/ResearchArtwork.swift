import SwiftUI

struct ResearchArtwork: View {
    let urls: [URL]
    let fallback: String
    @State private var attempt = 0

    var body: some View {
        Group {
            if urls.indices.contains(attempt) {
                AsyncImage(url: urls[attempt]) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit()
                    case .failure:
                        Image(systemName: fallback)
                            .task(id: urls[attempt]) { attempt += 1 }
                    default:
                        Image(systemName: fallback)
                    }
                }
                .id(urls[attempt])
            } else {
                Image(systemName: fallback)
            }
        }
        .onChange(of: urls) { _, _ in attempt = 0 }
        .accessibilityHidden(true)
    }
}

struct PlayerArtwork: View {
    let portraits: [URL]
    let logo: URL?
    let primary: Color
    let secondary: Color

    var body: some View {
        ResearchArtwork(urls: portraits, fallback: "person.fill")
            .foregroundStyle(.white)
            .frame(width: 48, height: 48)
            .background {
                LinearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
            .clipShape(.rect(cornerRadius: 10))
            .overlay(alignment: .bottomTrailing) {
                if let logo {
                    ResearchArtwork(urls: [logo], fallback: "shield")
                        .padding(2)
                        .frame(width: 17, height: 17)
                        .background(.background, in: .circle)
                        .offset(x: 3, y: 3)
                }
            }
            .accessibilityHidden(true)
    }
}
