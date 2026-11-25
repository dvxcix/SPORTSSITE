import ImageIO
import SwiftUI

struct ResearchArtwork: View {
    let urls: [URL]
    let fallback: String
    @State private var artwork: (urls: [URL], image: CGImage)?

    var body: some View {
        Group {
            if let artwork, artwork.urls == urls {
                Image(decorative: artwork.image, scale: 1).resizable().scaledToFit()
            } else {
                Image(systemName: fallback)
            }
        }
        .task(id: urls) {
            let requested = urls
            for url in requested {
                if let image = await ResearchArtworkCache.shared.image(at: url) {
                    if !Task.isCancelled { artwork = (requested, image) }
                    return
                }
                if Task.isCancelled { return }
            }
        }
        .accessibilityHidden(true)
    }
}

private actor ResearchArtworkCache {
    private final class Entry {
        let image: CGImage
        let expiresAt = Date.now.addingTimeInterval(15 * 60)

        init(_ image: CGImage) { self.image = image }
    }

    static let shared = ResearchArtworkCache()
    private let memory = NSCache<NSURL, Entry>()
    private let session: URLSession
    private var loading: [URL: Task<CGImage?, Never>] = [:]

    private init() {
        memory.totalCostLimit = 32 * 1_024 * 1_024
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 25
        session = URLSession(configuration: configuration)
    }

    func image(at url: URL) async -> CGImage? {
        guard url.scheme?.lowercased() == "https", url.host != nil, url.user == nil, url.password == nil else { return nil }
        if let entry = memory.object(forKey: url as NSURL), entry.expiresAt > .now { return entry.image }
        if let request = loading[url] { return await request.value }
        let request = Task.detached(priority: .utility) { [session] in await Self.download(url, with: session) }
        loading[url] = request
        let image = await request.value
        loading[url] = nil
        if let image { memory.setObject(Entry(image), forKey: url as NSURL, cost: image.bytesPerRow * image.height) }
        return image
    }

    private static func download(_ url: URL, with session: URLSession) async -> CGImage? {
        guard let (data, response) = try? await session.data(from: url),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              data.count <= 12 * 1_024 * 1_024,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1_024,
            kCGImageSourceShouldCacheImmediately: true,
        ] as CFDictionary
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options)
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
