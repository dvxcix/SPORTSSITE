import Foundation

enum SlipSurgeHTTP {
    static let site = "www.slipsurge.com"

    struct Status: Error {
        let code: Int
        let data: Data
    }

    static func get<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem] = []
    ) async throws -> Response {
        let request = try request(host: site, path: path, query: query, timeout: 120)
        return try JSONDecoder().decode(Response.self, from: await send(request))
    }

    @MainActor
    static func memberData(
        _ path: String, query: [URLQueryItem] = [],
        account: AccountStore, userID: UUID
    ) async throws -> Data {
        var request = try request(host: site, path: path, query: query, timeout: 120)
        let token = try await account.accessToken(for: userID)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data: Data
        do {
            data = try await send(request)
        } catch let error as Status where error.code == 401 {
            let renewed = try await account.accessToken(for: userID, replacing: token)
            request.setValue("Bearer \(renewed)", forHTTPHeaderField: "Authorization")
            data = try await send(request)
        }
        try Task.checkCancellation()
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return data
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
