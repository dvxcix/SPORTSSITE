import SwiftUI

struct GamePlayCard: View {
    let entry: GameTimeline.Entry
    let game: Scoreboard.Match
    let highlightedPlay: String?
    let canReact: Bool
    let reactionStore: GameReactionStore
    let react: (String, Bool) async -> Void
    let discuss: () -> Void
    let showPitches: () -> Void
    let discussNote: (GameCenterData.Play) -> Void
    let reactToNote: (GameCenterData.Play) -> Void

    @Environment(\.colorScheme) private var scheme

    private var play: GameCenterData.Play { entry.play }
    private var playTeam: Scoreboard.Match.Team? { team(id: play.teamId) }
    private var portraitTeam: Scoreboard.Match.Team? {
        [game.away, game.home].first { $0.abbreviation == entry.person?.team } ?? playTeam
    }
    private var basket: Bool { game.sport == "nba" && play.scoring }
    private var highlighted: Bool { highlightedPlay == play.id || entry.notes.contains { $0.play.id == highlightedPlay } }
    private var primary: Color { Color(hex: portraitTeam?.color) ?? Brand.accent(for: scheme) }
    private var secondary: Color { Color(hex: portraitTeam?.secondary) ?? Brand.surface(for: scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            context
            HStack(alignment: .top, spacing: 12) {
                portrait
                VStack(alignment: .leading, spacing: 3) {
                    headline
                    identity
                    if let detail = entry.detail, entry.freeThrow == nil || entry.madeShot == nil {
                        Text(verbatim: detail).font(.footnote).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if !entry.notes.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(entry.notes) { note in noteRow(note) }
                        }
                        .padding(.top, 3)
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
                        primary.opacity(scheme == .dark ? 0.20 : 0.08),
                        secondary.opacity(scheme == .dark ? 0.09 : 0.03),
                        Color.clear
                    ], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
            }
        }
        .overlay(alignment: .bottom) {
            if !highlighted && !play.scoring { Divider().allowsHitTesting(false) }
        }
    }

    private var headline: some View {
        let outcome = game.sport == "nba" ? entry.madeShot : nil
        return HStack(alignment: .firstTextBaseline, spacing: 5) {
            if let outcome {
                Image(systemName: outcome ? "checkmark.circle.fill" : "xmark.circle")
                    .font(.caption.weight(.semibold)).accessibilityHidden(true)
            }
            Text(entry.headline)
                .font(.headline).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(outcome.map { Brand.signal($0 ? 1 : -1, for: scheme) } ?? Brand.text(for: scheme))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.freeThrow != nil && outcome != nil
            ? "\(entry.headline), \(outcome == true ? "made" : "missed")" : entry.headline)
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
            let name = Text(game.sport == "nba" ? person.shortName : person.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.text(for: scheme))
                .accessibilityLabel(person.name)
            if entry.stats.isEmpty {
                name
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 7) {
                        name.fixedSize(horizontal: true, vertical: false)
                        statLine.fixedSize(horizontal: true, vertical: false)
                    }
                    VStack(alignment: .leading, spacing: 3) { name; statLine }
                }
            }
            if let secondary = entry.secondary, entry.detail?.localizedCaseInsensitiveContains(secondary.name) != true {
                Label(game.sport == "nba" ? secondary.shortName : secondary.name, systemImage: "arrow.turn.down.right").font(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if let playTeam {
            Text(playTeam.name).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
    }

    private var statLine: some View {
        Text(entry.stats.map { "\($0.value) \($0.label)" }.joined(separator: "  ·  "))
            .font(.caption.weight(.semibold)).monospacedDigit()
            .foregroundStyle(Brand.text(for: scheme).opacity(0.84))
    }

    @ViewBuilder private func noteRow(_ note: BasketballPlayTimeline.Note) -> some View {
        let player = note.person?.shortName ?? team(id: note.play.teamId)?.abbreviation
        let stat = note.stat.map { "\($0.value) \($0.label)" }
        let detail = [player, stat].compactMap { $0 }.joined(separator: " · ")
        let label = Label {
            Text("\(Text(note.title).fontWeight(.semibold))\(detail.isEmpty ? "" : "  ·  \(detail)")")
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: note.glyph)
                .foregroundStyle(Brand.accent(for: scheme))
        }
        .font(.caption)
        .foregroundStyle(Brand.text(for: scheme).opacity(0.87))
        .padding(.vertical, 3)
        .accessibilityLabel([note.title, note.person?.name ?? player, stat].compactMap { $0 }.joined(separator: ", "))
        if note.play.id == play.id {
            label
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                label
                let reactions = reactionStore.reactions(for: note.play.id, fallback: note.play.reactions)
                let count = reactions.values.reduce(0) { $0 + $1.count }
                if count > 0, let emoji = reactions.max(by: {
                    $0.value.count == $1.value.count ? $0.key > $1.key : $0.value.count < $1.value.count
                })?.key {
                    HStack(spacing: 2) {
                        NativeReactionArtwork(symbol: emoji, size: 12)
                        Text(count, format: .number).font(.caption.monospacedDigit().weight(.medium))
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("\(count) reactions")
                }
            }
                .padding(.horizontal, 5)
                .background(highlightedPlay == note.play.id ? Brand.accent(for: scheme).opacity(0.17) : .clear,
                            in: .rect(cornerRadius: 6))
                .contextMenu {
                    if let url = GameLink(sport: game.sport, id: game.id, play: note.play.id).url {
                        ShareLink(item: url, subject: Text(note.title))
                    }
                    Button("Discuss in Game Room", systemImage: "bubble.left") { discussNote(note.play) }
                    if canReact { Button("React", systemImage: "face.smiling") { reactToNote(note.play) } }
                }
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
