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
    let away: String
    let home: String
    let offers: [GameMarketBook]
    @State private var pickedBook: String?
    @Environment(\.colorScheme) private var scheme

    private var ordered: [GameMarketBook] {
        var seen = Set<String>()
        return offers.filter { seen.insert($0.vendor).inserted }
    }

    private var selected: GameMarketBook? {
        ordered.first { $0.vendor == pickedBook } ?? ordered.first { $0.vendor == "fanduel" } ?? ordered.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                ResearchSectionTitle(title: "Game markets")
                Spacer()
                if let selected {
                    Menu {
                        ForEach(ordered) { book in
                            Button(Sportsbook.name(book.vendor)) { pickedBook = book.vendor }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            if let image = Sportsbook.artwork(selected.vendor) {
                                Image(image).resizable().scaledToFit().frame(width: 17, height: 17)
                                    .accessibilityHidden(true)
                            }
                            Text(Sportsbook.name(selected.vendor))
                            Image(systemName: "chevron.down").font(.caption2)
                        }
                        .font(.subheadline.weight(.medium))
                        .frame(minHeight: 44)
                    }
                    .accessibilityLabel("Sportsbook, \(Sportsbook.name(selected.vendor))")
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
                        Text(away).font(.footnote.bold())
                        cell(nil, selected.moneylineAway)
                        cell(line(selected.spreadAway, signed: true), selected.spreadAwayOdds)
                        cell(selected.total.map { "O \($0.formatted())" }, selected.totalOverOdds)
                    }
                    GridRow {
                        Text(home).font(.footnote.bold())
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
