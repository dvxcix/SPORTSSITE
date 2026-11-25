import Foundation

struct CommunityEventsAPI {
    struct Event: Decodable, Identifiable {
        struct Host: Decodable {
            let username: String
            let displayName: String?
            let avatarUrl: URL?
            let isVerified: Bool?
        }

        let id: UUID
        let title: String
        let description: String?
        let location: String?
        let startDate: String
        let endDate: String?
        let sport: String?
        let isOnline: Bool
        let link: String?
        let coverImage: URL?
        let goingCount: Int?
        let interestedCount: Int?
        let host: Host?

        var start: Date? { SidelineBoard.timestamp(startDate) }
        var end: Date? { endDate.flatMap(SidelineBoard.timestamp) }
        var url: URL? { link.flatMap(SiteAnnouncements.link) }
    }

    enum Attendance: String, Decodable, CaseIterable, Identifiable {
        case going, interested, notGoing = "not_going"
        var id: Self { self }
        var label: String {
            switch self { case .going: "I’m Going"; case .interested: "Interested"; case .notGoing: "Can’t Go" }
        }
        var symbol: String {
            switch self { case .going: "checkmark"; case .interested: "star"; case .notGoing: "xmark" }
        }
    }

    struct Calendar: Decodable {
        let upcoming: [Event]
        let past: [Event]
        let sports: [String]
    }

    struct Detail: Decodable {
        let event: Event
        let rsvp: Attendance?
    }

    struct Draft: Encodable {
        let kind = "create"
        let id: UUID
        let title: String
        let description: String
        let location: String
        let start: String
        let end: String?
        let sport: String
        let online: Bool
        let link: String
    }

    let viewer: DiscoverAPI
    private static let path = "/api/mobile/events"
    private static let adminPath = "/api/mobile/admin/events"

    func available() async -> Bool {
        struct Access: Decodable { let enabled: Bool }
        return (try? await viewer.readPublic(Access.self, path: Self.path, query: [.init(name: "view", value: "access")]))?.enabled == true
    }

    func calendar() async throws -> Calendar { try await viewer.readPublic(Calendar.self, path: Self.path) }

    func event(_ id: UUID) async throws -> Detail {
        try await viewer.readPublic(Detail.self, path: Self.path,
            query: [.init(name: "view", value: "detail"), .init(name: "id", value: id.uuidString.lowercased())])
    }

    func create(_ draft: Draft) async throws -> UUID {
        struct Created: Decodable { let id: UUID }
        let result = try await viewer.write(Created.self, path: Self.path, body: draft)
        guard result.id == draft.id else { throw URLError(.badServerResponse) }
        return result.id
    }

    func attend(_ event: UUID, status: Attendance?) async throws -> Detail {
        struct Change: Encodable {
            let id: UUID
            let status: Attendance?

            enum CodingKeys: String, CodingKey { case kind, id, status }

            func encode(to encoder: any Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode("attendance", forKey: .kind)
                try container.encode(id, forKey: .id)
                try container.encode(status?.rawValue, forKey: .status)
            }
        }
        let raw = try await viewer.write(Detail.self, path: Self.path, body: Change(id: event, status: status), keyDecodingStrategy: .convertFromSnakeCase)
        guard raw.event.id == event, raw.rsvp == status else { throw URLError(.badServerResponse) }
        return raw
    }

    func administration() async throws -> [Event] {
        struct Response: Decodable { let events: [Event] }
        return try await viewer.readPublic(Response.self, path: Self.adminPath).events
    }

    func remove(_ event: UUID) async throws {
        struct Response: Decodable { let removed: UUID }
        guard let userID = viewer.userID else { throw URLError(.userAuthenticationRequired) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.adminPath,
            query: [.init(name: "id", value: event.uuidString.lowercased())])
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(try await viewer.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        let value = try JSONDecoder().decode(Response.self, from: await SlipSurgeHTTP.send(request))
        guard value.removed == event, await viewer.account.memberID == userID else { throw URLError(.badServerResponse) }
    }

}
