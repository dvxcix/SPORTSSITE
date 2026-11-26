import Foundation

struct BasketballPlayTimeline {
    struct Stat: Identifiable {
        let label: String
        let value: String
        var id: String { label }
    }

    struct Note: Identifiable {
        let play: GameCenterData.Play
        let title: String
        let glyph: String
        let person: GameTimeline.Person?
        let stat: Stat?
        var id: String { "\(play.id):\(glyph)" }
    }

    private struct Shooting {
        var made = 0
        var attempts = 0

        mutating func record(_ scored: Bool) {
            attempts += 1
            if scored { made += 1 }
        }

        func stat(_ label: String, percentage: Bool = false) -> Stat {
            let ratio = "\(made)/\(attempts)"
            let percent = attempts == 0 ? 0 : Int((100 * Double(made) / Double(attempts)).rounded())
            return Stat(label: label, value: percentage ? "\(ratio) · \(percent)%" : ratio)
        }
    }

    private struct Line {
        var points = 0
        var fieldGoals = Shooting()
        var threes = Shooting()
        var frees = Shooting()
        var blocks = 0
        var rebounds = 0
        var assists = 0
        var steals = 0
        var turnovers = 0
        var fouls = 0

        mutating func shot(_ shot: GameCenterData.Play.Shot) {
            points += shot.scored
            let made = shot.scored > 0
            if shot.attempted == 1 {
                frees.record(made)
            } else {
                fieldGoals.record(made)
                if shot.attempted == 3 { threes.record(made) }
            }
        }

        func stats(for shot: GameCenterData.Play.Shot) -> [Stat] {
            let shooting: Stat = switch shot.attempted {
            case 1: frees.stat("FT")
            case 3: threes.stat("3PT", percentage: true)
            default: fieldGoals.stat("FG")
            }
            return [shooting, .init(label: "PTS", value: "\(points)")]
        }
    }

    private struct FoulTrip {
        let foul: Int
        let note: Note
        var lastAttempt: Int?
        var shooter: String?
    }

    let entries: [GameTimeline.Entry]
    let attachedTo: [String: String]

    init(_ newestFirst: [GameTimeline.Entry], completeHistory: Bool) {
        var chronological = Array(newestFirst.reversed())
        var lines: [String: Line] = [:]
        var folded: [Int: Int] = [:]
        var missedShot: Int?
        var trip: FoulTrip?

        func credit(_ person: GameTimeline.Person?, _ update: (inout Line) -> Void) -> Line? {
            guard completeHistory, let key = Self.key(person) else { return nil }
            update(&lines[key, default: Line()])
            return lines[key]
        }

        for index in chronological.indices {
            var entry = chronological[index]
            let play = entry.play
            let kind = entry.headline.lowercased()
            let sourceKind = play.title?.lowercased() ?? kind
            let action = play.text.lowercased()
            if let current = trip, !Self.sameClock(chronological[current.foul].play, play) { trip = nil }

            if sourceKind.contains("rebound") {
                let label = sourceKind.contains("offensive") ? "Offensive rebound" : "Defensive rebound"
                let total = credit(entry.person) { $0.rebounds += 1 }?.rebounds
                entry.headline = label
                entry.context = .rebound
                let note = Note(play: play, title: label, glyph: "arrow.uturn.up",
                    person: entry.person, stat: Self.stat("REB", total))
                if let miss = missedShot, Self.belongsToShot(rebound: play, shot: chronological[miss].play) {
                    chronological[miss].notes.append(note)
                    folded[index] = miss
                } else {
                    entry.detail = entry.person?.shortName ?? entry.detail
                }
                missedShot = nil
            } else if (sourceKind.contains("foul") && !sourceKind.contains("turnover")) || sourceKind == "offensive charge" {
                let total = credit(entry.person) { $0.fouls += 1 }?.fouls
                entry.context = .foul
                entry.detail = entry.person?.shortName ?? entry.detail
                trip = FoulTrip(foul: index, note: Note(play: play, title: entry.headline, glyph: "whistle",
                    person: entry.person, stat: Self.stat("PF", total)))
                missedShot = nil
            } else if let shot = Self.shot(for: entry) {
                let blocked = action.contains(" blocks ")
                let blockerLeads = blocked && (entry.person.map { action.hasPrefix($0.name.lowercased() + " blocks ") } ?? false)
                let blocker = blocked ? (blockerLeads ? entry.person : entry.secondary) : nil
                if blockerLeads { entry.person = entry.secondary }
                if blocked {
                    entry.headline = "Blocked \(Self.blockedShotDescription(play.text))"
                    let total = credit(blocker) { $0.blocks += 1 }?.blocks
                    entry.notes.append(Note(play: play, title: "Block", glyph: "hand.raised.fill",
                        person: blocker, stat: Self.stat("BLK", total)))
                    entry.detail = nil
                    entry.secondary = nil
                } else if shot.scored > 0, action.contains(" assists"), let passer = entry.secondary {
                    let total = credit(passer) { $0.assists += 1 }?.assists
                    entry.notes.append(Note(play: play, title: "Assist", glyph: "arrow.turn.down.right",
                        person: passer, stat: Self.stat("AST", total)))
                    entry.detail = nil
                    entry.secondary = nil
                }
                entry.madeShot = shot.scored > 0
                if let line = credit(entry.person, { $0.shot(shot) }) { entry.stats = line.stats(for: shot) }
                missedShot = shot.scored == 0 ? index : nil
                if let freeThrow = entry.freeThrow, var current = trip,
                   chronological[current.foul].play.teamId != play.teamId,
                   current.lastAttempt == nil || (current.shooter == Self.key(entry.person) && freeThrow.attempt > 1) {
                    if let last = current.lastAttempt {
                        chronological[last].notes.removeAll { $0.id == current.note.id }
                    }
                    entry.notes.append(current.note)
                    folded[current.foul] = index
                    current.lastAttempt = index
                    current.shooter = Self.key(entry.person)
                    trip = freeThrow.attempt < freeThrow.total ? current : nil
                } else if entry.freeThrow == nil {
                    trip = nil
                }
            } else if entry.context == nil {
                missedShot = nil
                trip = nil
                if sourceKind.contains("turnover") {
                    if let total = credit(entry.person, { $0.turnovers += 1 })?.turnovers {
                        entry.stats.append(.init(label: "TO", value: "\(total)"))
                    }
                    if action.contains(" steals"), let defender = entry.secondary {
                        let total = credit(defender) { $0.steals += 1 }?.steals
                        entry.notes.append(Note(play: play, title: "Steal", glyph: "hand.tap",
                            person: defender, stat: Self.stat("STL", total)))
                        entry.detail = nil
                        entry.secondary = nil
                    }
                }
            } else if entry.context != .substitution {
                missedShot = nil
            }
            chronological[index] = entry
        }
        attachedTo = Dictionary(uniqueKeysWithValues: folded.map { (chronological[$0.key].id, chronological[$0.value].id) })
        entries = chronological.indices.reversed().compactMap { folded[$0] == nil ? chronological[$0] : nil }
    }

    private static func key(_ person: GameTimeline.Person?) -> String? { person?.id ?? person?.name.lowercased() }

    private static func stat(_ label: String, _ value: Int?) -> Stat? {
        value.map { Stat(label: label, value: "\($0)") }
    }

    private static func shot(for entry: GameTimeline.Entry) -> GameCenterData.Play.Shot? {
        if let shot = entry.play.shot { return shot }
        let text = entry.play.text.lowercased()
        let title = entry.play.title?.lowercased() ?? ""
        guard !title.contains("no shot") else { return nil }
        guard entry.madeShot != nil || entry.freeThrow != nil || text.contains(" blocks ") else { return nil }
        let points = if entry.freeThrow != nil || text.contains("free throw") { 1 }
            else if text.firstMatch(of: /three[- ]point|3[- ]point|three[- ]pointer/) != nil { 3 } else { 2 }
        return .init(attempted: points, scored: entry.madeShot == true || entry.play.scoring ? points : 0)
    }

    private static func sameClock(_ lhs: GameCenterData.Play, _ rhs: GameCenterData.Play) -> Bool {
        lhs.period == rhs.period && lhs.clock != nil && lhs.clock == rhs.clock
    }

    private static func belongsToShot(rebound: GameCenterData.Play, shot: GameCenterData.Play) -> Bool {
        guard rebound.period == shot.period else { return false }
        if sameClock(rebound, shot) { return true }
        guard let start = clockSeconds(shot.clock), let end = clockSeconds(rebound.clock) else { return false }
        return (0...8).contains(start - end)
    }

    private static func clockSeconds(_ clock: String?) -> Double? {
        guard let clock else { return nil }
        let pieces = clock.split(separator: ":").compactMap { Double($0) }
        if pieces.count == 2 { return pieces[0] * 60 + pieces[1] }
        return pieces.first
    }

    private static func blockedShotDescription(_ text: String) -> String {
        let description = text.split(separator: "'s ", maxSplits: 1).last.map(String.init) ?? ""
        guard description != text, !description.isEmpty else { return "shot" }
        return description
    }
}
