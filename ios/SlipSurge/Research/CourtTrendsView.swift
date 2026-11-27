import SwiftUI

enum CourtTrendsBoard: String, CaseIterable {
    case props = "Props", volume = "Volume"

    var symbol: String { self == .props ? "ticket" : "chart.bar" }
}

struct CourtTrendsView: View {
    let board: CourtBoard
    let observedAt: Date
    let scope: CourtView.Scope
    @Binding var selection: CourtTrendsBoard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ResearchToolRail(title: "Trends board", choices: CourtTrendsBoard.allCases,
                selection: $selection, label: \.rawValue, glyph: \.symbol, compact: true)
            switch selection {
            case .props: CourtPropTrendsView(board: board, observedAt: observedAt, scope: scope)
            case .volume: CourtVolumeTrends(board: board, observedAt: observedAt, scope: scope)
            }
        }
    }
}

private struct CourtPropTrendsView: View {
    private enum Sample: String, CaseIterable, Codable {
        case last3 = "Last 3", last5 = "Last 5", last10 = "Last 10"
        case season = "Recorded season", home = "Home", away = "Away", opponent = "This opponent"

        var window: Int? {
            switch self {
            case .last3: 3
            case .last5: 5
            case .last10: 10
            default: nil
            }
        }

        var venue: CourtPlayerMarket.Venue {
            switch self {
            case .home: .home
            case .away: .away
            default: .all
            }
        }

        func logs(_ history: [CourtBoard.PlayerLog], opponent: Int?) -> ArraySlice<CourtBoard.PlayerLog> {
            if let window { return history.prefix(window) }
            if self == .opponent {
                guard let opponent else { return [] }
                return history.filter { $0.opponentID == opponent }[...]
            }
            return history.filter(venue.accepts)[...]
        }
    }

    private enum Price: String, CaseIterable, Codable {
        case any = "Any price", balanced = "−120 or better", plus = "Plus money"

        func accepts(_ price: Int) -> Bool {
            switch self {
            case .any: true
            case .balanced: price >= -120
            case .plus: price > 0
            }
        }
    }

    private struct Filters: Codable, Equatable {
        var market = CourtPlayerMarket.points
        var side = CourtPlayerMarket.Side.over
        var book = "all"
        var sample = Sample.last10
        var price = Price.any
        var minimum = 3
        var search = ""
    }

    private struct Line: Hashable {
        let value: Double
        let milestone: Bool
    }

    private struct Row: Identifiable {
        let player: CourtBoard.Player
        let quote: CourtPlayerMarket.Reference
        let situation: CourtPlayerMarket.HitRate
        let season: CourtPlayerMarket.HitRate
        let rate: Double
        var id: String { "\(player.id):\(quote.line):\(quote.milestone)" }
    }

    let board: CourtBoard
    let observedAt: Date
    let scope: CourtView.Scope
    @State private var filters = Filters()
    @Environment(\.slipPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize

    private var bookOptions: [ResearchArtworkPicker.Option] {
        let vendors = Set(board.players.flatMap { filters.market.offers($0, gameID: board.game.id, side: filters.side).map(\.vendor) })
        return [.init(id: "all", title: "Best price", icon: "books.vertical")] +
            vendors.union(filters.book == "all" ? [] : [filters.book]).sorted().map(ResearchArtworkPicker.Option.sportsbook)
    }

    private var marketOptions: [CourtPlayerMarket] {
        let markets = Set(board.players.flatMap(\.props).filter { $0.gameId == board.game.id }.map(\.propType))
        return CourtPlayerMarket.allCases.filter { markets.contains($0.rawValue) || $0 == filters.market }
    }

    private var rows: [Row] {
        board.players.flatMap { player -> [Row] in
            let name = "\(player.firstName) \(player.lastName)"
            guard filters.search.isEmpty || name.localizedCaseInsensitiveContains(filters.search) else { return [] }
            let teams = [board.game.visitorTeam, board.game.homeTeam]
            guard teams.contains(where: { $0.id == player.team.id }) else { return [] }
            let season = filters.market.history(player, board: board)
            let opponent = teams.first { $0.id != player.team.id }
            let sample = filters.sample.logs(season, opponent: opponent?.id)
            guard sample.count >= filters.minimum else { return [] }

            let offers = filters.market.offers(player, gameID: board.game.id, side: filters.side).filter {
                (filters.book == "all" || $0.vendor == filters.book) && filters.price.accepts($0.odds)
            }
            let byLine = Dictionary(grouping: offers) { Line(value: $0.line, milestone: $0.milestone) }
            return byLine.values.compactMap { quotes in
                guard let quote = quotes.max(by: {
                    $0.odds == $1.odds ? $0.vendor > $1.vendor : $0.odds < $1.odds
                }) else { return nil }
                let rate = filters.market.rate(sample, against: quote, side: filters.side)
                guard rate.decisions >= filters.minimum, let percent = rate.percent else { return nil }
                let seasonRate = filters.market.rate(season[...], against: quote, side: filters.side)
                return Row(player: player, quote: quote, situation: rate, season: seasonRate, rate: percent)
            }
        }.sorted {
            if $0.rate != $1.rate { return $0.rate > $1.rate }
            if $0.situation.decisions != $1.situation.decisions { return $0.situation.decisions > $1.situation.decisions }
            if $0.quote.odds != $1.quote.odds { return $0.quote.odds > $1.quote.odds }
            return $0.id < $1.id
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            controls
            let available = rows
            if available.isEmpty {
                ContentUnavailableView {
                    Label("No props match these filters", systemImage: "magnifyingglass")
                } description: {
                    Text("Try another market, price, or game sample.")
                } actions: {
                    Button("Reset filters") { filters = Filters() }
                }
            } else {
                Text("\(available.count) \(available.count == 1 ? "line" : "lines") · Ranked by recorded hit rate")
                    .font(.caption).foregroundStyle(.secondary)
                LazyVStack(spacing: 9) {
                    ForEach(available, content: card)
                }
            }
        }
    }

    private var controls: some View {
        let actions = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 6))
        let summary = "\(filters.price.rawValue) · \(filters.minimum)+ decided games"
        return VStack(alignment: .leading, spacing: 7) {
            actions {
                if case .member(_, let account) = scope {
                    ResearchSavedFilters(account: account, board: "court.prop-trends", current: filters) { filters = $0 }
                }
                ResearchToolFilter(title: "Game sample", symbol: "clock", selection: filters.sample.rawValue) {
                    Picker("Game sample", selection: $filters.sample) {
                        ForEach(Sample.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
                ResearchToolFilter(title: "Side", symbol: filters.side == .over ? "arrow.up" : "arrow.down",
                    selection: filters.side.rawValue) {
                    Picker("Side", selection: $filters.side) {
                        ForEach(CourtPlayerMarket.Side.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
            }
            actions {
                ResearchToolFilter(title: "Market", symbol: filters.market.symbol, selection: filters.market.label) {
                    Picker("Market", selection: $filters.market) {
                        ForEach(marketOptions, id: \.self) { Label($0.label, systemImage: $0.symbol).tag($0) }
                    }
                }
                ResearchArtworkPicker(title: "Sportsbook", options: bookOptions, selection: $filters.book)
                ResearchToolFilter(title: "More prop filters", symbol: "line.3.horizontal.decrease", selection: "Filters") {
                    Picker("Odds range", selection: $filters.price) {
                        ForEach(Price.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Minimum decided games", selection: $filters.minimum) {
                        ForEach([1, 3, 5], id: \.self) { Text("\($0)+ decided games").tag($0) }
                    }
                }
                .accessibilityValue(summary)
            }
            Text(summary).font(.caption).foregroundStyle(.secondary)
                .accessibilityHidden(true)
            TextField("Find a player", text: $filters.search)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    private func card(_ row: Row) -> some View {
        let player = row.player
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        let target = filters.market.target(row.quote, side: filters.side)
        return ResearchToolCard(color: colors.primary) {
            NavigationLink {
                CourtPlayerView(player: player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                    tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason, initialBook: row.quote.vendor,
                    initialMarket: filters.market.rawValue, initialSide: filters.side, researchScope: scope,
                    linkedQuote: .init(line: row.quote.line, contract: row.quote.milestone ? .milestone : .standard),
                    matchupBoard: board, linkedPanel: filters.sample == .opponent ? .opponent : .trends,
                    initialVenue: filters.sample.venue, initialTrendWindow: filters.sample.window ?? 20)
            } label: {
                HStack {
                    ResearchToolPortrait(name: "\(player.firstName) \(player.lastName)",
                        subtitle: "\(player.team.abbreviation) · \(filters.market.label) · \(target)",
                        portraits: player.headshot.map { [$0] } ?? [], teamLogo: player.team.logo,
                        primary: colors.primary, secondary: colors.secondary)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } content: {
            ResearchToolBook(book: row.quote.vendor, price: row.quote.odds)
            let situation: [ResearchToolValues.Value] = [
                .init(label: filters.sample.rawValue, text: record(row.situation),
                      tone: Brand.signal(row.rate - 0.5, for: palette.colorScheme))
            ]
            let season: [ResearchToolValues.Value] = filters.sample == .season ? [] : [
                .init(label: "Season record", text: record(row.season))
            ]
            ResearchToolValues(items: situation + season, preferredColumns: 2)
        }
    }

    private func record(_ rate: CourtPlayerMarket.HitRate) -> String {
        guard rate.decisions > 0 else { return "—" }
        let result = "\(rate.wins)/\(rate.decisions)"
        return rate.pushes > 0 ? "\(result) · \(rate.pushes) \(rate.pushes == 1 ? "push" : "pushes")" : result
    }
}
