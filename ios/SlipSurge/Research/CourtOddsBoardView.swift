import SwiftUI

struct CourtOddsBoardView: View {
    private struct Market: Identifiable {
        let id: String
        let name: String
    }

    private enum State {
        case loading
        case loaded(Selection, ResearchOddsSlate)
        case failed
        case denied
    }

    private struct Selection: Equatable {
        let date: String
        let market: String
        let book: String
        let mode: CourtResearchMode
    }

    private struct Request: Equatable {
        let selection: Selection
        let revision: Int
        let attempt: Int
    }

    let scope: CourtView.Scope
    let date: String
    let gameID: Int?
    let mode: CourtResearchMode
    let reload: Int
    let showsContent: Bool
    let explicitBook: String?
    private let api = CourtOddsAPI()
    @Environment(\.slipPalette) private var slipPalette
    @Binding var market: String
    @Binding var book: String
    @State private var books: [String] = []
    @State private var initializedBooks = false
    @State private var state = State.loading
    @State private var attempt = 0
    let filters: ResearchOddsFilters
    @State private var detail: ResearchOddsDetail?

    private var request: Request {
        .init(selection: .init(date: date, market: market, book: book, mode: mode), revision: reload, attempt: attempt)
    }

    private var markets: [Market] {
        CourtPlayerMarket.allCases.filter { !$0.isBinary }.map { Market(id: $0.rawValue, name: $0.label) } + [
            Market(id: "points_first3min", name: "First 3 minutes · Points"),
            Market(id: "rebounds_first3min", name: "First 3 minutes · Rebounds"),
            Market(id: "assists_first3min", name: "First 3 minutes · Assists")
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsContent { content }
        }
        .task(id: request) { await load(request) }
        .onChange(of: request.selection) { _, _ in detail = nil }
        .sheet(item: $detail) { ResearchBookComparison(detail: $0) }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { marketPicker; Spacer(minLength: 0); sportsbookPicker }
                VStack(alignment: .leading, spacing: 0) { marketPicker; sportsbookPicker }
            }
            .padding(.horizontal, 12)
            .background(slipPalette.surface, in: .rect(cornerRadius: 12))
            switch state {
            case .loading:
                loading
            case .loaded(let selection, let slate):
                if selection == request.selection {
                    ResearchOddsBoard(slate: slate, selectedGame: gameID.map(String.init),
                        marketLabel: markets.first { $0.id == market }?.name ?? market, scorerLabel: nil,
                        sportsbook: selection.book, readBook: comparisonReader(for: selection), openQuote: { detail = $0 }, filter: filters,
                        live: mode == .live)
                } else {
                    loading
                }
            case .denied:
                ContentUnavailableView("Ultimate research", systemImage: "lock", description: Text("Ultimate includes the full Odds Board."))
            case .failed:
                ContentUnavailableView {
                    Label("Odds Board couldn’t load", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("Retry") { attempt += 1 }
                }
            }
        }
    }

    private var loading: some View {
        ProgressView("Loading Odds Board").frame(maxWidth: .infinity).padding()
    }

    private var marketPicker: some View {
        Picker("Odds Board market", selection: $market) {
            ForEach(markets) { market in
                Label(market.name, systemImage: CourtPlayerMarket(rawValue: market.id)?.symbol ?? "ticket")
                    .tag(market.id)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
        .frame(minHeight: 44)
    }

    private var sportsbookPicker: some View {
        SportsbookPicker(books: Array(Set(books + [book])).sorted(), selection: $book)
            .fixedSize(horizontal: true, vertical: false)
            .frame(minHeight: 44)
    }

    private func comparisonReader(for selection: Selection) -> ResearchBookRead {
        { [scope] book, target in
            let slate = try await CourtOddsAPI().fetch(date: selection.date, market: selection.market, book: book,
                mode: selection.mode, scope: scope)
            return target.price(in: slate).map { .init(price: $0, expiry: slate.expiry) }
        }
    }

    private func load(_ wanted: Request) async {
        if case .loaded(let selection, let slate) = state, selection == wanted.selection,
           slate.expiry.map({ $0 > .now }) != false {
            // Preserve the exact selection during a refresh while its evidence is current.
        } else {
            state = .loading
        }
        let selection = wanted.selection
        do {
            while !Task.isCancelled {
                let loaded = try await api.fetch(date: selection.date, market: selection.market, book: selection.book,
                    mode: selection.mode, scope: scope)
                try Task.checkCancellation()
                guard wanted == request else { return }
                books = loaded.books
                if !initializedBooks, !books.isEmpty {
                    initializedBooks = true
                    if !books.contains(book), explicitBook == nil {
                        book = books[0]
                        return
                    }
                }
                state = .loaded(selection, loaded)
                guard let expiry = loaded.expiry else { return }
                try await Task.sleep(for: .seconds(max(1, expiry.timeIntervalSinceNow)))
                state = .loading
            }
        } catch let error as SlipSurgeHTTP.Status where [401, 403].contains(error.code) {
            if !Task.isCancelled, wanted == request {
                detail = nil
                state = .denied
            }
        } catch {
            if !Task.isCancelled, wanted == request { state = .failed }
        }
    }
}
