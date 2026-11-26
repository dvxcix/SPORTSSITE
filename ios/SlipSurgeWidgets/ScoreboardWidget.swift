import SwiftUI
import WidgetKit

@main
struct ScoreboardWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "SlipSurgeScoreboard", intent: ScoreWidgetConfiguration.self, provider: ScoreTimeline()) { entry in
            ScoreWidgetView(entry: entry)
        }
        .configurationDisplayName("Scoreboard")
        .description("Follow today’s games, scores and start times. Choose a league in Edit Widget.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

private struct ScoreWidgetView: View {
    let entry: ScoreWidgetEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    private var accent: Color { scheme == .dark ? Color(red: 0.71, green: 1, blue: 0.30) : Color(red: 0.23, green: 0.39, blue: 0.07) }

    var body: some View {
        Group {
            if family == .accessoryRectangular { lockScreen }
            else { homeScreen }
        }
        .widgetURL(family == .systemMedium ? ScoreWidgetEntry.scoreboardURL : entry.games.first?.link ?? ScoreWidgetEntry.scoreboardURL)
        .containerBackground(for: .widget) {
            if family != .accessoryRectangular {
                LinearGradient(colors: scheme == .dark
                    ? [Color(red: 0.11, green: 0.16, blue: 0.17), Color(red: 0.05, green: 0.07, blue: 0.10)]
                    : [Color(red: 0.93, green: 0.97, blue: 0.89), Color(red: 0.96, green: 0.97, blue: 0.99)],
                    startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
    }

    private var homeScreen: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 5) {
                Image(systemName: "waveform.path").foregroundStyle(accent).widgetAccentable().accessibilityHidden(true)
                Text("Scoreboard").font(.caption.weight(.heavy))
                Spacer(minLength: 2)
                if entry.league != .all {
                    Text(entry.league.label).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            if entry.games.isEmpty {
                Spacer(minLength: 0)
                emptyTitle.font(.headline)
                Text(entry.unavailable ? "Open SlipSurge to retry" : "Open the full schedule")
                    .font(.caption2).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 1)
                HStack(spacing: 10) {
                    ForEach(entry.games) { game in
                        if family == .systemMedium, let url = game.link {
                            Link(destination: url) { match(game) }
                        } else {
                            match(game)
                        }
                    }
                    if family == .systemMedium && entry.games.count == 1 { Spacer(minLength: 0) }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var lockScreen: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let game = entry.games.first {
                Text(game.sport.label).font(.caption2.weight(.bold)).widgetAccentable()
                HStack(spacing: 4) {
                    Text(game.away.abbreviation)
                    if let away = game.away.score, let home = game.home.score {
                        Text("\(away) – \(home)").monospacedDigit()
                    } else {
                        Text("at").font(.caption)
                    }
                    Text(game.home.abbreviation)
                }.font(.headline)
                status(game).font(.caption2)
            } else {
                Text("SlipSurge Scores").font(.caption2.weight(.bold)).widgetAccentable()
                emptyTitle.font(.headline)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var emptyTitle: Text { Text(entry.unavailable ? "Scores unavailable" : "No games today") }

    private func match(_ game: WidgetScoreboard.Game) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if game.state == "in", !entry.stale {
                    Circle().fill(accent).frame(width: 6, height: 6).accessibilityHidden(true)
                }
                if entry.league == .all {
                    Text(game.sport.label + " ·")
                }
                status(game)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(game.state == "in" && !entry.stale ? accent : .secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            team(game.away)
            team(game.home)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.primary.opacity(0.045), in: .rect(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }

    private func status(_ game: WidgetScoreboard.Game) -> some View {
        if game.state == "pre", let start = game.startDate {
            Text(start, style: .time)
        } else if entry.stale && game.state == "in" {
            Text("As of ") + Text(entry.observedAt ?? entry.date, style: .time)
        } else if let status = game.status, !status.isEmpty {
            Text(verbatim: status)
        } else if let start = game.startDate {
            Text(start, style: .time)
        } else {
            Text("Time TBD")
        }
    }

    private func team(_ team: WidgetScoreboard.Game.Team) -> some View {
        HStack(spacing: 5) {
            if let url = team.logo, let image = entry.logos[url] {
                Image(decorative: image, scale: 1)
                    .resizable().scaledToFit()
                    .frame(width: 21, height: 21)
            }
            Text(verbatim: team.abbreviation).font(.subheadline.weight(.bold))
                .lineLimit(1).minimumScaleFactor(0.7)
                .accessibilityLabel(team.name)
            Spacer(minLength: 2)
            if let score = team.score {
                Text(verbatim: score).font(.subheadline.weight(.heavy).monospacedDigit()).lineLimit(1)
            }
        }
    }
}
