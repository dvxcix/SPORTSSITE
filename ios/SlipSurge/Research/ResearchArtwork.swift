import ImageIO
import SwiftUI

struct ResearchArtwork: View {
    let urls: [URL]
    let fallback: String?
    var contentMode: ContentMode = .fit
    var fallbackText: String?
    var pointSize: CGFloat?
    @Environment(\.displayScale) private var displayScale
    @State private var artwork: (requests: [ArtworkRequest], image: CGImage)?

    var body: some View {
        let requests = urls.map { ArtworkRequest(url: $0, pointSize: pointSize, scale: displayScale) }
        let image = artwork?.requests == requests ? artwork?.image : requests.lazy.compactMap(ResearchArtworkCache.cachedImage).first
        Group {
            if let image {
                Image(decorative: image, scale: 1).resizable().aspectRatio(contentMode: contentMode)
            } else if let fallbackText {
                Text(fallbackText)
            } else if let fallback {
                Image(systemName: fallback)
            } else {
                Color.clear
            }
        }
        .task(id: requests) {
            for request in requests {
                if let image = await ResearchArtworkCache.shared.image(for: request) {
                    if !Task.isCancelled { artwork = (requests, image) }
                    return
                }
                if Task.isCancelled { return }
            }
        }
        .accessibilityHidden(true)
    }
}

struct PostArtwork: View {
    let url: URL
    let label: String
    let maxHeight: CGFloat
    var pointSize: CGFloat = 440
    @Environment(\.displayScale) private var displayScale
    @State private var loaded: (request: ArtworkRequest, image: CGImage)?
    @State private var failed: ArtworkRequest?

    var body: some View {
        let request = ArtworkRequest(url: url, pointSize: pointSize, scale: displayScale)
        let image = loaded?.request == request ? loaded?.image : ResearchArtworkCache.cachedImage(for: request)
        Group {
            if let image {
                Image(decorative: image, scale: 1).resizable().scaledToFit()
                    .frame(maxHeight: maxHeight)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(label)
            } else {
                Rectangle().fill(.quaternary)
                    .frame(maxWidth: .infinity)
                    .frame(height: min(maxHeight, 144))
                    .overlay {
                        if failed == request { Label("Media unavailable", systemImage: "photo").font(.subheadline) }
                        else { Image(systemName: "photo").foregroundStyle(.secondary).accessibilityLabel("Loading image") }
                    }
            }
        }
        .task(id: request) {
            if let image = await ResearchArtworkCache.shared.image(for: request) {
                if !Task.isCancelled { loaded = (request, image); failed = nil }
            } else if !Task.isCancelled {
                failed = request
            }
        }
    }
}

private struct ArtworkRequest: Hashable, Sendable {
    private static let sizes = [96, 144, 192, 256, 384, 512, 768, 1024, 1280, 1536]
    let url: URL
    let pixels: Int

    init(url: URL, pointSize: CGFloat?, scale: CGFloat) {
        self.url = url
        if let pointSize {
            let requested = pointSize * scale
            pixels = Self.sizes.first { CGFloat($0) >= requested } ?? 1536
        } else {
            pixels = 1024
        }
    }

    var key: NSString { "\(pixels):\(url.absoluteString)" as NSString }
}

private actor ResearchArtworkCache {
    private final class Entry: Sendable {
        let image: CGImage
        let expiresAt = Date.now.addingTimeInterval(15 * 60)

        init(_ image: CGImage) { self.image = image }
    }

    // NSCache synchronizes access. Views can read a hit synchronously on reappearance.
    private final class Memory: @unchecked Sendable {
        let images = NSCache<NSString, Entry>()
        init(megabytes: Int) { images.totalCostLimit = megabytes * 1_024 * 1_024 }
    }

    static let shared = ResearchArtworkCache()
    private static let thumbnails = Memory(megabytes: 12)
    private static let largeArtwork = Memory(megabytes: 32)
    private let session: URLSession
    private var loading: [ArtworkRequest: Task<CGImage?, Never>] = [:]

    private init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.urlCache = URLCache(memoryCapacity: 16 * 1_024 * 1_024, diskCapacity: 0, directory: nil)
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 25
        session = URLSession(configuration: configuration)
    }

    nonisolated static func cachedImage(for request: ArtworkRequest) -> CGImage? {
        guard let entry = memory(for: request).images.object(forKey: request.key), entry.expiresAt > .now else { return nil }
        return entry.image
    }

    nonisolated private static func memory(for request: ArtworkRequest) -> Memory {
        request.pixels <= 384 ? thumbnails : largeArtwork
    }

    func image(for key: ArtworkRequest) async -> CGImage? {
        let url = key.url
        guard url.scheme?.lowercased() == "https", url.host != nil, url.user == nil, url.password == nil else { return nil }
        if let image = Self.cachedImage(for: key) { return image }
        if let request = loading[key] { return await request.value }
        let request = Task.detached(priority: .utility) { [session] in await Self.download(key, with: session) }
        loading[key] = request
        let image = await request.value
        loading[key] = nil
        if let image {
            Self.memory(for: key).images.setObject(Entry(image), forKey: key.key, cost: image.bytesPerRow * image.height)
        }
        return image
    }

    private static func download(_ request: ArtworkRequest, with session: URLSession) async -> CGImage? {
        guard let (data, response) = try? await session.data(from: request.url),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              data.count <= 12 * 1_024 * 1_024,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: request.pixels,
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
        ResearchArtwork(urls: portraits, fallback: "person.fill", pointSize: 48)
            .foregroundStyle(.white)
            .frame(width: 48, height: 48)
            .background {
                LinearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
            .clipShape(.rect(cornerRadius: 10))
            .overlay(alignment: .bottomTrailing) {
                if let logo {
                    ResearchArtwork(urls: [logo], fallback: "shield", pointSize: 17)
                        .padding(2)
                        .frame(width: 17, height: 17)
                        .background(.background, in: .circle)
                        .offset(x: 3, y: 3)
                }
            }
            .accessibilityHidden(true)
    }
}
