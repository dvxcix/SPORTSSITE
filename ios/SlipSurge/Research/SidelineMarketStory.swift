import SwiftUI

struct SidelineMarketStory: View {
    private enum Kind: String, CaseIterable {
        case milestone, standard = "over_under"
        var label: String { self == .milestone ? "Milestones" : "Over / Under" }
    }

    private struct Frame: Decodable {
        struct Player: Decodable, Identifiable {
            struct Contract: Decodable, Identifiable {
                let line: Double
                let label: String
                let price: Int?
                let opening: Int?
                let openLine: Double?
                let observedAt: String?
                let movement: Double?
                var id: Double { line }
            }
            let id: Int
            let name: String
            let team: String
            let position: String?
            let portraits: [URL]
            let contracts: [Contract]
        }

        let gameId: String
        let date: String
        let market: String
        let book: String
        let kind: String
        let side: String
        let captures: [String]
        let selectedAt: String?
        let observedAt: String?
        let legacy: Bool
        let books: [String]
        let markets: [String]
        let rows: [Player]
    }

    private struct Request: Equatable {
        let market: String
        let book: String
        let kind: Kind
        let side: String
        let capture: String?
        let retry: Int
    }

    let api: SidelineAPI
    let game: String
    let teams: [SidelineMarketTools.Visual]
    let initialPlayer: Int?
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var market = "receiving_yards"
    @State private var book: String
    @State private var kind = Kind.milestone
    @State private var side = "over"
    @State private var capture: String?
    @State private var playerFilter: Int?
    @State private var search = ""
    @State private var retry = 0
    @State private var frame: (Request, Frame)?
    @State private var error: (Request, any Error)?

    init(api: SidelineAPI, game: String, teams: [SidelineMarketTools.Visual], initialBook: String?,
        initialCapture: Date?, initialPlayer: Int?) {
        self.api = api
        self.game = game
        self.teams = teams
        self.initialPlayer = initialPlayer
        _book = State(initialValue: initialBook ?? "fanduel")
        _capture = State(initialValue: initialCapture.map {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions.insert(.withFractionalSeconds)
            return formatter.string(from: $0)
        })
        _playerFilter = State(initialValue: initialPlayer)
    }

    private var request: Request {
        .init(market: market, book: book, kind: kind, side: kind == .standard ? side : "over", capture: capture, retry: retry)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ResearchSectionTitle(title: "Market Story")
            controls
            if let data = frame?.1 { capturePicker(data) }
            if let frame, frame.0 == request {
                content(frame.1)
            } else {
                ResearchToolMessage(title: "Market archive couldn’t load",
                    error: error.flatMap { $0.0 == request ? $0.1 : nil }) { retry += 1 }
            }
        }
        .task(id: request) { await load(request) }
        .onChange(of: playerFilter) { retry += 1 }
    }

    private var controls: some View {
        let availableMarkets = Set((frame?.1.markets ?? SidelineResearchMarket.mismatch) + [market]).sorted()
        let availableBooks = Set((frame?.1.books ?? []) + [book]).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                ResearchToolFilter(title: "Market", symbol: "ticket", selection: SidelineResearchMarket.title(market)) {
                    Picker("Market", selection: $market) {
                        ForEach(availableMarkets, id: \.self) { Label(SidelineResearchMarket.title($0), systemImage: SidelineResearchMarket.glyph($0)).tag($0) }
                    }
                }
                Spacer(minLength: 0)
                SportsbookPicker(books: availableBooks, selection: $book)
            }
            Picker("Contract", selection: $kind) {
                ForEach(Kind.allCases, id: \.self) { Text($0.label).tag($0) }
            }.pickerStyle(.segmented)
            if kind == .standard {
                Picker("Side", selection: $side) {
                    Text("Over").tag("over")
                    Text("Under").tag("under")
                }.pickerStyle(.segmented)
            }
            if playerFilter != nil {
                Button("Show all players", systemImage: "person.2") { playerFilter = nil }.buttonStyle(.bordered)
            }
            TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    @ViewBuilder private func capturePicker(_ data: Frame) -> some View {
        if !data.captures.isEmpty {
            let known = data.selectedAt.flatMap { data.captures.firstIndex(of: $0) }
            let index = known ?? (capture == nil ? data.captures.count - 1 : -1)
            HStack {
                Button("Previous capture", systemImage: "chevron.left") {
                    if index > 0 { capture = data.captures[index - 1] }
                }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44).disabled(index <= 0)
                Picker("Capture", selection: Binding(get: { capture == nil ? nil : data.selectedAt ?? capture }, set: { capture = $0 })) {
                    Text("Latest capture").tag(nil as String?)
                    if let capture, data.selectedAt == nil { Text("Before first capture").tag(Optional(capture)) }
                    ForEach(data.captures.reversed(), id: \.self) { Text(displayTime($0)).tag(Optional($0)) }
                }.frame(maxWidth: .infinity)
                Button("Next capture", systemImage: "chevron.right") {
                    if index < data.captures.count - 1 { capture = data.captures[index + 1] }
                }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44).disabled(index >= data.captures.count - 1)
            }
            .background(slipPalette.surface, in: .rect(cornerRadius: 12))
            .accessibilityHint("Capture \(index + 1) of \(data.captures.count)")
        }
    }

    @ViewBuilder private func content(_ data: Frame) -> some View {
        if let captured = data.selectedAt {
            Label("Capture \(displayTime(captured))", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
            if let observed = data.observedAt, displayTime(observed) != displayTime(captured) {
                Text("Prices observed \(displayTime(observed))").font(.caption).foregroundStyle(.secondary)
            }
        }
        if data.legacy {
            Label("Historical capture with limited lineup verification", systemImage: "info.circle")
                .font(.caption).foregroundStyle(.secondary)
        }
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = data.rows.filter { term.isEmpty || $0.name.localizedStandardContains(term) }
        if rows.isEmpty {
            ContentUnavailableView(data.selectedAt == nil ? "No saved capture at this time" : "No recorded prices for this selection",
                systemImage: "clock.arrow.circlepath")
        } else {
            LazyVStack(spacing: 8) {
                ForEach(rows) { row in playerCard(row) }
            }
        }
    }

    private func playerCard(_ row: Frame.Player) -> some View {
        let colors = teams.first { SidelineResearchMarket.normalizeTeam($0.code) == SidelineResearchMarket.normalizeTeam(row.team) }
        let tint = colors?.primary ?? slipPalette.accent
        return ResearchToolCard(color: tint) {
            ResearchToolPortrait(name: row.name, subtitle: [row.team, row.position].compactMap { $0 }.joined(separator: " · "),
                portraits: row.portraits, teamLogo: colors?.logo, primary: tint, secondary: colors?.secondary ?? tint)
        } content: {
            ForEach(row.contracts) { quote in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(kind == .milestone ? "\(quote.line.formatted())+" :
                            "\(side == "over" ? "O" : "U") \(quote.line.formatted())").font(.subheadline.weight(.semibold))
                        if let at = quote.observedAt { Text(displayTime(at)).font(.caption2).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    ResearchToolBook(book: book, price: quote.price)
                }
                ResearchToolValues(items: [
                    .init(label: "Opening", text: ResearchFormat.price(quote.opening)),
                    .init(label: "Opening line", text: ResearchFormat.decimal(quote.openLine)),
                    .init(label: "Price move", text: ResearchFormat.points(quote.movement), tone: Brand.signal(quote.movement, for: scheme)),
                ])
            }
        }
    }

    private func displayTime(_ value: String) -> String {
        SidelineBoard.timestamp(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
    }

    private func load(_ wanted: Request) async {
        guard case .member(let account, let userID) = api.scope else { return }
        do {
            let selectedPlayer = playerFilter
            var query: [URLQueryItem] = [.init(name: "projection", value: "archive"), .init(name: "game", value: game),
                .init(name: "market", value: wanted.market), .init(name: "book", value: wanted.book),
                .init(name: "kind", value: wanted.kind.rawValue), .init(name: "side", value: wanted.side)]
            if let at = wanted.capture { query.append(.init(name: "at", value: at)) }
            if let selectedPlayer { query.append(.init(name: "player", value: String(selectedPlayer))) }
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/sideline/market", query: query, account: account, userID: userID)
            guard data.count <= 3_145_728 else { throw URLError(.cannotParseResponse) }
            let loaded = try JSONDecoder().decode(Frame.self, from: data)
            try Task.checkCancellation()
            guard wanted == request, selectedPlayer == playerFilter, loaded.gameId == game,
                loaded.market == wanted.market, loaded.book == wanted.book, loaded.kind == wanted.kind.rawValue,
                loaded.side == wanted.side, loaded.rows.allSatisfy({ selectedPlayer == nil || $0.id == selectedPlayer }) else { return }
            frame = (wanted, loaded)
            error = nil
        } catch {
            if !Task.isCancelled, wanted == request { self.error = (wanted, error) }
        }
    }
}
