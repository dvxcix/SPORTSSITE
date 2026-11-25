import Foundation

struct GameTimeline {
    struct Person: Equatable {
        let name: String
        let headshot: URL?
        let team: String?

        var portrait: URL? { headshot.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
    }

    struct Entry: Identifiable {
        let play: GameCenterData.Play
        let headline: String
        let detail: String?
        let person: Person?
        let secondary: Person?
        let madeShot: Bool?
        let timeout: Bool
        let freeThrow: FreeThrow?

        var id: String { play.id }
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

    init(plays: [GameCenterData.Play] = [], groups: [GameCenterData.StatGroup] = [], basketball: Bool = false) {
        let roster = Roster(groups)
        entries = plays.map { play in
            let title = Self.cleaned(play.title ?? "")
            let text = Self.cleaned(play.text)
            let lower = title.lowercased()
            let people = play.athletes.isEmpty ? roster.people(in: text) : play.athletes.map(roster.person)
            let primary = people.first
            let secondary = people.dropFirst().first
            let timeout = lower.contains("timeout") || text.lowercased().hasSuffix("timeout")
            let attempt = basketball ? Self.freeThrow(in: title) : nil
            let outcome = basketball ? Self.shotOutcome(in: text, shooter: primary) : nil
            var headline = title.isEmpty ? (text.isEmpty ? "Play" : text) : title
            var detail = text.isEmpty || text == headline ? nil : text
            if let attempt {
                headline = "Free throw \(attempt.attempt) of \(attempt.total)"
                if let outcome { detail = outcome.made ? "Made" : "Missed" }
            } else if let outcome {
                headline = outcome.headline
                detail = outcome.detail
            } else if timeout {
                headline = "Timeout"
                detail = nil
            } else if let primary, text.caseInsensitiveCompare("\(primary.name) \(headline)") == .orderedSame {
                detail = nil
            }
            return Entry(play: play, headline: headline, detail: detail, person: primary, secondary: secondary,
                         madeShot: outcome?.made, timeout: timeout, freeThrow: attempt)
        }
    }

    func currentCue(status: String?) -> Cue? {
        guard let latest = entries.first else { return nil }
        let play = latest.play
        let clock = [play.period, play.clock].compactMap { $0 }.joined(separator: " · ")
        if let status {
            guard let current = Self.seconds(in: status), let time = play.clock.flatMap(Self.seconds),
                  abs(current - time) <= 2 else { return nil }
        }

        // Substitutions at a stopped clock don't end the timeout or the free-throw sequence.
        let stoppage = entries.prefix { $0.play.period == play.period && $0.play.clock == play.clock }
            .first { $0.play.title?.localizedCaseInsensitiveContains("substitution") != true }
        guard let stoppage else { return nil }
        let event = stoppage.play
        if stoppage.timeout {
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
        return nil
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
        guard let match = title.firstMatch(of: /(?i)free throw\s*-\s*(\d+)\s+of\s+(\d+)/),
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
            return Person(name: athlete.name, headshot: athlete.headshot ?? roster?.headshot, team: roster?.team)
        }
    }
}
