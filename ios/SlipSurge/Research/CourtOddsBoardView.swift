import SwiftUI

struct CourtOddsBoardView: View {
    private struct Market: Identifiable {
        let id: String
        let name: String
    }

    private enum State {
        case loading
        case loaded(ResearchOddsSlate)
        case failed
        case denied
    }

    private struct Request: Equatable {
        let date: String
        let market: String
        let book: String
        let mode: CourtResearchMode
        let revision: Int
    }

    let scope: CourtView.Scope
    let date: String
    let gameID: Int?
    let mode: CourtResearchMode
    let reload: Int
    let explicitBook: String?
    private let api = CourtOddsAPI()
    @State private var market = "points"
    @State private var book = "fanduel"
    @State private var books: [String] = []
    @State private var state = State.loading
    @State private var attempt = 0

    init(scope: CourtView.Scope, date: String, gameID: Int?, mode: CourtResearchMode, reload: Int,
        initialBook: String? = nil, initialMarket: String? = nil) {
        self.scope = scope
        self.date = date
        self.gameID = gameID
        self.mode = mode
        self.reload = reload
        explicitBook = initialBook == "all" ? nil : initialBook
        if let initialBook, initialBook != "all" { _book = SwiftUI.State(initialValue: initialBook) }
        if let initialMarket { _market = SwiftUI.State(initialValue: initialMarket) }
    }

    private var request: Request {
        .init(date: date, market: market, book: book, mode: mode, revision: reload + attempt)
    }

    private var markets: [Market] {
        CourtPlayerMarket.allCases.filter { !$0.isBinary }.map { Market(id: $0.rawValue, name: $0.label) } + [
            Market(id: "points_first3min", name: "First 3 minutes · Points"),
            Market(id: "rebounds_first3min", name: "First 3 minutes · Rebounds"),
            Market(id: "assists_first3min", name: "First 3 minutes · Assists")
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack { marketPicker; Spacer(minLength: 12); sportsbookPicker }
                VStack(alignment: .leading) { marketPicker; sportsbookPicker }
            }
            switch state {
            case .loading:
                ProgressView("Loading Odds Board").frame(maxWidth: .infinity).padding()
            case .loaded(let slate):
                ResearchOddsBoard(slate: slate, selectedGame: gameID.map(String.init), scorerLabel: nil, live: mode == .live)
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
        .task(id: request) { await load(request) }
    }

    private var marketPicker: some View {
        Picker("Odds Board market", selection: $market) {
            ForEach(markets) { Text($0.name).tag($0.id) }
        }
        .frame(minHeight: 44)
    }

    private var sportsbookPicker: some View {
        SportsbookPicker(books: Array(Set(books + [book])).sorted(), selection: $book)
            .frame(minHeight: 44)
    }

    private func load(_ wanted: Request) async {
        state = .loading
        do {
            while !Task.isCancelled {
                let loaded = try await api.fetch(date: wanted.date, market: wanted.market, book: wanted.book, mode: wanted.mode, scope: scope)
                try Task.checkCancellation()
                guard wanted == request else { return }
                books = loaded.books
                if !books.isEmpty, !books.contains(book), explicitBook == nil {
                    book = books[0]
                    return
                }
                state = .loaded(loaded)
                guard let expiry = loaded.expiry else { return }
                try await Task.sleep(for: .seconds(max(1, expiry.timeIntervalSinceNow)))
                state = .loading
            }
        } catch let error as SlipSurgeHTTP.Status where [401, 403].contains(error.code) {
            if !Task.isCancelled, wanted == request { state = .denied }
        } catch {
            if !Task.isCancelled, wanted == request { state = .failed }
        }
    }
}
