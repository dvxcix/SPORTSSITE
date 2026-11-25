import Foundation

struct CourtToolAPI {
    let scope: CourtView.Scope

    func read<Value: Decodable>(_ type: Value.Type, tool: String, publicPath: String? = nil, query: [URLQueryItem]) async throws -> Value {
        let data: Data
        switch scope {
        case .preview:
            guard let publicPath else { throw SlipSurgeHTTP.Status(code: 403, data: Data()) }
            let request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/preview/nba/data",
                query: [.init(name: "resource", value: publicPath)] + query, timeout: 120)
            data = try await SlipSurgeHTTP.send(request)
        case .member(let account, let userID):
            data = try await SlipSurgeHTTP.memberData("/api/mobile/court/tools",
                query: [.init(name: "tool", value: tool)] + query, account: account, userID: userID)
        }
        guard data.count <= 3_145_728 else { throw URLError(.cannotParseResponse) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}
