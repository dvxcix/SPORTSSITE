import SwiftUI

struct CourtCrossMarketView: View {
    private enum Page: String, CaseIterable { case cross = "Cross-market", ladders = "Milestone movement" }

    private struct Snapshot: Decodable {
        struct Movement: Decodable {
            let lineChange: Double?
            let priceChange: Double?
            let priceFirstOdds: Int?
            let priceLatestOdds: Int?
        }

        struct Cross: Decodable, Identifiable {
            let playerId: Int
            let book: String
            let primary: String
            let other: String
            let primaryMovement: Movement
            let otherMovement: Movement
            let primaryPicks: Int?
            let otherPicks: Int?
            let kind: String
            var id: String { "\(playerId):\(book):\(primary):\(other):\(kind)" }
        }

        struct Ladder: Decodable, Identifiable {
            let key: String
            let gameId: Int
            let playerId: Int
            let book: String
            let market: String
            let line: Double
            let opening: Int?
            let current: Int
            let change: Double?
            let openingKnown: Bool
            var id: String { key }
        }

        let rows: [Cross]
        let milestones: [Ladder]
        let mode: CourtResearchMode
        let captures: Int
        let latestAt: String?
        let stale: Bool
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @State private var page = Page.cross
    @State private var payload: Snapshot?
    @State private var error: (any Error)?
    @State private var retry = 0
    @State private var book = ""
    @State private var search = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ResearchToolRail(title: "Cross-market research", choices: Page.allCases, selection: $page, label: \.rawValue) {
                $0 == .cross ? "arrow.left.arrow.right" : "chart.line.uptrend.xyaxis"
            }
            if let payload {
                let books = Set(payload.rows.map(\.book) + payload.milestones.map(\.book)).sorted()
                ResearchArtworkPicker(title: "Sportsbook",
                    options: [.init(id: "", title: "All books")] + books.map(ResearchArtworkPicker.Option.sportsbook), selection: $book)
                TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
                if payload.stale {
                    Label("Last saved observation", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
                }
                if let observed = payload.latestAt.flatMap(SidelineBoard.timestamp) {
                    Text(observed.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                }
                if page == .cross { cross(payload.rows) } else { ladders(payload.milestones) }
            } else {
                ResearchToolMessage(title: "Market movement couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: "\(revision):\(retry)") { await load() }
    }

    @ViewBuilder
    private func cross(_ entries: [Snapshot.Cross]) -> some View {
        let roster = Dictionary(board.players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = entries.filter { matches($0.book, player: roster[$0.playerId]) }
        if rows.isEmpty { ContentUnavailableView("No opposing moves for these filters", systemImage: "arrow.left.arrow.right") }
        LazyVStack(spacing: 9) {
            ForEach(rows) { row in
                if let player = roster[row.playerId] {
                    ResearchToolCard(color: CourtTeamColors.colors(for: player.team.abbreviation).primary) {
                        CourtPlayerIdentity(player: player)
                    } content: {
                        ResearchToolBook(book: row.book, price: row.primaryMovement.priceLatestOdds)
                        movement(label(row.primary), row.primaryMovement, picks: row.primaryPicks)
                        movement(label(row.other), row.otherMovement, picks: row.otherPicks)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func ladders(_ entries: [Snapshot.Ladder]) -> some View {
        let roster = Dictionary(board.players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = entries.filter { $0.gameId == board.game.id && matches($0.book, player: roster[$0.playerId]) }
        if rows.isEmpty { ContentUnavailableView("No saved milestone movement", systemImage: "chart.line.uptrend.xyaxis") }
        LazyVStack(spacing: 9) {
            ForEach(rows) { row in
                if let player = roster[row.playerId] {
                    ResearchToolCard(color: CourtTeamColors.colors(for: player.team.abbreviation).primary) {
                        CourtPlayerIdentity(player: player)
                    } content: {
                        Text("\(label(row.market)) · \(row.line.formatted())+").font(.subheadline.weight(.semibold))
                        ResearchToolBook(book: row.book, price: row.current)
                        ResearchToolValues(items: [
                            .init(label: row.openingKnown ? "Opening" : "First observed", text: ResearchFormat.price(row.opening)),
                            .init(label: "Price movement", text: ResearchFormat.points(row.change), tone: Brand.signal(row.change, for: scheme))
                        ])
                    }
                }
            }
        }
    }

    private func movement(_ title: String, _ observation: Snapshot.Movement, picks: Int?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption.weight(.semibold))
            ResearchToolValues(items: [
                .init(label: "Line", text: ResearchFormat.signedDecimal(observation.lineChange), tone: Brand.signal(observation.lineChange, for: scheme)),
                .init(label: "Price", text: ResearchFormat.points(observation.priceChange), tone: Brand.signal(observation.priceChange, for: scheme)),
                .init(label: "Public picks", text: picks?.formatted() ?? "—")
            ])
        }
    }

    private func matches(_ vendor: String, player: CourtBoard.Player?) -> Bool {
        guard (book.isEmpty || vendor == book), let player else { return false }
        return search.isEmpty || "\(player.firstName) \(player.lastName)".localizedCaseInsensitiveContains(search)
    }

    private func label(_ market: String) -> String {
        CourtPlayerMarket(rawValue: market)?.label ?? market.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func load() async {
        do {
            let value = try await CourtToolAPI(scope: scope).read(Snapshot.self, tool: "divergence", publicPath: "/the-paint/divergence", query: [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue)
            ])
            guard !Task.isCancelled else { return }
            guard value.mode == board.oddsMode else { throw URLError(.cannotParseResponse) }
            payload = value
        } catch {
            if !Task.isCancelled { payload = nil; self.error = error }
        }
    }
}
