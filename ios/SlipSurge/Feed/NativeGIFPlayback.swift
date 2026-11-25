import ImageIO
import SwiftUI
import UIKit

enum NativeGIFSource {
    static func isProvider(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              url.pathExtension.lowercased() == "gif", let host = url.host?.lowercased() else { return false }
        return ["media.tenor.com", "c.tenor.com"].contains(host) || isGIPHY(url)
    }

    static func isGIPHY(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              url.pathExtension.lowercased() == "gif", let host = url.host?.lowercased() else { return false }
        return host == "i.giphy.com" || host.range(of: #"^media[0-9]?\.giphy\.com$"#, options: .regularExpression) != nil
    }

    static func canPlay(_ url: URL) -> Bool {
        url.pathExtension.lowercased() == "gif" && (isProvider(url) || FeedPostCard.allowedMedia(url))
    }
}

struct NativeGIFPlayback: View {
    private struct Frame: Sendable {
        let image: CGImage
        let duration: Double
    }

    private struct Animation: Sendable {
        let url: URL
        let frames: [Frame]
        let aspect: CGFloat
    }

    let url: URL
    var maxHeight: CGFloat = 220
    var maxWidth: CGFloat = 400
    var label = "GIF"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scene
    @State private var clip: Animation?
    @State private var failed = false
    @State private var revision = 0

    var body: some View {
        Group {
            if let clip, clip.url == url {
                AnimatedLayer(clip: clip, playing: !reduceMotion && scene == .active)
                    .aspectRatio(clip.aspect, contentMode: .fit)
                    .frame(maxWidth: maxWidth, maxHeight: maxHeight)
                    .accessibilityLabel(label)
            } else if failed {
                Button("Retry GIF", systemImage: "arrow.clockwise") { revision += 1 }.font(.subheadline)
            } else {
                ProgressView().frame(maxWidth: maxWidth, minHeight: min(maxHeight, 46), maxHeight: maxHeight)
                    .accessibilityLabel("Loading GIF")
            }
        }
        .task(id: "\(url.absoluteString):\(revision)") {
            failed = false
            do {
                let loaded = try await Self.load(url)
                try Task.checkCancellation()
                clip = loaded
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
        .onDisappear { clip = nil }
    }

    nonisolated private static let byteLimit = 5_000_000

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        return URLSession(configuration: config, delegate: Redirects(), delegateQueue: nil)
    }()

    nonisolated private static func load(_ url: URL) async throws -> Animation {
        try await decode(imageData(url, limit: byteLimit), url: url)
    }

    nonisolated static func thumbnail(_ url: URL, checkingAttachment: Bool = false) async throws -> CGImage {
        let data = try await imageData(url, limit: checkingAttachment ? byteLimit : 1_000_000)
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetType(source) as String? == "com.compuserve.gif",
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 180,
              ] as CFDictionary) else { throw URLError(.cannotDecodeContentData) }
        return image
    }

    nonisolated private static func imageData(_ url: URL, limit: Int) async throws -> Data {
        guard NativeGIFSource.canPlay(url) else { throw URLError(.unsupportedURL) }
        let (body, response) = try await session.bytes(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let resolved = response.url, NativeGIFSource.canPlay(resolved),
              response.expectedContentLength <= Int64(limit) else { throw URLError(.badServerResponse) }
        var data = Data()
        if response.expectedContentLength > 0 { data.reserveCapacity(Int(response.expectedContentLength)) }
        for try await byte in body {
            guard data.count < limit else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        try Task.checkCancellation()
        return data
    }

    nonisolated private static func decode(_ data: Data, url: URL) throws -> Animation {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetType(source) as String? == "com.compuserve.gif" else { throw URLError(.cannotDecodeContentData) }
        let count = CGImageSourceGetCount(source)
        guard count > 0 else { throw URLError(.cannotDecodeContentData) }
        let stride = max(1, Int(ceil(Double(count) / 100)))
        let maxFrameWidth = min(320, Int(sqrt(3_000_000 / Double(min(100, count)))))
        let options = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: maxFrameWidth,
            kCGImageSourceShouldCacheImmediately: true] as CFDictionary
        var frames: [Frame] = []
        for index in Swift.stride(from: 0, to: count, by: stride) {
            try Task.checkCancellation()
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, index, options) else { continue }
            let seconds = (index..<min(count, index + stride)).reduce(0.0) { $0 + delay(source, index: $1) }
            frames.append(Frame(image: image, duration: seconds))
        }
        guard let first = frames.first else { throw URLError(.cannotDecodeContentData) }
        return Animation(url: url, frames: frames, aspect: CGFloat(first.image.width) / CGFloat(first.image.height))
    }

    nonisolated private static func delay(_ source: CGImageSource, index: Int) -> Double {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
        let metadata = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
        let measured = (metadata?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? (metadata?[kCGImagePropertyGIFDelayTime] as? Double)
        if let measured, measured.isFinite, measured >= 0.02 { return min(60, measured) }
        return 0.1
    }

    private final class Redirects: NSObject, URLSessionTaskDelegate {
        nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
            completionHandler(request.url.map(NativeGIFSource.canPlay) == true ? request : nil)
        }
    }

    private struct AnimatedLayer: UIViewRepresentable {
        let clip: Animation
        let playing: Bool

        final class Coordinator {
            var url: URL?
            var playing = false
        }

        func makeCoordinator() -> Coordinator { Coordinator() }

        func makeUIView(context: Context) -> UIView {
            let view = UIView()
            view.layer.contentsGravity = .resizeAspect
            view.clipsToBounds = true
            return view
        }

        func updateUIView(_ view: UIView, context: Context) {
            let previous = context.coordinator
            guard clip.url != previous.url || playing != previous.playing else { return }
            previous.url = clip.url
            previous.playing = playing

            let key = "gifFrames"
            let layer = view.layer
            layer.removeAnimation(forKey: key)
            layer.contents = clip.frames.first?.image
            if playing, clip.frames.count > 1, let first = clip.frames.first {
                let schedule = CAKeyframeAnimation(keyPath: "contents")
                let duration = clip.frames.reduce(0) { $0 + $1.duration }
                var elapsed = 0.0
                schedule.keyTimes = clip.frames.map { frame in
                    defer { elapsed += frame.duration }
                    return NSNumber(value: elapsed / duration)
                } + [1]
                schedule.values = clip.frames.map(\.image) + [first.image]
                schedule.calculationMode = .discrete
                schedule.duration = duration
                schedule.repeatCount = .infinity
                layer.add(schedule, forKey: key)
            }
        }
    }
}

struct NativeSocialBody: View {
    let content: String
    var maxGIFWidth: CGFloat = 350
    var linkify: @MainActor (String) -> AttributedString = SiteAnnouncements.linkedText

    var body: some View {
        let pieces = splitMedia()
        VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(pieces.enumerated()), id: \.offset) { _, piece in
                switch piece {
                case .text(let text):
                    Text(linkify(text))
                case .gif(let url):
                    NativeGIFPlayback(url: url, maxHeight: 190, maxWidth: maxGIFWidth)
                        .clipShape(.rect(cornerRadius: 9))
                }
            }
        }
    }

    private enum Piece {
        case text(String), gif(URL)
    }

    private func splitMedia() -> [Piece] {
        guard content.localizedCaseInsensitiveContains(".gif"),
              let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return [.text(content)] }
        let matches = detector.matches(in: content, range: NSRange(content.startIndex..., in: content))
        var pieces: [Piece] = []
        var cursor = content.startIndex
        var selected = Set<URL>()
        for match in matches {
            guard let url = match.url, NativeGIFSource.canPlay(url), let range = Range(match.range, in: content),
                  selected.count < 2, selected.insert(url).inserted else { continue }
            let before = content[cursor..<range.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
            if !before.isEmpty { pieces.append(.text(before)) }
            pieces.append(.gif(url))
            cursor = range.upperBound
        }
        let remainder = content[cursor...].trimmingCharacters(in: .whitespacesAndNewlines)
        if !remainder.isEmpty { pieces.append(.text(remainder)) }
        return pieces
    }
}
