import SwiftUI

struct CourtIntelligenceView: View {
    private struct DataSet: Decodable {
        struct Defense: Decodable, Identifiable {
            let teamId: Int
            let position: String
            let market: String
            let games: Int
            let per48: Double?
            let leaguePer48: Double?
            let allowance: Double?
            var id: String { "\(teamId):\(position):\(market)" }
        }

        struct Player: Decodable, Identifiable {
            struct Explanation: Decodable {
                struct Part: Decodable, Identifiable {
                    let key: String
                    let label: String
                    let value: Double?
                    let weight: Double

                    var id: String { key }
                }

                let parts: [Part]
                let unavailableReason: String?
                let marketAdjustment: Double?
            }

            let playerId: Int
            let scoreDetails: Explanation?
            let score: Double?
            let offer: CourtToolOffer?
            let mm: Int?
            let minutes: Double?
            let production: Double?
            var id: Int { playerId }
        }

        let mode: CourtResearchMode
        let market: String
        let book: String
        let side: String
        let profiles: [Defense]
        let scores: [Player]
        let unavailable: [String]
    }

    private struct Filter: Equatable {
        let market: CourtPlayerMarket
        let book: String
        let side: CourtPlayerMarket.Side
        let revision: Int
        let retry: Int
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let defense: Bool
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var market = CourtPlayerMarket.points
    @State private var book = "all"
    @State private var side = CourtPlayerMarket.Side.over
    @State private var position = ""
    @State private var search = ""
    @State private var payload: (Filter, DataSet)?
    @State private var error: (any Error)?
    @State private var retry = 0

    private var filter: Filter { .init(market: market, book: book, side: side, revision: revision, retry: retry) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            controls
            if let payload, payload.0 == filter {
                if !payload.1.unavailable.isEmpty {
                    Label(payload.1.unavailable.joined(separator: " · "), systemImage: "info.circle")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if defense { defenseCards(payload.1.profiles) } else { scoreCards(payload.1.scores) }
            } else {
                ResearchToolMessage(title: "Research couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: filter) { await load(filter) }
    }

    private var controls: some View {
        let positions = Set(payload?.1.profiles.map(\.position) ?? []).sorted()
        let books = Set(board.players.flatMap(\.props).map(\.vendor)).sorted()
        return VStack(alignment: .leading, spacing: 7) {
            if !defense {
                ResearchToolRail(title: "Side", choices: CourtPlayerMarket.Side.allCases, selection: $side, label: \.rawValue) {
                    $0 == .over ? "arrow.up" : "arrow.down"
                }
            }
            HStack {
                ResearchToolFilter(title: "Market", symbol: "ticket", selection: market.label) {
                    Picker("Market", selection: $market) {
                        ForEach(CourtPlayerMarket.allCases, id: \.self) { Label($0.label, systemImage: $0.symbol).tag($0) }
                    }
                }
                if defense {
                    ResearchToolFilter(title: "Position", symbol: "person.text.rectangle", selection: position.isEmpty ? "All positions" : position) {
                        Picker("Position", selection: $position) {
                            Text("All positions").tag("")
                            ForEach(positions, id: \.self) { Text($0).tag($0) }
                        }
                    }
                } else {
                    ResearchArtworkPicker(title: "Sportsbook",
                        options: [.init(id: "all", title: "All books")] + books.map(ResearchArtworkPicker.Option.sportsbook),
                        selection: $book)
                }
            }
            if !defense { TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled() }
        }
    }

    @ViewBuilder
    private func defenseCards(_ records: [DataSet.Defense]) -> some View {
        let teams = [board.game.visitorTeam, board.game.homeTeam]
        let ids = Set(teams.map(\.id))
        let data = records.filter { $0.market == market.rawValue && (position.isEmpty || $0.position == position) &&
            ids.contains($0.teamId) }
        if data.isEmpty { ContentUnavailableView("Defense sample unavailable", systemImage: "shield") }
        LazyVStack(spacing: 9) {
            ForEach(data) { record in
                if let team = teams.first(where: { $0.id == record.teamId }) {
                    let color = CourtTeamColors.colors(for: team.abbreviation).primary
                    ResearchToolCard(color: color) {
                        HStack(spacing: 8) {
                            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 25, height: 25)
                            Text("\(team.abbreviation) · \(record.position)").font(.headline)
                        }
                    } content: {
                        ResearchToolValues(items: [
                            .init(label: "Allowed / 48", text: ResearchFormat.decimal(record.per48)),
                            .init(label: "League / 48", text: ResearchFormat.decimal(record.leaguePer48)),
                            .init(label: "Vs. league", text: ResearchFormat.signedDecimal(record.allowance, suffix: "%"),
                                tone: Brand.signal(record.allowance, for: scheme)),
                            .init(label: "Games", text: String(record.games)),
                        ])
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func scoreCards(_ records: [DataSet.Player]) -> some View {
        let roster = Dictionary(board.players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = records.filter {
            guard let player = roster[$0.id] else { return false }
            return search.isEmpty || "\(player.firstName) \(player.lastName)".localizedCaseInsensitiveContains(search)
        }.sorted { ($0.score ?? -.infinity) > ($1.score ?? -.infinity) }
        if rows.isEmpty { ContentUnavailableView("No matching players", systemImage: "chart.bar.xaxis") }
        LazyVStack(spacing: 9) {
            ForEach(rows) { record in
                if let player = roster[record.id] {
                    let palette = CourtTeamColors.colors(for: player.team.abbreviation)
                    ResearchToolCard(color: palette.primary) {
                        CourtPlayerIdentity(player: player)
                    } content: {
                        if let offer = record.offer { ResearchToolBook(book: offer.vendor, price: offer.price(side)) }
                        ResearchToolValues(items: [
                            .init(label: "SlipSurge Score", text: ResearchFormat.decimal(record.score), tone: Brand.accent(for: scheme)),
                            .init(label: "MM", text: ResearchFormat.signed(record.mm), tone: Brand.signal(record.mm.map(Double.init), for: scheme)),
                            .init(label: "Minutes", text: ResearchFormat.decimal(record.minutes)),
                            .init(label: "Production", text: ResearchFormat.decimal(record.production))
                        ])
                        if let explanation = record.scoreDetails {
                            DisclosureGroup("Score breakdown") {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(explanation.parts) { part in
                                        LabeledContent(part.label, value: ResearchFormat.decimal(part.value))
                                    }
                                    if let why = explanation.unavailableReason {
                                        Text(why).foregroundStyle(.secondary)
                                    }
                                }.font(.caption)
                            }
                        }
                    }
                }
            }
        }
    }

    private func load(_ requested: Filter) async {
        error = nil
        do {
            let data = try await CourtToolAPI(scope: scope).read(DataSet.self, tool: "intelligence", publicPath: "/the-paint/intelligence", query: [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue),
                .init(name: "market", value: requested.market.rawValue), .init(name: "side", value: requested.side.rawValue.lowercased()),
                .init(name: "book", value: requested.book)
            ])
            guard !Task.isCancelled, requested == filter else { return }
            guard data.mode == board.oddsMode, data.market == requested.market.rawValue, data.book == requested.book,
                  data.side == requested.side.rawValue.lowercased() else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.21)) { payload = (requested, data) }
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
