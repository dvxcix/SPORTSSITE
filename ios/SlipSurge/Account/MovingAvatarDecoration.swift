import ImageIO
import SwiftUI

struct MovingAvatarDecoration: View {
    let item: AvatarArtwork.Decoration
    let size: CGFloat
    let playing: Bool
    @Environment(\.displayScale) private var displayScale
    @State private var sprite: AvatarMotion.Sprite?
    @State private var visible = false

    private var key: AvatarMotion.Key {
        let pixels = size * displayScale
        return .init(id: item.id, pixels: pixels <= 96 ? 96 : 144)
    }

    var body: some View {
        Group {
            if let sprite, sprite.key == key {
                AvatarFramePlayer(sprite: sprite, playing: playing && visible)
            } else if let still = AvatarArtwork.still(item) {
                Image(decorative: still, scale: 1).resizable().scaledToFit()
            }
        }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .task(id: key) {
            let requested = key
            let loaded = await AvatarMotion.load(requested)
            if !Task.isCancelled { sprite = loaded }
        }
    }
}

private struct AvatarFramePlayer: UIViewRepresentable {
    let sprite: AvatarMotion.Sprite
    let playing: Bool

    func makeUIView(context: Context) -> PlayerView {
        let player = PlayerView()
        player.layer.contentsGravity = .resizeAspect
        player.layer.actions = ["contents": NSNull()]
        player.isUserInteractionEnabled = false
        player.isAccessibilityElement = false
        return player
    }

    func updateUIView(_ player: PlayerView, context: Context) {
        player.present(sprite, playing: playing)
    }

    static func dismantleUIView(_ player: PlayerView, coordinator: ()) {
        player.clear()
    }

    final class PlayerView: UIView {
        private var sprite: AvatarMotion.Sprite?
        private var playing = false
        private var lastFrame: Int?

        func present(_ sprite: AvatarMotion.Sprite, playing: Bool) {
            guard self.sprite !== sprite || self.playing != playing else { return }
            self.sprite = sprite
            self.playing = playing
            updatePlayback()
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            updatePlayback()
        }

        func clear() {
            sprite = nil
            playing = false
            updatePlayback()
        }

        private func updatePlayback() {
            lastFrame = nil
            layer.contents = sprite?.frames.first
            if window != nil, playing, sprite != nil {
                AvatarFrameClock.shared.add(self)
                drawFrame(at: CACurrentMediaTime())
            } else {
                AvatarFrameClock.shared.remove(self)
            }
        }

        func drawFrame(at time: CFTimeInterval) {
            guard let sprite else { return }
            let progress = time.truncatingRemainder(dividingBy: sprite.duration) / sprite.duration
            let frame = min(sprite.frames.count - 1, Int(progress * Double(sprite.frames.count)))
            guard lastFrame != frame else { return }
            lastFrame = frame
            layer.contents = sprite.frames[frame]
        }
    }
}

@MainActor private final class AvatarFrameClock: NSObject {
    static let shared = AvatarFrameClock()
    private let players = NSHashTable<AvatarFramePlayer.PlayerView>.weakObjects()
    private var link: CADisplayLink?

    func add(_ player: AvatarFramePlayer.PlayerView) {
        players.add(player)
        guard link == nil else { return }
        let displayLink = CADisplayLink(target: self, selector: #selector(tick(_:)))
        displayLink.preferredFrameRateRange = .init(minimum: 24, maximum: 30, preferred: 30)
        displayLink.add(to: .main, forMode: .common)
        link = displayLink
    }

    func remove(_ player: AvatarFramePlayer.PlayerView) {
        players.remove(player)
        if players.allObjects.isEmpty { stop() }
    }

    @objc private func tick(_ link: CADisplayLink) {
        let visible = players.allObjects
        if visible.isEmpty { stop(); return }
        for player in visible { player.drawFrame(at: link.targetTimestamp) }
    }

    private func stop() {
        link?.invalidate()
        link = nil
    }
}

@MainActor private enum AvatarMotion {
    struct Key: Hashable, Sendable {
        let id: String
        let pixels: Int
    }

    private struct Entry: Decodable, Sendable {
        let frames: Int
        let duration: Double
        let offset: Int
        let length: Int
    }

    private struct Index: Decodable, Sendable {
        let size: Int
        let columns: Int
        let items: [String: Entry]
    }

    final class Sprite: Sendable {
        let key: Key
        let frames: [CGImage]
        let duration: Double
        let memoryCost: Int

        init(key: Key, frames: [CGImage], duration: Double, memoryCost: Int) {
            self.key = key
            self.frames = frames
            self.duration = duration
            self.memoryCost = memoryCost
        }
    }

    nonisolated private static let resources: (index: Index, bytes: Data)? = {
        guard let metadata = Bundle.main.url(forResource: "AvatarMotion", withExtension: "json"),
              let pack = Bundle.main.url(forResource: "AvatarMotion", withExtension: "bin"),
              let data = try? Data(contentsOf: metadata),
              let index = try? JSONDecoder().decode(Index.self, from: data),
              let bytes = try? Data(contentsOf: pack, options: .mappedIfSafe),
              index.size > 0, index.columns > 0 else { return nil }
        return (index, bytes)
    }()
    private static let decodeQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.qualityOfService = .userInitiated
        queue.maxConcurrentOperationCount = 2
        return queue
    }()
    private static let cache: NSCache<NSString, Sprite> = {
        let value = NSCache<NSString, Sprite>()
        value.totalCostLimit = 44 * 1024 * 1024
        return value
    }()
    private static var requests: [Key: Task<Sprite?, Never>] = [:]

    static func load(_ key: Key) async -> Sprite? {
        let cacheKey = "\(key.id)-\(key.pixels)" as NSString
        if let sprite = cache.object(forKey: cacheKey) { return sprite }
        if let request = requests[key] { return await request.value }
        let request: Task<Sprite?, Never> = Task {
            await withCheckedContinuation { continuation in
                decodeQueue.addOperation {
                    guard let resources, let entry = resources.index.items[key.id],
                          entry.frames > 1, entry.duration > 0, entry.offset >= 0, entry.length > 0,
                          entry.offset <= resources.bytes.count, entry.length <= resources.bytes.count - entry.offset else {
                        continuation.resume(returning: nil)
                        return
                    }
                    let data = resources.bytes.subdata(in: entry.offset..<(entry.offset + entry.length))
                    continuation.resume(returning: decode(data, entry: entry, index: resources.index, key: key))
                }
            }
        }
        requests[key] = request
        let decoded = await request.value
        requests[key] = nil
        if let decoded { cache.setObject(decoded, forKey: cacheKey, cost: decoded.memoryCost) }
        return decoded
    }

    private nonisolated static func decode(_ data: Data, entry: Entry, index: Index, key: Key) -> Sprite? {
        let options = [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let original = CGImageSourceCreateImageAtIndex(source, 0, options) else { return nil }
        let size = min(key.pixels, index.size)
        let height = (entry.frames + index.columns - 1) / index.columns * size
        let width = index.columns * size
        // A crop from a compressed WebP can retain its lazy decoder. Flatten the
        // atlas on the decode queue before Core Animation sees any of its frames.
        guard let drawing = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        drawing.interpolationQuality = size == index.size ? .none : .medium
        drawing.draw(original, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let atlas = drawing.makeImage() else { return nil }
        guard atlas.width == width, atlas.height == height else { return nil }
        let frames = (0..<entry.frames).compactMap { frame in
            atlas.cropping(to: CGRect(x: frame % index.columns * size, y: frame / index.columns * size,
                width: size, height: size))
        }
        guard frames.count == entry.frames else { return nil }
        return Sprite(key: key, frames: frames, duration: entry.duration, memoryCost: atlas.bytesPerRow * atlas.height)
    }
}
