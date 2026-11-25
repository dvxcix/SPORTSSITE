import Foundation

struct GameCenterData: Decodable {
    struct Periods: Decodable, Identifiable {
        let team: String
        let logo: URL?
        let periods: [Int?]
        let total: String
        var id: String { team }
    }

    struct Leader: Decodable {
        let team: String
        let label: String
        let value: String
        let name: String
        let headshot: URL?
        let logo: URL?
    }

    struct Play: Decodable, Identifiable {
        struct Athlete: Decodable, Identifiable { let id: String; let name: String; let headshot: URL? }
        struct Reaction: Decodable { let count: Int; let mine: Bool }
        let id: String
        let title: String?
        let text: String
        let period: String?
        let clock: String?
        let home: Int?
        let away: Int?
        let scoring: Bool
        let teamId: String?
        let athletes: [Athlete]
        let reactions: [String: Reaction]
    }

    struct TeamStats: Decodable, Identifiable {
        struct Value: Decodable, Identifiable {
            let name: String
            let displayValue: String
            let label: String?
            var id: String { name }
        }
        let team: String
        let logo: URL?
        let stats: [Value]?
        var id: String { team }
    }

    struct StatGroup: Decodable, Identifiable {
        struct Player: Decodable, Identifiable {
            let id: String
            let name: String
            let headshot: URL?
            let position: String?
            let values: [String]
        }
        let id: String
        let team: String
        let category: String?
        let labels: [String]
        let players: [Player]
    }

    struct Message: Decodable, Identifiable {
        struct Sender: Decodable {
            let username: String?
            let displayName: String?
            let avatarUrl: URL?
            let isVerified: Bool?
        }
        let id: UUID
        let userId: UUID
        let content: String
        let createdAt: String
        let sender: Sender?
    }

    let sport: String
    let id: String
    let state: String
    let status: String?
    let venue: String?
    let awayScore: String?
    let homeScore: String?
    let quarters: [Periods]?
    let updatedAt: String?
    let complete: Bool?
    let broadcasts: [String]?
    let leaders: [Leader]?
    let plays: [Play]?
    let teamStats: [TeamStats]?
    let groups: [StatGroup]?
    let picks: [FeedPost]?
    let room: [Message]?
}
