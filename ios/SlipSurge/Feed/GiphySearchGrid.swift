@preconcurrency import GiphyUISDK
import SwiftUI

struct GiphySearchGrid: UIViewControllerRepresentable {
    let query: String
    var onUpdate: (Int, Bool) -> Void
    var onSearch: (String) -> Void
    var onSelect: (URL) -> Void

    static var isConfigured: Bool { configuration }

    private static let configuration: Bool = {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SlipSurgeGiphyIOSSDKKey") as? String,
              key.range(of: #"^[a-zA-Z0-9_-]{16,128}$"#, options: .regularExpression) != nil else { return false }
        Giphy.configure(apiKey: key)
        GPHCache.shared.cache.diskCapacity = 0
        GPHCache.shared.cache.memoryCapacity = 16 * 1024 * 1024
        return true
    }()

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> GiphyGridController {
        let controller = GiphyGridController()
        controller.delegate = context.coordinator
        controller.numberOfTracks = 2
        controller.direction = .vertical
        controller.cellPadding = 6
        controller.rating = .ratedPG
        controller.theme = GPHTheme(type: .automatic)
        controller.view.backgroundColor = .clear
        return controller
    }

    func updateUIViewController(_ controller: GiphyGridController, context: Context) {
        let observer = context.coordinator
        observer.onUpdate = onUpdate
        observer.onSearch = onSearch
        observer.onSelect = onSelect
        guard observer.query != query else { return }
        observer.query = query
        controller.content = query.isEmpty ? .trending(mediaType: .gif)
            : .search(withQuery: query, mediaType: .gif, language: .english)
        controller.update()
    }

    @MainActor final class Coordinator: NSObject, GPHGridDelegate {
        var query: String?
        var onUpdate: ((Int, Bool) -> Void)?
        var onSearch: ((String) -> Void)?
        var onSelect: ((URL) -> Void)?

        func contentDidUpdate(resultCount: Int, error: (any Error)?) {
            let failed = error != nil
            Task { @MainActor in onUpdate?(resultCount, failed) }
        }

        func didSelectMoreByYou(query: String) { onSearch?(query) }

        func didScroll(offset: CGFloat) {}

        func didSelectMedia(media: GPHMedia, cell: UICollectionViewCell) {
            guard let file = media.url(rendition: .fixedWidth, fileType: .gif),
                  let url = URL(string: file), NativeGIFSource.isGIPHY(url) else { return }
            onSelect?(url)
        }
    }
}
