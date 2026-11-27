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
        struct Shot: Decodable { let attempted: Int; let scored: Int }
        struct Field: Decodable, Equatable {
            let startToGoal: Int
            let endToGoal: Int
            let down: Int?
            let distance: Int?

            var valid: Bool {
                (1...99).contains(startToGoal) && (0...100).contains(endToGoal)
            }

            var yards: Int { startToGoal - endToGoal }
            var firstDownToGoal: Int? {
                guard let distance, (1...startToGoal).contains(distance) else { return nil }
                return startToGoal - distance
            }
        }
        struct Reaction: Decodable, Equatable { let count: Int; let mine: Bool }
        struct Pitch: Decodable, Identifiable {
            let id: Int
            let number: Int?
            let kind: String?
            let call: String
            let strike: Bool
            let speed: Double?
            let spin: Double?
            let x: Double?
            let z: Double?
            let zoneTop: Double?
            let zoneBottom: Double?
            let exitVelocity: Double?
            let launchAngle: Double?
            let distance: Double?
        }
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
        let pitches: [Pitch]?
        var shot: Shot? = nil
        var field: Field? = nil
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
