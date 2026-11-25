import SwiftUI

struct FeedPickCard: View {
    let pick: FeedPost.Pick
    let sport: String?
    @Environment(\.colorScheme) private var scheme

    private var league: String? { pick.single.sport ?? sport }
    private var tint: Color { palette(pick.legs.first ?? pick.single).0 }

    var body: some View {
        ResearchToolCard(color: tint) {
            HStack(spacing: 8) {
                if let league {
                    ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt")
                        .frame(width: 24, height: 24)
                        .accessibilityLabel(LeagueArtwork.label(league))
                }
                if !pick.legs.isEmpty {
                    Text("\(pick.legs.count) legs").font(.caption.weight(.semibold))
                }
                Spacer(minLength: 4)
                result(pick.single.result, compact: false)
            }
        } content: {
            if pick.legs.isEmpty {
                line(pick.single, includeResult: false)
            } else {
                ForEach(Array(pick.legs.enumerated()), id: \.offset) { index, leg in
                    if index > 0 { Divider().opacity(0.45) }
                    line(leg, includeResult: true)
                }
            }
            if pick.book != nil || pick.combinedOdds != nil {
                HStack(spacing: 7) {
                    if let book = pick.book {
                        let normalized = Sportsbook.normalized(book)
                        if let mark = Sportsbook.artwork(normalized) {
                            Image(mark).resizable().scaledToFit().frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                        }
                        Text(Sportsbook.name(normalized)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let raw = pick.combinedOdds {
                        let price = Int(raw).map { ResearchFormat.price($0) } ?? raw
                        Text(price).font(.subheadline.weight(.bold)).monospacedDigit()
                            .accessibilityLabel("Combined odds \(price)")
                    }
                }
            }
        }
    }

    private func line(_ line: FeedPost.Pick.Line, includeResult: Bool) -> some View {
        let (primary, secondary) = palette(line)
        let portraits = (line.portraits ?? []).filter(FeedPostCard.allowedMedia)
        let logo = line.teamLogo.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        return HStack(spacing: 11) {
            if portraits.isEmpty, let logo {
                ResearchArtwork(urls: [logo], fallback: "shield")
                    .padding(5).frame(width: 44, height: 44)
                    .background(primary.opacity(scheme == .dark ? 0.55 : 0.24), in: .rect(cornerRadius: 10))
            } else {
                PlayerArtwork(portraits: portraits, logo: logo, primary: primary, secondary: secondary)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(line.label ?? "Pick").font(.subheadline.weight(.bold))
                if let line = line.line {
                    Text(verbatim: line).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 5)
            VStack(alignment: .trailing, spacing: 5) {
                if let raw = line.odds {
                    Text(Int(raw).map { ResearchFormat.price($0) } ?? raw)
                        .font(.subheadline.weight(.bold)).monospacedDigit()
                }
                if includeResult { result(line.result, compact: true) }
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func result(_ raw: String?, compact: Bool) -> some View {
        let state = raw?.lowercased() ?? "pending"
        let settled = state == "win" || state == "loss" || state == "push"
        if !compact || settled {
            let icon = state == "win" ? "checkmark" : state == "loss" ? "xmark" : state == "push" ? "minus" : "clock"
            let color = state == "win" ? Brand.signal(1, for: scheme) : state == "loss" ? Brand.signal(-1, for: scheme) : .secondary
            HStack(spacing: 4) {
                Image(systemName: icon)
                if !compact { Text(state.capitalized) }
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .accessibilityLabel(state.capitalized)
        }
    }

    private func palette(_ line: FeedPost.Pick.Line) -> (Color, Color) {
        let colors = (line.colors ?? []).compactMap { value -> Color? in
            guard let hex = UInt32(value.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) else { return nil }
            return Color(rgb: hex)
        }
        return (colors.first ?? Brand.accent(for: scheme), colors.dropFirst().first ?? Brand.surface(for: scheme))
    }
}
