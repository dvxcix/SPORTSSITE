import AppIntents
import Foundation
import ImageIO
import WidgetKit

enum ScoreLeague: String, AppEnum, Decodable {
    case all, nfl, nba, mlb, nhl, soccer

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "League" }
    static var caseDisplayRepresentations: [Self: DisplayRepresentation] {
        [.all: "All leagues", .nfl: "NFL", .nba: "NBA", .mlb: "MLB", .nhl: "NHL", .soccer: "Soccer"]
    }

    var label: String { self == .soccer ? "Soccer" : rawValue.uppercased() }
}

struct ScoreWidgetConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Scoreboard" }
    static var description: IntentDescription { "Choose a league or see the top games across sports." }

    @Parameter(title: "League", default: .all)
    var league: ScoreLeague
}

struct WidgetScoreboard: Decodable {
    struct League: Decodable {
        let id: ScoreLeague
        let available: Bool
        let games: [Game]
    }

    struct Game: Decodable, Identifiable {
        struct Team: Decodable {
            let name: String
            let abbreviation: String
            let logo: URL?
            let score: String?
        }

        let id: String
        let sport: ScoreLeague
        let start: String
        let state: String
        let status: String?
        let away: Team
        let home: Team

        var startDate: Date? {
            let timestamp = start.utf8.count == 17 && start.hasSuffix("Z") ? String(start.dropLast()) + ":00Z" : start
            return (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(timestamp))
                ?? (try? Date.ISO8601FormatStyle().parse(timestamp))
        }

        var link: URL? {
            guard id.wholeMatch(of: /^[0-9]{1,14}$/) != nil ||
                sport == .nfl && id.wholeMatch(of: /^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$/) != nil else { return nil }
            return URL(string: "slipsurge-app://site/sports/\(sport.rawValue)/\(id)")
        }
    }

    let date: String
    let leagues: [League]
}

struct ScoreWidgetEntry: TimelineEntry {
    let date: Date
    let observedAt: Date?
    let league: ScoreLeague
    let games: [WidgetScoreboard.Game]
    let logos: [URL: CGImage]
    let unavailable: Bool

    var stale: Bool { observedAt.map { date.timeIntervalSince($0) >= 25 * 60 } ?? false }
    static let scoreboardURL = URL(string: "slipsurge-app://site/sports")!

    static func example(league: ScoreLeague = .all) -> Self {
        let gameSport = league == .all ? .nba : league
        return .init(date: .now, observedAt: .now, league: league, games: [
            .init(id: "sample", sport: gameSport, start: "", state: "in", status: "In progress",
                  away: .init(name: "Away team", abbreviation: "AWY", logo: nil, score: "24"),
                  home: .init(name: "Home team", abbreviation: "HME", logo: nil, score: "21"))
        ], logos: [:], unavailable: false)
    }
}

struct ScoreTimeline: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ScoreWidgetEntry { .example() }

    func snapshot(for configuration: ScoreWidgetConfiguration, in context: Context) async -> ScoreWidgetEntry {
        if context.isPreview { return .example(league: configuration.league) }
        return await load(configuration.league, count: context.family == .systemMedium ? 2 : 1)
    }

    func timeline(for configuration: ScoreWidgetConfiguration, in context: Context) async -> Timeline<ScoreWidgetEntry> {
        let entry = await load(configuration.league, count: context.family == .systemMedium ? 2 : 1)
        let now = entry.date
        let intervals = entry.games.filter { $0.state == "pre" }.compactMap(\.startDate)
            .map { max(12 * 60, $0.timeIntervalSince(now) + 60) }
        let refresh = entry.unavailable || entry.games.contains(where: { $0.state == "in" }) ? 12 * 60 : min(30 * 60, intervals.min() ?? 30 * 60)
        let expiry = entry.games.isEmpty ? [] : [
            ScoreWidgetEntry(date: now.addingTimeInterval(25 * 60), observedAt: entry.observedAt, league: entry.league,
                             games: entry.games, logos: entry.logos, unavailable: entry.unavailable)
        ]
        return Timeline(entries: [entry] + expiry, policy: .after(now.addingTimeInterval(refresh)))
    }

    private func load(_ league: ScoreLeague, count: Int) async -> ScoreWidgetEntry {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        let day = formatter.string(from: .now)
        var components = URLComponents()
        components.scheme = "https"
        components.host = "www.slipsurge.com"
        components.path = "/api/mobile/scores"
        components.queryItems = [.init(name: "date", value: day), .init(name: "freshness", value: "live")]

        do {
            guard let url = components.url else { throw URLError(.badURL) }
            let data = try await fetch(url, limit: 512_000, timeout: 8)
            let board = try JSONDecoder().decode(WidgetScoreboard.self, from: data)
            guard board.date == day else { throw URLError(.cannotParseResponse) }
            let leagues = board.leagues.filter { league == .all || $0.id == league }
            let games = Array(leagues.filter(\.available).flatMap(\.games).sorted(by: ordered).prefix(count))
            let logos = await artwork(for: games)
            return .init(date: .now, observedAt: .now, league: league, games: games, logos: logos,
                         unavailable: games.isEmpty && leagues.contains { !$0.available })
        } catch {
            return .init(date: .now, observedAt: nil, league: league, games: [], logos: [:], unavailable: true)
        }
    }

    private func ordered(_ first: WidgetScoreboard.Game, _ second: WidgetScoreboard.Game) -> Bool {
        let priority = ["in": 0, "pre": 1, "post": 2]
        let firstRank = priority[first.state] ?? 3
        let secondRank = priority[second.state] ?? 3
        if firstRank != secondRank { return firstRank < secondRank }
        if first.start != second.start { return first.state == "post" ? first.start > second.start : first.start < second.start }
        return first.id < second.id
    }

    private func artwork(for games: [WidgetScoreboard.Game]) async -> [URL: CGImage] {
        let candidates = Set(games.flatMap { [$0.away.logo, $0.home.logo].compactMap { $0 } })
        let urls = candidates.filter { $0.scheme == "https" && ["a.espncdn.com", "www.mlbstatic.com", "midfield.mlbstatic.com", "loodibee.com"].contains($0.host ?? "") }
        return await withTaskGroup(of: (URL, CGImage?).self) { group in
            for url in urls {
                group.addTask {
                    guard let data = try? await fetch(url, limit: 240_000, timeout: 4),
                          let source = CGImageSourceCreateWithData(data as CFData, nil) else { return (url, nil) }
                    let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: 102, kCGImageSourceCreateThumbnailWithTransform: true]
                    return (url, CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary))
                }
            }
            var images: [URL: CGImage] = [:]
            for await (url, image) in group { images[url] = image }
            return images
        }
    }

    private func fetch(_ url: URL, limit: Int, timeout: TimeInterval) async throws -> Data {
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: timeout)
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200,
              response.url?.host == url.host, response.expectedContentLength <= Int64(limit) else { throw URLError(.badServerResponse) }
        var data = Data()
        for try await byte in bytes {
            guard data.count < limit else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        return data
    }
}
