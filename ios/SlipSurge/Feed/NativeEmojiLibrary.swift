import ImageIO
import SwiftUI

@MainActor @Observable final class NativeEmojiLibrary {
    struct Entry: Decodable, Identifiable {
        struct Category: Decodable { let name: String }
        let code: String
        let imageUrl: URL
        let category: Category?
        var id: String { code }
    }

    struct StandardGroup: Decodable, Identifiable {
        struct Emoji: Decodable, Identifiable {
            let code: String
            let char: String
            var id: String { code }
        }
        let label: String
        let emoji: [Emoji]
        var id: String { label }
    }

    private struct Catalog: Decodable { let emojis: [Entry]; let standard: [StandardGroup] }
    private(set) var standard: [StandardGroup] = []
    private(set) var custom: [Entry] = []
    private(set) var icons: [String: CGImage] = [:]
    private(set) var revision = 0
    private var standardByCode: [String: String] = [:]
    private var customByCode: [String: Entry] = [:]
    private var requests: [String: Task<CGImage?, Never>] = [:]
    private var refreshed: Date?
    private var loading = false
    private var refreshQueued = false

    func refresh(force: Bool = false) async {
        if loading {
            if force { refreshQueued = true }
            return
        }
        guard force || refreshed.map({ Date().timeIntervalSince($0) > 180 }) != false else { return }
        loading = true
        defer {
            loading = false
            if refreshQueued {
                refreshQueued = false
                Task { await refresh(force: true) }
            }
        }
        do {
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/emojis", timeout: 15)
            let response = try await SlipSurgeHTTP.send(request)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let catalog = try decoder.decode(Catalog.self, from: response)
            try Task.checkCancellation()
            let verified = catalog.emojis.filter { FeedPostCard.allowedMedia($0.imageUrl) }
            let next = Dictionary(verified.map { ($0.code, $0) }, uniquingKeysWith: { first, _ in first })
            for code in Array(icons.keys) where next[code]?.imageUrl != customByCode[code]?.imageUrl { icons[code] = nil }
            customByCode = next
            standard = catalog.standard
            custom = verified
            standardByCode = Dictionary(standard.flatMap(\.emoji).map { ($0.code, $0.char) }, uniquingKeysWith: { first, _ in first })
            revision += 1
            refreshed = Date()
        } catch { }
    }

    func entry(for code: String) -> Entry? { customByCode[code] }
    func unicode(for code: String) -> String? { standardByCode[code] }

    func loadIcons(_ codes: [String]) async {
        let pairs = Set(codes).sorted().prefix(12).compactMap { code in entry(for: code).map { (code, $0.imageUrl) } }
        for (code, url) in pairs where icons[code] == nil && requests[code] == nil {
            requests[code] = Task { try? await Self.icon(url) }
        }
        for (code, url) in pairs {
            guard let request = requests[code] else { continue }
            let result = await request.value
            requests[code] = nil
            if customByCode[code]?.imageUrl == url { icons[code] = result }
        }
        if icons.count > 350 {
            let visible = Set(codes)
            for code in icons.keys.sorted().prefix(icons.count - 350) where !visible.contains(code) { icons[code] = nil }
        }
    }

    nonisolated private static func icon(_ url: URL) async throws -> CGImage {
        let session = URLSession(configuration: .ephemeral)
        defer { session.finishTasksAndInvalidate() }
        let (body, response) = try await session.bytes(from: url)
        let limit = 4_100_000
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
            response.url?.host == url.host, response.expectedContentLength <= Int64(limit) else { throw URLError(.badServerResponse) }
        var data = Data()
        for try await byte in body {
            guard data.count < limit else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        let options = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 72] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
            let icon = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { throw URLError(.cannotDecodeContentData) }
        return icon
    }
}

extension EnvironmentValues {
    @Entry var nativeEmojiLibrary: NativeEmojiLibrary?
}

struct NativeInlineEmojiText: View {
    let source: String
    let linkify: @MainActor (String) -> AttributedString
    @Environment(\.nativeEmojiLibrary) private var library
    @ScaledMetric(relativeTo: .body) private var iconSize = 17.0

    var body: some View {
        let matches = source.matches(of: #/:([a-z0-9_]{2,30}):/#)
        content(matches.map { (range: $0.range, code: String($0.output.1)) })
            .task(id: matches.map { String($0.output.1) }.joined(separator: "|") + "|\(library?.revision ?? 0)") {
                guard !matches.isEmpty else { return }
                await library?.loadIcons(matches.map { String($0.output.1) })
            }
    }

    private func content(_ matches: [(range: Range<String.Index>, code: String)]) -> Text {
        guard !matches.isEmpty, let library else { return Text(linkify(source)) }
        let attributed = linkify(source)
        var cursor = attributed.startIndex
        var rendered = Text("")
        for match in matches {
            guard let start = AttributedString.Index(match.range.lowerBound, within: attributed),
                  let end = AttributedString.Index(match.range.upperBound, within: attributed),
                  attributed[start..<end].link == nil else { continue }
            let replaced: Text
            if let icon = library.icons[match.code] {
                let scale = Double(max(icon.width, icon.height)) / iconSize
                replaced = Text(Image(decorative: icon, scale: scale)).accessibilityLabel(Text(match.code))
            } else if library.entry(for: match.code) == nil, let symbol = library.unicode(for: match.code) {
                replaced = Text(symbol)
            } else {
                continue
            }
            let before = Text(AttributedString(attributed[cursor..<start]))
            rendered = Text("\(rendered)\(before)\(replaced)")
            cursor = end
        }
        return Text("\(rendered)\(Text(AttributedString(attributed[cursor...])))")
    }
}
