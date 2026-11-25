import SwiftUI

struct SidelineView: View {
    private enum LoadState {
        case loading
        case loaded(SidelineBoard)
        case failed
    }

    let api: SidelineAPI
    @Binding var appearance: Appearance
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection = OddsSelection()
    @State private var revision = 0
    @State private var state = LoadState.loading
    @State private var markets: [String] = []
    @State private var books: [String] = []

    var body: some View {
        List {
            switch state {
            case .loading:
                ProgressView("Loading featured matchup")
                    .listRowBackground(Brand.surface(for: scheme))
            case .failed:
                ContentUnavailableView {
                    Label("Research unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("The featured matchup could not load.")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
                .listRowBackground(Brand.surface(for: scheme))
            case let .loaded(board):
                boardSections(board)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .navigationTitle("The Sideline")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(Appearance.allCases, id: \.self) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                } label: {
                    Label("Appearance", systemImage: "circle.lefthalf.filled")
                }
            }
        }
        .task(id: revision) { await loadAndRevalidate() }
        .refreshable { revision += 1 }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, case .loaded = state { revision += 1 }
        }
    }

    @ViewBuilder
    private func boardSections(_ board: SidelineBoard) -> some View {
        Section("NFL featured matchup · \(board.date)") {
            if board.games.isEmpty {
                Text("No featured matchup available.")
            }
            ForEach(board.games) { game in
                HStack {
                    team(game.away, in: game, board: board)
                    Text("at").foregroundStyle(.secondary)
                    team(game.home, in: game, board: board)
                }
                if board.availabilityUnavailable.contains(game.id) || game.status == "unavailable" {
                    Text("Odds unavailable for this matchup.")
                } else if game.status == "incomplete" {
                    Text("This observation has incomplete coverage.")
                }
            }
        }
        .listRowBackground(Brand.surface(for: scheme))

        if !markets.isEmpty {
            Section("Pregame odds") {
                Picker("Market", selection: $selection.market) {
                    ForEach(markets, id: \.self) { Text(label($0)).tag($0) }
                }
                Picker("Sportsbook", selection: $selection.book) {
                    ForEach(books, id: \.self) { Text(label($0)).tag($0) }
                }
                .disabled(board.books.isEmpty)
            }
            .onChange(of: selection) { _, _ in revision += 1 }
            .listRowBackground(Brand.surface(for: scheme))
        }

        if board.quotes.isEmpty {
            Text("No verified prices for this selection.")
                .listRowBackground(Brand.surface(for: scheme))
        } else {
            Section {
                ForEach(board.quotes) { quote in
                    QuoteRow(
                        quote: quote,
                        artwork: board.identities.first { $0.player == quote.id.player }?.urls ?? []
                    )
                }
            } footer: {
                Text("Prices reflect the recorded pregame observations.")
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func team(_ abbreviation: String, in game: SidelineBoard.Game, board: SidelineBoard) -> some View {
        HStack(spacing: 6) {
            if let logo = board.teams.first(where: { $0.game == game.id && $0.abbreviation == abbreviation })?.logo {
                ResearchArtwork(urls: [logo], fallback: "shield")
                    .frame(width: 28, height: 28)
            }
            Text(abbreviation).bold()
        }
    }

    private func loadAndRevalidate() async {
        state = .loading
        let requested = selection
        do {
            let board = try await api.board(for: requested)
            try Task.checkCancellation()
            let deadline = try board.refreshDeadline()
            markets = Array(Set(board.markets + [requested.market])).sorted()
            books = Array(Set(board.books + [requested.book])).sorted()
            state = .loaded(board)
            if let deadline {
                try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow)))
                revision += 1
            }
        } catch {
            if !Task.isCancelled { state = .failed }
        }
    }

    private func label(_ key: String) -> String {
        switch key {
        case "fanduel": "FanDuel"
        case "draftkings": "DraftKings"
        case "betmgm": "BetMGM"
        case "betrivers": "BetRivers"
        case "anytime_td": "Anytime TD"
        case "first_td": "First TD"
        default: key.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

private struct QuoteRow: View {
    let quote: SidelineBoard.Quote
    let artwork: [URL]

    var body: some View {
        HStack(alignment: .top) {
            ResearchArtwork(urls: artwork, fallback: "person.crop.circle")
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(quote.id.player.name).font(.headline)
                Text("\(quote.id.player.team) · \(quote.position)")
                Text(quote.observedAt.formatted(date: .abbreviated, time: .shortened))
            }
            .font(.caption)
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 3) {
                Text(quote.id.line, format: .number).font(.headline)
                Text(quote.price > 0 ? "+\(quote.price)" : String(quote.price))
                    .monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Line \(quote.id.line.formatted()), odds \(quote.price)")
        }
    }
}

private struct ResearchArtwork: View {
    let urls: [URL]
    let fallback: String
    @State private var attempt = 0

    var body: some View {
        Group {
            if urls.indices.contains(attempt) {
                AsyncImage(url: urls[attempt]) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit()
                    case .failure:
                        Image(systemName: fallback)
                            .task { attempt += 1 }
                    default:
                        Image(systemName: fallback)
                    }
                }
            } else {
                Image(systemName: fallback)
            }
        }
        .onChange(of: urls) { _, _ in attempt = 0 }
        .accessibilityHidden(true)
    }
}
