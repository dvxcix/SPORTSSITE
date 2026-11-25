import SwiftUI

struct SidelineView: View {
    private enum LoadState {
        case loading
        case loaded(SidelineBoard)
        case failed
        case denied
    }

    let api: SidelineAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var slateDate = Date.now
    @State private var selection = OddsSelection()
    @State private var revision = 0
    @State private var state = LoadState.loading
    @State private var markets: [String] = []
    @State private var books: [String] = []

    var body: some View {
        List {
            if !api.isFeatured {
                DatePicker("Slate date", selection: $slateDate, in: ...Date.now, displayedComponents: .date)
                    .environment(\.timeZone, SlateDate.zone)
                    .listRowBackground(Brand.surface(for: scheme))
            }
            switch state {
            case .loading:
                ProgressView("Loading NFL research")
                    .listRowBackground(Brand.surface(for: scheme))
            case .failed:
                ContentUnavailableView {
                    Label("Research unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("NFL research could not load.")
                } actions: {
                    Button("Retry") { revision += 1 }
                }
                .listRowBackground(Brand.surface(for: scheme))
            case .denied:
                ContentUnavailableView {
                    Label("Sideline access required", systemImage: "lock")
                } description: {
                    Text("The full slate requires Ultimate membership or NFL early access.")
                } actions: {
                    NavigationLink("View featured matchup") { SidelineView(api: SidelineAPI()) }
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
        .task(id: revision) { await loadAndRevalidate() }
        .onChange(of: slateDate) { _, _ in revision += 1 }
        .refreshable { revision += 1 }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, case .loaded = state { revision += 1 }
        }
    }

    @ViewBuilder
    private func boardSections(_ board: SidelineBoard) -> some View {
        Section("\(api.isFeatured ? "NFL featured matchup" : "NFL slate") · \(board.date)") {
            if board.games.isEmpty {
                Text("No NFL matchups available.")
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
                SportsbookPicker(books: books, selection: $selection.book)
                    .disabled(board.books.isEmpty)
            }
            .onChange(of: selection) { _, _ in revision += 1 }
            .listRowBackground(Brand.surface(for: scheme))
        }

        if board.quotes.isEmpty {
            Text("No verified prices for this selection.")
                .listRowBackground(Brand.surface(for: scheme))
        } else {
            let byGame = Dictionary(grouping: board.quotes, by: { $0.id.player.game })
            let portraits = Dictionary(grouping: board.identities, by: \.player)
            let teamLooks = Dictionary(grouping: board.teams, by: \.game)
            ForEach(board.games) { game in
                if let quotes = byGame[game.id] {
                    Section {
                        ForEach(quotes) { quote in
                            QuoteRow(
                                quote: quote,
                                artwork: portraits[quote.id.player]?.first?.urls ?? [],
                                team: teamLooks[game.id]?.first { $0.abbreviation == quote.id.player.team }
                            )
                        }
                    } header: {
                        Text("\(game.away) at \(game.home) · \(Sportsbook.name(board.book))")
                    } footer: {
                        Text("Prices reflect the recorded pregame observations.")
                    }
                    .listRowBackground(Brand.surface(for: scheme))
                }
            }
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
            let board = try await api.board(for: requested, date: SlateDate.key(slateDate))
            try Task.checkCancellation()
            let deadline = try board.refreshDeadline()
            markets = Array(Set(board.markets + [requested.market])).sorted()
            books = Array(Set(board.books + [requested.book])).sorted()
            state = .loaded(board)
            if let deadline {
                try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow)))
                revision += 1
            }
        } catch let error as SlipSurgeHTTP.Status where error.code == 403 && !api.isFeatured {
            if !Task.isCancelled { state = .denied }
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
    let team: SidelineBoard.Team?

    var body: some View {
        HStack(alignment: .top) {
            PlayerArtwork(
                portraits: artwork, logo: team?.logo,
                primary: Color(hex: team?.primary) ?? Color(rgb: 0x263542),
                secondary: Color(hex: team?.secondary) ?? Color(rgb: 0x141C25)
            )
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
