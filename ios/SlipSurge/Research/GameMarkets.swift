import SwiftUI

struct GameMarketBook: Decodable, Identifiable {
    let vendor: String
    let moneylineAway: Int?
    let moneylineHome: Int?
    let spreadAway: Double?
    let spreadHome: Double?
    let spreadAwayOdds: Int?
    let spreadHomeOdds: Int?
    let total: Double?
    let totalOverOdds: Int?
    let totalUnderOdds: Int?
    let updatedAt: String?
    let isOpeningOnly: Bool?

    var id: String { vendor }
}

struct GameMarkets: View {
    let away: ResearchMatchup.Team
    let home: ResearchMatchup.Team
    let offers: [GameMarketBook]
    @State private var pickedBook: String?
    @Environment(\.colorScheme) private var scheme

    private var ordered: [GameMarketBook] {
        var seen = Set<String>()
        return offers.filter { seen.insert($0.vendor).inserted }
    }

    private var selected: GameMarketBook? {
        ordered.first { $0.vendor == pickedBook } ?? ordered.first { Sportsbook.normalized($0.vendor) == "fanduel" } ?? ordered.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                ResearchSectionTitle(title: "Game markets")
                Spacer()
                if selected != nil {
                    SportsbookPicker(books: ordered.map(\.vendor), selection: Binding(
                        get: { selected?.vendor ?? "" }, set: { pickedBook = $0 }))
                }
            }

            if let selected {
                Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 11) {
                    GridRow {
                        Text("Side")
                        Text("Moneyline")
                        Text("Spread")
                        Text("Total")
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    Divider()
                    GridRow {
                        team(away)
                        cell(nil, selected.moneylineAway)
                        cell(line(selected.spreadAway, signed: true), selected.spreadAwayOdds)
                        cell(selected.total.map { "O \($0.formatted())" }, selected.totalOverOdds)
                    }
                    GridRow {
                        team(home)
                        cell(nil, selected.moneylineHome)
                        cell(line(selected.spreadHome, signed: true), selected.spreadHomeOdds)
                        cell(selected.total.map { "U \($0.formatted())" }, selected.totalUnderOdds)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if selected.isOpeningOnly == true {
                    Text("Opening lines").font(.caption).foregroundStyle(.secondary)
                }
                if let timestamp = selected.updatedAt.flatMap(SidelineBoard.timestamp) {
                    Text("Recorded \(timestamp.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Text("No recorded game lines.").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 14))
    }

    private func team(_ team: ResearchMatchup.Team) -> some View {
        VStack(alignment: .center, spacing: 3) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 20, height: 20)
            Text(verbatim: team.name).font(.caption2.weight(.bold))
        }
        .padding(5)
        .frame(minWidth: 39)
        .background(team.color.opacity(scheme == .dark ? 0.38 : 0.13), in: .rect(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }

    private func cell(_ line: String?, _ odds: Int?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            if let line { Text(line).font(.subheadline.weight(.semibold)) }
            Text(odds.map { $0 > 0 ? "+\($0)" : String($0) } ?? "—")
                .font(line == nil ? .subheadline.weight(.semibold) : .caption)
                .foregroundStyle(line == nil ? .primary : .secondary)
        }
        .monospacedDigit()
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func line(_ value: Double?, signed: Bool) -> String? {
        value.map { (signed && $0 > 0 ? "+" : "") + $0.formatted() }
    }
}
