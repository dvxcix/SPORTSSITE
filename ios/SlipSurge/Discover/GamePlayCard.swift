import SwiftUI

struct GamePlayCard: View {
    let entry: GameTimeline.Entry
    let game: Scoreboard.Match
    let highlighted: Bool
    let canReact: Bool
    let reactionStore: GameReactionStore
    let react: (String, Bool) async -> Void
    let discuss: () -> Void
    let showPitches: () -> Void

    @Environment(\.colorScheme) private var scheme

    private var play: GameCenterData.Play { entry.play }
    private var playTeam: Scoreboard.Match.Team? { team(id: play.teamId) }
    private var portraitTeam: Scoreboard.Match.Team? {
        [game.away, game.home].first { $0.abbreviation == entry.person?.team } ?? playTeam
    }
    private var basket: Bool { game.sport == "nba" && play.scoring }
    private var primary: Color { Color(hex: portraitTeam?.color) ?? Brand.accent(for: scheme) }
    private var secondary: Color { Color(hex: portraitTeam?.secondary) ?? Brand.surface(for: scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            context
            HStack(alignment: .top, spacing: 12) {
                portrait
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.headline).font(.headline).fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(Brand.text(for: scheme))
                    identity
                    if let detail = entry.detail, entry.freeThrow == nil || entry.madeShot == nil {
                        Text(verbatim: detail).font(.footnote).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 2) {
                GamePlayReactions(reactions: reactionStore.reactions(for: play.id, fallback: play.reactions),
                                  enabled: canReact, react: react)
                Spacer(minLength: 3)
                if play.pitches?.isEmpty == false {
                    Button("Pitch details", systemImage: "scope", action: showPitches)
                        .labelStyle(.iconOnly).frame(width: 44, height: 44)
                }
                Button("Discuss this play in Game Room", systemImage: "bubble.left", action: discuss)
                    .labelStyle(.iconOnly).frame(width: 44, height: 44)
                if let url = GameLink(sport: game.sport, id: game.id, play: play.id).url {
                    ShareLink(item: url, subject: Text(entry.headline)) {
                        Image(systemName: "arrowshape.turn.up.right").frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Share this play")
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 11)
        .padding(.top, 10)
        .padding(.bottom, 1)
        .background {
            if highlighted || play.scoring {
                RoundedRectangle(cornerRadius: 16)
                    .fill(LinearGradient(colors: [
                        primary.opacity(scheme == .dark ? 0.29 : 0.11),
                        secondary.opacity(scheme == .dark ? 0.17 : 0.05),
                        Brand.surface(for: scheme)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
        .overlay(alignment: .bottom) {
            if !highlighted && !play.scoring { Divider().allowsHitTesting(false) }
        }
    }

    private var context: some View {
        HStack(spacing: 6) {
            if let away = play.away, let home = play.home {
                teamBadge(game.away, size: 14)
                Text("\(away)–\(home)").fontWeight(.bold)
                    .accessibilityLabel("\(game.away.abbreviation) \(away), \(game.home.abbreviation) \(home)")
                teamBadge(game.home, size: 14)
            }
            Text([play.period, play.clock].compactMap { $0 }.joined(separator: " · "))
                .lineLimit(1)
            Spacer(minLength: 0)
            if let attempt = entry.freeThrow {
                Label("\(attempt.attempt)/\(attempt.total)", systemImage: "basketball")
                    .fontWeight(.semibold).accessibilityLabel("Free throw \(attempt.attempt) of \(attempt.total)")
            } else if basket {
                Image(systemName: "basketball.fill")
                    .foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Scoring play")
            }
        }
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var portrait: some View {
        if let person = entry.person {
            PlayerArtwork(portraits: person.portrait.map { [$0] } ?? [],
                          logo: portraitTeam.flatMap(game.logo(for:)), primary: primary, secondary: secondary)
        } else if let playTeam {
            teamBadge(playTeam, size: 29)
                .frame(width: 48, height: 48)
                .background(LinearGradient(colors: [primary.opacity(0.32), secondary.opacity(0.20)],
                                          startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 10))
        } else {
            Image(systemName: "sportscourt").foregroundStyle(.secondary)
                .frame(width: 48, height: 48).background(.quaternary, in: .rect(cornerRadius: 10))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var identity: some View {
        if let person = entry.person {
            HStack(spacing: 6) {
                Text(person.name).font(.subheadline.weight(.semibold))
                if let made = entry.madeShot, entry.freeThrow != nil {
                    Image(systemName: made ? "checkmark.circle.fill" : "xmark.circle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Brand.signal(made ? 1 : -1, for: scheme))
                        .accessibilityLabel(made ? "Made" : "Missed")
                }
            }
            if let secondary = entry.secondary, entry.detail?.localizedCaseInsensitiveContains(secondary.name) != true {
                Label(secondary.name, systemImage: "arrow.turn.down.right").font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if let playTeam {
            Text(playTeam.name).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
    }

    private func team(id: String?) -> Scoreboard.Match.Team? {
        [game.away, game.home].first { $0.id == id }
    }

    private func teamBadge(_ team: Scoreboard.Match.Team, size: CGFloat) -> some View {
        ResearchArtwork(urls: game.logo(for: team).map { [$0] } ?? [], fallback: "shield", pointSize: size)
            .frame(width: size, height: size)
    }
}
