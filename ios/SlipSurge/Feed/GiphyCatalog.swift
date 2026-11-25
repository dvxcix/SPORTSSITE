import Foundation

struct GiphyCatalog {
    enum Placement: String {
        case feed = "Feed"
        case messages = "Messages"
        case forum = "Forum"
    }

    struct Clip: Identifiable {
        let id: String
        let title: String
        let previewURL: URL
        let url: URL
    }

    struct Page {
        let clips: [Clip]
        let next: Int?
    }

    private struct Payload: Decodable {
        struct Item: Decodable {
            struct Rendition: Decodable { let url: URL? }
            let id: String
            let title: String
            let images: [String: Rendition]
        }

        struct Pagination: Decodable {
            let offset: Int
            let count: Int
            let total_count: Int
        }

        let data: [Item]
        let pagination: Pagination
    }

    private let key: String

    init?(_ placement: Placement) {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "SlipSurgeGiphy\(placement.rawValue)Key") as? String,
              value.range(of: #"^[a-zA-Z0-9_-]{16,128}$"#, options: .regularExpression) != nil else { return nil }
        key = value
    }

    func page(search: String, offset: Int) async throws -> Page {
        var params: [URLQueryItem] = [
            .init(name: "api_key", value: key), .init(name: "rating", value: "pg"),
            .init(name: "offset", value: String(offset)), .init(name: "limit", value: "24"),
        ]
        if !search.isEmpty { params.append(.init(name: "q", value: search)) }
        let endpoint = search.isEmpty ? "/v1/gifs/trending" : "/v1/gifs/search"
        let request = try SlipSurgeHTTP.request(host: "api.giphy.com", path: endpoint, query: params, timeout: 10)
        let result = try JSONDecoder().decode(Payload.self, from: await SlipSurgeHTTP.send(request))
        let clips = result.data.compactMap { item -> Clip? in
            guard let preview = item.images["fixed_width_small"]?.url,
                  let shared = item.images["fixed_width"]?.url ?? item.images["fixed_height"]?.url,
                  NativeGIFSource.isGIPHY(preview), NativeGIFSource.isGIPHY(shared) else { return nil }
            return Clip(id: item.id, title: item.title.isEmpty ? "GIF" : item.title, previewURL: preview, url: shared)
        }
        let page = result.pagination
        let next = page.offset == offset && (1...24).contains(page.count) ? offset + page.count : nil
        return Page(clips: clips, next: next.flatMap { $0 < min(3000, page.total_count) ? $0 : nil })
    }
}
