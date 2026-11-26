import Foundation

struct GameTimeline {
    struct Person: Equatable {
        var id: String? = nil
        let name: String
        let headshot: URL?
        let team: String?

        var portrait: URL? { headshot.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
        var shortName: String {
            let pieces = name.split(maxSplits: 1, whereSeparator: \.isWhitespace)
            guard pieces.count == 2, let initial = pieces[0].first else { return name }
            return "\(initial). \(pieces[1])"
        }
    }

    enum Context {
        case timeout, substitution, period, foul, rebound

        var glyph: String {
            switch self {
            case .timeout: "pause.fill"
            case .substitution: "arrow.left.arrow.right"
            case .period: "flag.checkered"
            case .foul: "whistle"
            case .rebound: "arrow.uturn.up"
            }
        }
    }

    struct Entry: Identifiable {
        let play: GameCenterData.Play
        var headline: String
        var detail: String?
        var person: Person?
        var secondary: Person?
        var madeShot: Bool?
        var context: Context?
        let freeThrow: FreeThrow?
        var stats: [BasketballPlayTimeline.Stat] = []
        var notes: [BasketballPlayTimeline.Note] = []

        var id: String { play.id }

        var contextTitle: String {
            if context == .substitution, let person { return "\(person.name) checks in" }
            return headline
        }
    }

    struct Row: Identifiable {
        let entries: [Entry]
        var id: String { entries[0].id }
        var first: Entry { entries[0] }

        var substitutions: String? {
            guard entries.count > 1 else { return nil }
            let incoming = entries.compactMap { $0.person?.name }
            let outgoing = entries.compactMap { $0.secondary?.name }
            let inLabel = incoming.isEmpty ? nil : "In " + incoming.joined(separator: ", ")
            let outLabel = outgoing.isEmpty ? nil : "Out " + outgoing.joined(separator: ", ")
            let clubs = [inLabel, outLabel].compactMap { $0 }
            return clubs.isEmpty ? "\(entries.count) substitutions" : clubs.joined(separator: " · ")
        }
    }

    static func rows(_ entries: [Entry], keeping requested: String?) -> [Row] {
        var rows: [Row] = []
        var substitutions: [Entry] = []
        for entry in entries {
            if let first = substitutions.first,
               entry.context != .substitution || entry.play.teamId != first.play.teamId ||
               entry.play.clock != first.play.clock || entry.play.period != first.play.period || entry.id == requested {
                rows.append(.init(entries: substitutions))
                substitutions.removeAll(keepingCapacity: true)
            }
            if entry.context == .substitution && entry.id != requested {
                substitutions.append(entry)
            } else {
                rows.append(.init(entries: [entry]))
            }
        }
        if !substitutions.isEmpty { rows.append(.init(entries: substitutions)) }
        return rows
    }

    struct FreeThrow {
        let attempt: Int
        let total: Int
    }

    struct Cue: Identifiable {
        let id: String
        let headline: String
        let detail: String?
        let teamID: String?
        let person: Person?
        let glyph: String
    }

    let entries: [Entry]
    let latestPlayID: String?
    private let attachedTo: [String: String]

    init(plays: [GameCenterData.Play] = [], groups: [GameCenterData.StatGroup] = [],
         basketball: Bool = false, completeHistory: Bool = false) {
        let roster = Roster(groups)
        let raw = plays.map { play in
            let title = Self.cleaned(play.title ?? "")
            let text = Self.cleaned(play.text)
            let lower = title.lowercased()
            let people = play.athletes.isEmpty ? roster.people(in: text) : play.athletes.map(roster.person)
            let primary = people.first
            let secondary = people.dropFirst().first
            let context: Context?
            switch lower {
            case _ where lower.contains("timeout") || text.lowercased().hasSuffix("timeout"): context = .timeout
            case _ where lower.contains("substitution"): context = .substitution
            case "end period", "start period", "end of period", "start of period", "halftime", "end of game": context = .period
            default: context = nil
            }
            let attempt: FreeThrow? = if basketball {
                Self.freeThrow(in: title) ?? Self.freeThrow(in: text) ??
                    (play.shot?.attempted == 1 ? FreeThrow(attempt: 1, total: 1) : nil)
            } else { nil }
            let outcome = basketball ? Self.shotOutcome(in: text, shooter: primary) : nil
            var headline = title.isEmpty ? (text.isEmpty ? "Play" : text) : title
            var detail = text.isEmpty || text == headline ? nil : text
            if let attempt {
                headline = "Free throw \(attempt.attempt) of \(attempt.total)"
                if let outcome { detail = outcome.made ? "Made" : "Missed" }
            } else if let outcome {
                headline = outcome.headline
                detail = outcome.detail
            } else if context == .timeout {
                headline = "Timeout"
                detail = nil
            } else if context == .substitution {
                detail = secondary.map { "\($0.name) checks out" } ?? detail
            } else if context == .period, !text.isEmpty {
                headline = text
                detail = nil
            } else if let primary, text.caseInsensitiveCompare("\(primary.name) \(headline)") == .orderedSame {
                detail = nil
            }
            return Entry(play: play, headline: headline, detail: detail, person: primary, secondary: secondary,
                         madeShot: outcome?.made, context: context, freeThrow: attempt)
        }
        latestPlayID = raw.first?.id
        if basketball {
            let grouped = BasketballPlayTimeline(raw, completeHistory: completeHistory)
            entries = grouped.entries
            attachedTo = grouped.attachedTo
        } else {
            entries = raw
            attachedTo = [:]
        }
    }

    func displayID(for playID: String) -> String? {
        attachedTo[playID] ?? entries.first(where: { $0.id == playID })?.id
    }

    func currentCue(status: String?) -> Cue? {
        guard let latest = entries.first,
              latestPlayID == latest.id || latest.context == nil else { return nil }
        let play = latest.play
        let clock = [play.period, play.clock].compactMap { $0 }.joined(separator: " · ")
        if let status, latest.context != .period || !Self.isPeriodBreak(status) {
            guard let current = Self.seconds(in: status), let time = play.clock.flatMap(Self.seconds),
                  abs(current - time) <= 2 else { return nil }
        }
        if latest.context == .period {
            let score = if let away = play.away, let home = play.home { "\(away)–\(home)" } else { clock }
            return Cue(id: play.id, headline: latest.headline, detail: score, teamID: nil,
                       person: nil, glyph: Context.period.glyph)
        }

        // A change of players doesn't clear a timeout or free throws at the same stopped clock.
        let stoppage = entries.prefix { $0.play.period == play.period && $0.play.clock == play.clock }
            .first { $0.context != .substitution } ?? latest
        let event = stoppage.play
        if stoppage.context == .timeout {
            return Cue(id: event.id, headline: "Team timeout", detail: clock, teamID: event.teamId,
                       person: nil, glyph: "pause.fill")
        }
        if let attempt = stoppage.freeThrow, attempt.attempt < attempt.total {
            return Cue(id: event.id, headline: "Free throws coming",
                       detail: ["Attempt \(attempt.attempt + 1) of \(attempt.total)", clock].filter { !$0.isEmpty }.joined(separator: " · "),
                       teamID: event.teamId, person: stoppage.person, glyph: "basketball")
        }
        if event.text.localizedCaseInsensitiveContains("will shoot"),
           event.text.localizedCaseInsensitiveContains("free throw") {
            return Cue(id: event.id, headline: "Free throws coming", detail: clock, teamID: event.teamId,
                       person: stoppage.person, glyph: "basketball")
        }
        if latest.context == .substitution {
            let changes = entries.prefix {
                $0.context == .substitution && $0.play.teamId == play.teamId &&
                $0.play.period == play.period && $0.play.clock == play.clock
            }
            let detail = Row(entries: Array(changes)).substitutions
            return Cue(id: play.id, headline: detail == nil ? latest.contextTitle : "Lineup change",
                       detail: detail ?? latest.detail ?? clock, teamID: play.teamId,
                       person: detail == nil ? latest.person : nil, glyph: Context.substitution.glyph)
        }
        return nil
    }

    private static func isPeriodBreak(_ status: String) -> Bool {
        let status = status.lowercased()
        return status.contains("halftime") || status.hasPrefix("end") || status.contains("intermission") || status == "final"
    }

    private static func seconds(in text: String) -> Double? {
        let clock = text.split(separator: " ").first ?? ""
        let parts = clock.split(separator: ":")
        if parts.count == 2, let minutes = Double(parts[0]), let seconds = Double(parts[1]) { return minutes * 60 + seconds }
        return Double(clock)
    }

    private static func cleaned(_ text: String) -> String {
        text.replacingOccurrences(of: "\\n", with: " ").split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    private static func freeThrow(in title: String) -> FreeThrow? {
        guard let match = title.firstMatch(of: /(?i)free throw\s*(?:-\s*)?(\d+)\s+of\s+(\d+)/),
              let index = Int(match.1), let total = Int(match.2), index > 0, index <= total, total <= 3 else { return nil }
        return FreeThrow(attempt: index, total: total)
    }

    private static func shotOutcome(in text: String, shooter: Person?) -> (headline: String, detail: String?, made: Bool)? {
        guard let shooter, let match = text.range(of: shooter.name, options: [.anchored, .caseInsensitive]) else { return nil }
        let action = text[match.upperBound...].trimmingCharacters(in: .whitespaces)
        guard let decision = action.firstMatch(of: /(?i)^(makes|misses)\s+(.+)$/) else { return nil }
        let description = decision.2.replacingOccurrences(of: "three point", with: "three-point")
            .replacingOccurrences(of: "two point", with: "two-point")
        let parts = description.split(separator: "(", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let shot = parts.first, !shot.isEmpty else { return nil }
        let made = decision.1.lowercased() == "makes"
        let detail = parts.dropFirst().first.map { $0.hasSuffix(")") ? String($0.dropLast()) : $0 }
        return ("\(made ? "Made" : "Missed") \(shot)", detail, made)
    }

    private struct Roster {
        let names: [String: [Person]]
        let matcher: NSRegularExpression?

        init(_ groups: [GameCenterData.StatGroup]) {
            var names: [String: [Person]] = [:]
            for group in groups {
                for player in group.players where player.name.contains(" ") {
                    let key = player.name.lowercased()
                    let person = Person(name: player.name, headshot: player.headshot, team: group.team)
                    var candidates = names[key, default: []]
                    if let index = candidates.firstIndex(where: { $0.team == group.team }) {
                        if candidates[index].headshot == nil { candidates[index] = person }
                    } else {
                        candidates.append(person)
                    }
                    names[key] = candidates
                }
            }
            self.names = names
            let tokens = names.keys.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern(for:))
            matcher = tokens.isEmpty ? nil : try? NSRegularExpression(
                pattern: "(?<![\\p{L}\\p{N}])(?:\(tokens.joined(separator: "|")))(?![\\p{L}\\p{N}])",
                options: .caseInsensitive)
        }

        func people(in text: String) -> [Person] {
            guard let matcher else { return [] }
            var seen = Set<String>()
            return matcher.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
                guard let range = Range(match.range, in: text) else { return nil }
                let name = text[range].lowercased()
                guard seen.insert(name).inserted, let candidates = names[name], candidates.count == 1 else { return nil }
                return candidates.first
            }
        }

        func person(_ athlete: GameCenterData.Play.Athlete) -> Person {
            let candidates = names[athlete.name.lowercased()]
            let roster = candidates?.count == 1 ? candidates?.first : nil
            return Person(id: athlete.id, name: athlete.name, headshot: athlete.headshot ?? roster?.headshot, team: roster?.team)
        }
    }
}
