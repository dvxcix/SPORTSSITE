import Foundation

enum SlipSurgeHTTP {
    static let site = "www.slipsurge.com"

    struct Status: Error {
        let code: Int
        let data: Data
    }

    static func get<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        token: String? = nil
    ) async throws -> Response {
        var request = try request(host: site, path: path, query: query, timeout: 120)
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return try JSONDecoder().decode(Response.self, from: await send(request))
    }

    static func request(
        host: String,
        path: String,
        query: [URLQueryItem] = [],
        timeout: TimeInterval = 30
    ) throws -> URLRequest {
        var url = URLComponents()
        url.scheme = "https"
        url.host = host
        url.path = path
        url.queryItems = query.isEmpty ? nil : query
        guard let endpoint = url.url else { throw URLError(.badURL) }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    static func send(_ request: URLRequest) async throws -> Data {
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else { throw Status(code: http.statusCode, data: data) }
        return data
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
