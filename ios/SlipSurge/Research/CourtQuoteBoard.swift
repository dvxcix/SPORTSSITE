import SwiftUI

struct CourtQuoteBoard: View {
    enum Layout {
        case comparison, ladder

        var title: String { self == .ladder ? "Prop Ladders" : "Compare Sportsbooks" }
    }

    private struct Line: Identifiable {
        let line: Double
        let milestone: Bool
        let offers: [CourtPlayerMarket.Reference]

        var id: String { "\(line):\(milestone)" }
    }

    let scope: CourtView.Scope
    let board: CourtBoard
    let observedAt: Date
    let layout: Layout
    let market: CourtPlayerMarket
    let side: CourtPlayerMarket.Side
    let contract: CourtLinkContext.Contract?
    let target: Double?
    let search: String
    let initialBooks: [String]?
    let oneBook: String?
    let ranks: [Int: CourtAPI.Rank]
    @Environment(\.colorScheme) private var scheme
    @Environment(\.memberResearchPreferences) private var preferences
    @State private var selectedBooks: Set<String>?
    @State private var sort = ""
    @State private var ascending = true
    @State private var filterBooks = false

    private var availableBooks: [String] {
        Set(board.players.flatMap { market.offers($0, gameID: board.game.id, side: side).map(\.vendor) }).sorted()
    }

    private var visibleBooks: [String] {
        if let oneBook { return availableBooks.filter { Sportsbook.normalized($0) == Sportsbook.normalized(oneBook) } }
        if let selectedBooks { return availableBooks.filter { selectedBooks.contains($0) } }
        let wanted: [String]
        if let initialBooks {
            wanted = initialBooks
        } else if case .member(_, let id) = scope {
            wanted = preferences?.read(for: id)?.preferences.books ?? []
        } else { wanted = [] }
        let matching = availableBooks.filter { candidate in
            wanted.contains { $0 == candidate || Sportsbook.normalized($0) == Sportsbook.normalized(candidate) }
        }
        return wanted.isEmpty ? availableBooks : matching
    }

    var body: some View {
        let books = visibleBooks
        let list = board.players.filter { player in
            search.isEmpty || "\(player.firstName) \(player.lastName)".localizedStandardContains(search)
        }.sorted { ordered($0, $1) }
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ResearchSectionTitle(title: layout.title)
                Spacer()
                if oneBook == nil {
                    Button("Books", systemImage: "line.3.horizontal.decrease") { filterBooks = true }
                        .buttonStyle(.bordered)
                }
            }
            sortMenu(books)
            LazyVStack(spacing: 9) {
                ForEach(list) { player in
                    let lines = priceLines(player, books: books)
                    if !lines.isEmpty { card(player, lines: lines) }
                }
            }
            if books.isEmpty || !list.contains(where: { !priceLines($0, books: books).isEmpty }) {
                ContentUnavailableView("No recorded prices for this selection", systemImage: "chart.bar")
            }
        }
        .sheet(isPresented: $filterBooks) { bookOptions }
    }

    private func sortMenu(_ books: [String]) -> some View {
        Menu("Sort", systemImage: ascending ? "arrow.up" : "arrow.down") {
            Button("Player name", systemImage: "person") { selectSort("") }
            Button("MM", systemImage: "chart.bar.xaxis") { selectSort("mm") }
            ForEach(books, id: \.self) { book in
                Button { selectSort(book) } label: {
                    if let logo = Sportsbook.artwork(Sportsbook.normalized(book)) {
                        Label(Sportsbook.name(book), image: logo)
                    } else { Text(Sportsbook.name(book)) }
                }
            }
        }.frame(minHeight: 44)
    }

    private var bookOptions: some View {
        NavigationStack {
            List {
                Button("All available books") { selectedBooks = Set(availableBooks) }
                ForEach(availableBooks, id: \.self) { book in
                    Button {
                        var selected = selectedBooks ?? Set(visibleBooks)
                        if selected.contains(book) { selected.remove(book) } else { selected.insert(book) }
                        selectedBooks = selected
                    } label: {
                        HStack {
                            ResearchToolBook(book: book, price: nil, showPrice: false)
                            Spacer()
                            if visibleBooks.contains(book) { Image(systemName: "checkmark") }
                        }
                    }
                    .accessibilityAddTraits(visibleBooks.contains(book) ? .isSelected : [])
                }
            }
            .navigationTitle("Sportsbooks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { filterBooks = false } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func selectSort(_ choice: String) {
        ascending = sort == choice ? !ascending : choice.isEmpty
        sort = choice
    }

    private func ordered(_ a: CourtBoard.Player, _ b: CourtBoard.Player) -> Bool {
        if sort.isEmpty {
            let comparison = "\(a.lastName) \(a.firstName)".localizedStandardCompare("\(b.lastName) \(b.firstName)")
            if comparison != .orderedSame {
                return ascending ? comparison == .orderedAscending : comparison == .orderedDescending
            }
        } else {
            let left = sort == "mm" ? ranks[a.id]?.mm : selectedQuote(a, vendor: sort)?.odds
            let right = sort == "mm" ? ranks[b.id]?.mm : selectedQuote(b, vendor: sort)?.odds
            if let left, let right, left != right { return ascending ? left < right : left > right }
            if (left == nil) != (right == nil) { return left != nil }
        }
        return a.id < b.id
    }

    private func selectedQuote(_ player: CourtBoard.Player, vendor: String) -> CourtPlayerMarket.Reference? {
        market.reference(player, gameID: board.game.id, vendor: vendor, side: side, contract: contract, target: target)
    }

    private func priceLines(_ player: CourtBoard.Player, books: [String]) -> [Line] {
        let quotes = layout == .comparison ? books.compactMap { selectedQuote(player, vendor: $0) } :
            market.offers(player, gameID: board.game.id, side: side).filter { offer in
                books.contains(offer.vendor) && (contract == nil || offer.milestone == (contract == .milestone)) &&
                    (target == nil || offer.line == target)
            }
        let rows = Dictionary(grouping: quotes) {
            CourtLinkContext.Quote(line: $0.line, contract: $0.milestone ? .milestone : .standard)
        }
        return rows.map { key, values in
            let bestByBook = Dictionary(grouping: values, by: \.vendor)
            return Line(line: key.line, milestone: key.contract == .milestone,
                offers: books.compactMap { bestByBook[$0]?.max(by: { $0.odds < $1.odds }) })
        }.sorted { ($0.line, $0.milestone ? 0 : 1) < ($1.line, $1.milestone ? 0 : 1) }
    }

    private func card(_ player: CourtBoard.Player, lines: [Line]) -> some View {
        let palette = CourtTeamColors.colors(for: player.team.abbreviation)
        return ResearchToolCard(color: palette.primary) {
            HStack {
                CourtPlayerIdentity(player: player)
                Spacer()
                if let rank = ranks[player.id] {
                    Text("MM \(ResearchFormat.signed(rank.mm))").font(.caption.weight(.bold))
                        .foregroundStyle(Brand.signal(Double(rank.mm), for: scheme))
                }
            }
        } content: {
            ForEach(lines) { line in
                if let quote = line.offers.first {
                    Text(market.target(quote, side: side)).font(.caption.weight(.semibold)).monospacedDigit()
                }
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(line.offers, id: \.vendor) { offer in
                            NavigationLink {
                                CourtPlayerView(player: player, game: board.game, mode: board.oddsMode,
                                    frozen: board.isFrozen, tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason,
                                    initialBook: offer.vendor, initialMarket: market.rawValue, initialSide: side,
                                    researchScope: scope, linkedQuote: .init(line: line.line, contract: line.milestone ? .milestone : .standard),
                                    matchupBoard: board, linkedPanel: .ladder)
                            } label: {
                                ResearchToolBook(book: offer.vendor, price: offer.odds)
                                    .padding(.horizontal, 9).frame(minHeight: 44)
                                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 10))
                            }.buttonStyle(SlipSurgePressStyle())
                        }
                    }
                }.scrollIndicators(.hidden)
            }
        }
    }
}
