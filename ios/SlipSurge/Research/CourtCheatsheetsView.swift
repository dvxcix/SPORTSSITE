import SwiftUI

struct CourtCheatsheetsView: View {
    private enum Contract: String, CaseIterable {
        case all, overUnder = "over_under", milestone
        var label: String {
            switch self {
            case .all: "All lines"
            case .overUnder: "Over / Under"
            case .milestone: "Milestones"
            }
        }
    }

    private enum Location: String, CaseIterable { case all, home, away }
    private enum Sort: String, CaseIterable {
        case hit = "Hit rate", mismatch = "MM", gap = "Form gap"
    }

    private struct Filters: Equatable {
        let market: CourtPlayerMarket
        let book: String
        let side: CourtPlayerMarket.Side
        let location: Location
        let contract: Contract
        let line: Double?
        let reload: Int
        let retry: Int
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let reload: Int
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var market = CourtPlayerMarket.points
    @State private var side = CourtPlayerMarket.Side.over
    @State private var book = "all"
    @State private var location = Location.all
    @State private var contract = Contract.all
    @State private var line: Double?
    @State private var sort = Sort.hit
    @State private var selectedTeam: Int?
    @State private var search = ""
    @State private var result: (Filters, CourtCheatsheetsPayload)?
    @State private var error: (any Error)?
    @State private var retry = 0

    init(scope: CourtView.Scope, board: CourtBoard, reload: Int, initialBook: String? = nil) {
        self.scope = scope
        self.board = board
        self.reload = reload
        _book = State(initialValue: initialBook ?? "all")
    }

    private var filters: Filters {
        .init(market: market, book: book, side: side, location: location, contract: contract, line: line, reload: reload, retry: retry)
    }

    var body: some View {
        if case .preview = scope {
            ResearchToolMessage(title: "Cheatsheets unavailable", error: SlipSurgeHTTP.Status(code: 403, data: Data()))
        } else {
            VStack(alignment: .leading, spacing: 10) {
                controls
                if let (applied, data) = result, applied == filters {
                    rows(data)
                } else {
                    ResearchToolMessage(title: "Cheatsheets couldn’t load", error: error) { retry += 1 }
                }
            }
            .task(id: filters) { await load(filters) }
        }
    }

    private var controls: some View {
        let available = Set(result?.1.markets.map(\.key) ?? [])
        let books = result?.1.books ?? []
        let lines = result.flatMap { $0.0.market == market && $0.0.contract == contract ? $0.1.lines : nil } ?? []
        return VStack(alignment: .leading, spacing: 7) {
            ResearchToolRail(title: "Side", choices: CourtPlayerMarket.Side.allCases, selection: $side, label: \.rawValue) {
                $0 == .over ? "arrow.up" : "arrow.down"
            }
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchToolFilter(title: "Market", selection: market.label) {
                        Picker("Market", selection: $market) {
                            ForEach(CourtPlayerMarket.allCases.filter { available.isEmpty || available.contains($0.rawValue) || $0 == market }, id: \.self) {
                                Text($0.label).tag($0)
                            }
                        }
                    }
                    ResearchArtworkPicker(title: "Sportsbook",
                        options: [.init(id: "all", title: "All books", icon: "books.vertical")] + books.map(ResearchArtworkPicker.Option.sportsbook),
                        selection: $book)
                    ResearchToolFilter(title: "Contract", selection: contract.label) {
                        Picker("Contract", selection: $contract) {
                            ForEach(Contract.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Line", selection: line.map { ResearchFormat.decimal($0) } ?? "Any line") {
                        Picker("Line", selection: $line) {
                            Text("Any line").tag(nil as Double?)
                            ForEach(lines, id: \.self) { Text($0.formatted()).tag(Optional($0)) }
                        }
                    }
                    ResearchToolFilter(title: "Historical venue", selection: location == .all ? "All venues" : location.rawValue.capitalized) {
                        Picker("Historical venue", selection: $location) {
                            ForEach(Location.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                        }
                    }
                    ResearchArtworkPicker(title: "Team",
                        options: [.init(id: "", title: "Both teams", icon: "person.2")] + [board.game.visitorTeam, board.game.homeTeam].map {
                            .team(id: String($0.id), title: $0.abbreviation, logo: $0.logo)
                        }, selection: Binding(get: { selectedTeam.map(String.init) ?? "" }, set: { selectedTeam = Int($0) }))
                    ResearchToolFilter(title: "Sort", selection: sort.rawValue) {
                        Picker("Sort", selection: $sort) {
                            ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            TextField("Find a player", text: $search)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
        .onChange(of: market) { _, _ in line = nil }
        .onChange(of: contract) { _, _ in line = nil }
    }

    @ViewBuilder
    private func rows(_ data: CourtCheatsheetsPayload) -> some View {
        let roster = Dictionary(board.players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = data.rows.filter { row in
            guard let player = roster[row.playerId] else { return false }
            return (selectedTeam == nil || selectedTeam == player.team.id)
                && (search.isEmpty || "\(player.firstName) \(player.lastName)".localizedCaseInsensitiveContains(search))
        }.sorted { rank($0) > rank($1) }
        if !data.complete {
            Label("Some research inputs are unavailable.", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary)
        }
        if rows.isEmpty {
            ContentUnavailableView("No Cheatsheet rows for these filters", systemImage: "tablecells")
        } else {
            LazyVStack(spacing: 9) {
                ForEach(rows) { row in
                    if let player = roster[row.playerId] { playerCard(player, row) }
                }
            }
        }
    }

    private func rank(_ row: CourtCheatsheetsPayload.Row) -> Double {
        switch sort {
        case .hit: row.hit.rate ?? -.infinity
        case .mismatch: row.mm.map(Double.init) ?? -.infinity
        case .gap: row.gap ?? -.infinity
        }
    }

    private func playerCard(_ player: CourtBoard.Player, _ row: CourtCheatsheetsPayload.Row) -> some View {
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        let target = market.isBinary ? (side == .over ? "Yes" : "No")
            : row.milestone ? "\(row.line.formatted())+" : "\(side.rawValue) \(row.line.formatted())"
        let rateSuffix = market.isBinary ? "%" : ""
        return ResearchToolCard(color: colors.primary) {
            ResearchToolPortrait(name: "\(player.firstName) \(player.lastName)",
                subtitle: "\(player.team.abbreviation) · \(row.label) · \(target)",
                portraits: player.headshot.map { [$0] } ?? [], teamLogo: player.team.logo,
                primary: colors.primary, secondary: colors.secondary)
        } content: {
            ResearchToolBook(book: row.book, price: row.odds)
            ResearchToolValues(items: [
                .init(label: "L10 hit rate", text: "\(row.hit.label) · \(row.hit.sample)", tone: Brand.signal(row.hit.rate.map { $0 - 50 }, for: scheme)),
                .init(label: "MM", text: ResearchFormat.signed(row.mm), tone: Brand.signal(row.mm.map(Double.init), for: scheme)),
                .init(label: "Form gap", text: market.isBinary ? ResearchFormat.points(row.gap) : ResearchFormat.signedDecimal(row.gap),
                    tone: Brand.signal(row.gap, for: scheme)),
                .init(label: "Season", text: ResearchFormat.decimal(market.isBinary ? row.season.map { $0 * 100 } : row.season, suffix: rateSuffix)),
                .init(label: "L5", text: ResearchFormat.decimal(market.isBinary ? row.recent.map { $0 * 100 } : row.recent, suffix: rateSuffix)),
                .init(label: "L10", text: ResearchFormat.decimal(market.isBinary ? row.average.map { $0 * 100 } : row.average, suffix: rateSuffix))
            ])
        }
    }

    private func load(_ requested: Filters) async {
        error = nil
        do {
            var query: [URLQueryItem] = [
                .init(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue),
                .init(name: "market", value: requested.market.rawValue), .init(name: "book", value: requested.book),
                .init(name: "side", value: requested.side.rawValue.lowercased()), .init(name: "location", value: requested.location.rawValue),
                .init(name: "contract", value: requested.contract.rawValue)
            ]
            if let line = requested.line { query.append(.init(name: "target", value: String(line))) }
            let data = try await CourtToolAPI(scope: scope).read(CourtCheatsheetsPayload.self, tool: "cheatsheets", query: query)
            guard !Task.isCancelled, requested == filters else { return }
            guard data.gameId == board.game.id, data.date == board.game.date, data.mode == board.oddsMode else {
                throw URLError(.cannotParseResponse)
            }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { result = (requested, data) }
        } catch {
            if !Task.isCancelled, requested == filters { self.error = error }
        }
    }
}
