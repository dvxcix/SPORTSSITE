import SwiftUI

struct GameLiveCue: View {
    let cue: GameTimeline.Cue
    let game: Scoreboard.Match
    @Environment(\.colorScheme) private var scheme

    private var team: Scoreboard.Match.Team? {
        [game.away, game.home].first { $0.id == cue.teamID }
    }

    var body: some View {
        let primary = Color(hex: team?.color) ?? Brand.accent(for: scheme)
        let secondary = Color(hex: team?.secondary) ?? primary
        HStack(spacing: 9) {
            if let person = cue.person, let portrait = person.portrait {
                ResearchArtwork(urls: [portrait], fallback: "person.fill", pointSize: 33)
                    .frame(width: 33, height: 33)
                    .background(.linearGradient(colors: [primary, secondary], startPoint: .topLeading, endPoint: .bottomTrailing),
                                in: .rect(cornerRadius: 8))
            } else if let team {
                ResearchArtwork(urls: game.logo(for: team).map { [$0] } ?? [], fallback: cue.glyph, pointSize: 28)
                    .frame(width: 33, height: 33)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.heavy))
                if let detail = cue.detail { Text(detail).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 3)
            Image(systemName: cue.glyph).foregroundStyle(Brand.accent(for: scheme)).accessibilityHidden(true)
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
        .background {
            LinearGradient(colors: [primary.opacity(scheme == .dark ? 0.28 : 0.10),
                                    secondary.opacity(scheme == .dark ? 0.20 : 0.06)],
                           startPoint: .leading, endPoint: .trailing)
                .background(Brand.surface(for: scheme))
        }
        .overlay(alignment: .top) { Divider().allowsHitTesting(false) }
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        if let name = cue.person?.name, cue.glyph == "basketball" { return "\(cue.headline) · \(name)" }
        if let team, cue.glyph == "pause.fill" { return "\(team.name) timeout" }
        return cue.headline
    }
}
