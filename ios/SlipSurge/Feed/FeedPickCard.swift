import SwiftUI

struct FeedPickCard: View {
    let pick: FeedPost.Pick
    let sport: String?
    @Environment(\.colorScheme) private var scheme

    private var league: String? { pick.single.sport ?? sport }
    private var bookPalette: (primary: Color, secondary: Color)? { Sportsbook.slipPalette(pick.book) }
    private var tint: Color { bookPalette?.primary ?? palette(pick.legs.first ?? pick.single).0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 8) {
                if let league {
                    ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "sportscourt")
                        .frame(width: 24, height: 24)
                        .accessibilityLabel(LeagueArtwork.label(league))
                }
                Text(pick.legs.isEmpty ? "Pick" : "\(pick.legs.count)-leg parlay")
                    .font(.caption.weight(.semibold))
                Spacer(minLength: 4)
                result(pick.single.result, compact: false)
            }
            if pick.legs.isEmpty {
                line(pick.single, includeResult: false)
            } else {
                ForEach(Array(pick.legs.enumerated()), id: \.offset) { index, leg in
                    if index > 0 { Divider().opacity(0.45) }
                    line(leg, includeResult: true)
                }
            }
            if pick.book != nil || pick.combinedOdds != nil {
                Divider().opacity(0.55)
                HStack(spacing: 7) {
                    if let book = pick.book {
                        let normalized = Sportsbook.normalized(book)
                        ProfileSportsbookLogo(key: book, size: 19)
                        Text(Sportsbook.name(normalized)).font(.caption.weight(.semibold))
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
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Brand.text(for: scheme))
        .background {
            let shape = RoundedRectangle(cornerRadius: 15)
            shape.fill(Brand.surface(for: scheme))
                .overlay {
                    shape.fill(LinearGradient(stops: [
                        .init(color: tint.opacity(scheme == .dark ? 0.35 : 0.22), location: 0),
                        .init(color: (bookPalette?.secondary ?? tint).opacity(scheme == .dark ? 0.22 : 0.12), location: 0.67),
                        .init(color: .clear, location: 1),
                    ], startPoint: .topLeading, endPoint: .bottomTrailing))
                }
                .overlay { shape.strokeBorder(tint.opacity(scheme == .dark ? 0.52 : 0.41)) }
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
