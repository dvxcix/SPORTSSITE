import ImageIO
import SwiftUI

struct MovingAvatarDecoration: View {
    let item: AvatarArtwork.Decoration
    @State private var sprite: AvatarMotion.Sprite?

    var body: some View {
        Group {
            if let sprite, sprite.id == item.id {
                TimelineView(.animation(minimumInterval: 1 / 20)) { timeline in
                    if let image = sprite.frame(at: timeline.date) {
                        Image(decorative: image, scale: 1).resizable().scaledToFit()
                    }
                }
            } else if let image = AvatarArtwork.still(item) {
                Image(decorative: image, scale: 1).resizable().scaledToFit()
            }
        }
        .task(id: item.id) {
            let loaded = await AvatarMotion.load(item.id)
            if !Task.isCancelled { sprite = loaded }
        }
    }
}

@MainActor private enum AvatarMotion {
    struct Entry: Decodable, Sendable {
        let frames: Int
        let duration: Double
        let offset: Int
        let length: Int
    }

    private struct Index: Decodable {
        let size: Int
        let columns: Int
        let items: [String: Entry]
    }

    final class Sprite: Sendable {
        let id: String
        let image: CGImage
        let entry: Entry
        let size: Int
        let columns: Int

        init(id: String, image: CGImage, entry: Entry, size: Int, columns: Int) {
            self.id = id
            self.image = image
            self.entry = entry
            self.size = size
            self.columns = columns
        }

        func frame(at date: Date) -> CGImage? {
            let progress = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: entry.duration) / entry.duration
            let index = min(entry.frames - 1, Int(progress * Double(entry.frames)))
            return image.cropping(to: CGRect(x: index % columns * size, y: index / columns * size, width: size, height: size))
        }
    }

    private static let index: Index? = {
        guard let url = Bundle.main.url(forResource: "AvatarMotion", withExtension: "json"),
              let bytes = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Index.self, from: bytes)
    }()
    private static let bytes: Data? = {
        guard let url = Bundle.main.url(forResource: "AvatarMotion", withExtension: "bin") else { return nil }
        return try? Data(contentsOf: url, options: .mappedIfSafe)
    }()
    private static let cache: NSCache<NSString, Sprite> = {
        let value = NSCache<NSString, Sprite>()
        value.totalCostLimit = 36 * 1024 * 1024
        return value
    }()
    private static var requests: [String: Task<Sprite?, Never>] = [:]

    static func load(_ id: String) async -> Sprite? {
        if let sprite = cache.object(forKey: id as NSString) { return sprite }
        if let request = requests[id] { return await request.value }
        guard let index, let entry = index.items[id], let bytes,
              entry.frames > 1, entry.duration > 0, entry.offset >= 0, entry.length > 0,
              entry.offset <= bytes.count, entry.length <= bytes.count - entry.offset else { return nil }
        let request = Task.detached(priority: .utility) { () -> Sprite? in
            let data = bytes.subdata(in: entry.offset..<(entry.offset + entry.length))
            let options = [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, options) else { return nil }
            return Sprite(id: id, image: image, entry: entry, size: index.size, columns: index.columns)
        }
        requests[id] = request
        let decoded = await request.value
        requests[id] = nil
        if let decoded { cache.setObject(decoded, forKey: id as NSString, cost: decoded.image.bytesPerRow * decoded.image.height) }
        return decoded
    }
}
