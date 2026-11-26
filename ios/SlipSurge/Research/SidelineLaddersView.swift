import SwiftUI

struct SidelineLaddersView: View {
    private enum ContractKind: String, CaseIterable { case milestone, overUnder = "over_under"; var title: String { self == .milestone ? "Milestones" : "Over / Under" } }
    private enum Side: String, CaseIterable { case over, under }
    private enum Display: String, CaseIterable { case odds = "Odds", movement = "Movement", ratio = "TD ratio", picks = "Picks" }
    private enum Order: String, CaseIterable { case player = "Player", score = "SlipSurge Score", mm = "MM", picks = "Public picks" }

    private struct Request: Equatable {
        let market: String
        let book: String
        let kind: ContractKind
        let side: Side
        let sample: SidelineResearchSample
        let revision: Int
        let retry: Int
    }

    private struct Selection: Identifiable {
        let player: SidelineResearchPayload.Player
        let contract: SidelineLadderData.Contract
        let lineTitle: String
        let book: String
        let market: String
        let canPost: Bool
        var id: String { "\(player.id):\(contract.line):\(book):\(market)" }
    }

    let api: SidelineAPI
    let date: String
    let game: String
    let teams: [SidelineMarketTools.Visual]
    let revision: Int
    let initialPlayer: Int?
    let initialLine: Double?
    @Environment(\.colorScheme) private var scheme
    @State private var market = "receiving_yards"
    @State private var book = "fanduel"
    @State private var kind = ContractKind.milestone
    @State private var side = Side.over
    @State private var sample = SidelineResearchSample.automatic
    @State private var display = Display.odds
    @State private var order = Order.player
    @State private var threshold: Double?
    @State private var team = ""
    @State private var search = ""
    @State private var result: (Request, SidelineLadderData)?
    @State private var error: (any Error)?
    @State private var retry = 0
    @State private var selection: Selection?
    @State private var selectedPlayer: SidelineLadderData.Row?
    @State private var pendingShare: TrackedPickAPI.Leg?
    @State private var share: TrackedPickAPI.Leg?
    @State private var saved: [String: UUID] = [:]
    @State private var saving = false
    @State private var notice: String?
    @State private var openedLinkedQuote = false
    @State private var linkedQuoteUnavailable = false

    init(api: SidelineAPI, date: String, game: String, teams: [SidelineMarketTools.Visual], revision: Int,
        initialBook: String? = nil, initialSample: SidelineResearchSample = .automatic, initialPlayer: Int? = nil, initialLine: Double? = nil) {
        self.api = api
        self.date = date
        self.game = game
        self.teams = teams
        self.revision = revision
        self.initialPlayer = initialPlayer
        self.initialLine = initialLine
        _sample = State(initialValue: initialSample)
        _threshold = State(initialValue: initialLine)
        if let initialBook { _book = State(initialValue: initialBook) }
    }

    private var request: Request {
        .init(market: market, book: book, kind: kind, side: kind == .milestone ? .over : side, sample: sample, revision: revision, retry: retry)
    }

    var body: some View {
        let data = result.flatMap { $0.0 == request ? $0.1 : nil }
        VStack(alignment: .leading, spacing: 9) {
            filters
            if linkedQuoteUnavailable {
                Label("The linked player price is unavailable for this book and matchup.", systemImage: "clock.badge.questionmark")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let data {
                information(data)
                ladder(data)
            } else {
                ResearchToolMessage(title: "Prop ladders couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: request) { await load(request) }
        .sheet(item: $selection, onDismiss: {
            notice = nil
            share = pendingShare
            pendingShare = nil
        }) { contract in
            NavigationStack { contractDetails(contract) }
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $share) { leg in
            if case .member(let account, let userID) = api.scope {
                FeedComposerView(account: account, userID: userID, allowMLB: false,
                    startWithPick: true, initialPick: leg) { notice = "Pick posted." }
            }
        }
        .sheet(item: $selectedPlayer) { row in
            NavigationStack {
                SidelineMMPlayerView(api: api, player: row.player, mm: row.mm, score: row.score, visual: teamVisual(row.player.team), date: date,
                    game: game, market: market, sample: sample, initialBook: book)
            }
            .presentationDragIndicator(.visible)
        }
    }

    private var filters: some View {
        let markets = [market] + (result?.1.markets ?? SidelineResearchMarket.mismatch)
        let books = [book] + (result?.1.books ?? [])
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchArtworkPicker(title: "Market", options: Set(markets).sorted().map {
                        .init(id: $0, title: SidelineResearchMarket.title($0), icon: "chart.bar")
                    }, selection: $market)
                    SportsbookPicker(books: Set(books).sorted(), selection: $book)
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "Both teams", icon: "person.2")]
                        + teams.map { .team(id: $0.code, title: $0.code, logo: $0.logo) }, selection: $team)
                }.padding(.vertical, 3)
            }.scrollIndicators(.hidden)
            Picker("Line type", selection: $kind) {
                ForEach(ContractKind.allCases, id: \.self) { Text($0.title).tag($0) }
            }.pickerStyle(.segmented)
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    if kind == .overUnder {
                        ResearchToolFilter(title: "Side", symbol: "arrow.up.arrow.down.circle", selection: side.rawValue.capitalized) {
                            Picker("Side", selection: $side) { ForEach(Side.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) } }
                        }
                    }
                    ResearchToolFilter(title: "Display", symbol: "rectangle.split.2x1", selection: display.rawValue) {
                        Picker("Display", selection: $display) { ForEach(Display.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                    }
                    ResearchToolFilter(title: "Sort", symbol: "arrow.up.arrow.down", selection: order.rawValue) {
                        Picker("Sort", selection: $order) { ForEach(Order.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                    }
                    ResearchToolFilter(title: "Historical sample", symbol: "clock.arrow.circlepath", selection: sample.label) {
                        Picker("Historical sample", selection: $sample) { ForEach(SidelineResearchSample.allCases, id: \.self) { Text($0.label).tag($0) } }
                    }
                }.padding(.vertical, 3)
            }.scrollIndicators(.hidden)
            TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    @ViewBuilder
    private func information(_ data: SidelineLadderData) -> some View {
        if let cutoff = data.cutoffAt.flatMap(SidelineBoard.timestamp) {
            Label("Pregame cutoff \(cutoff.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        if data.availabilityStale { Text("Player availability could not be verified for this saved observation.").font(.caption).foregroundStyle(.secondary) }
        if data.matricesUnavailable { Text("Saved Matrices couldn’t load.").font(.caption).foregroundStyle(.secondary) }
    }

    @ViewBuilder
    private func ladder(_ data: SidelineLadderData) -> some View {
        let rows = data.rows.filter { row in
            (team.isEmpty || SidelineResearchMarket.normalizeTeam(row.player.team) == SidelineResearchMarket.normalizeTeam(team))
                && (search.isEmpty || row.player.name.localizedStandardContains(search))
        }.sorted(by: ordered)
        let allLines = Set(rows.flatMap(\.contracts).map(\.line)).sorted()
        let starts = stride(from: 0, to: allLines.count, by: 6).map { allLines[$0] }
        let chosen = threshold.flatMap { starts.contains($0) ? $0 : nil } ?? starts.first
        let from = chosen.flatMap { allLines.firstIndex(of: $0) } ?? 0
        let visible = Set(allLines.dropFirst(from).prefix(6))
        if !starts.isEmpty {
            ResearchToolFilter(title: "Starting line", symbol: "flag", selection: chosen.map(lineName) ?? "—") {
                Picker("Starting line", selection: Binding(get: { chosen }, set: { threshold = $0 })) {
                    ForEach(starts, id: \.self) { Text(lineName($0)).tag(Optional($0)) }
                }
            }
        }
        if rows.isEmpty {
            ContentUnavailableView("No contracts for these filters", systemImage: "chart.bar")
        } else {
            LazyVStack(spacing: 9) {
                ForEach(rows.filter { $0.contracts.contains { visible.contains($0.line) } }) { row in
                    resultCard(row, lines: visible, canPost: data.canPost)
                }
            }
        }
    }

    private func resultCard(_ row: SidelineLadderData.Row, lines: Set<Double>, canPost: Bool) -> some View {
        let visual = teamVisual(row.player.team)
        let color = visual.primary
        return ResearchToolCard(color: color) {
            Button { selectedPlayer = row } label: {
                HStack {
                    ResearchToolPortrait(name: row.player.name,
                        subtitle: [row.player.team, row.player.position, row.status].compactMap { $0 }.joined(separator: " · "),
                        portraits: row.player.portraits, teamLogo: visual.logo, primary: color, secondary: visual.secondary ?? color)
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
            }.buttonStyle(SlipSurgePressStyle()).accessibilityHint("Opens player trends")
        } content: {
            ResearchToolValues(items: [.init(label: "Score", text: ResearchFormat.decimal(row.score)),
                .init(label: "MM", text: ResearchFormat.signed(row.mm), tone: Brand.signal(row.mm.map(Double.init), for: scheme)),
                .init(label: "Public picks", text: row.picks?.formatted() ?? "—")])
            if !row.matrices.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 5) {
                        ForEach(row.matrices) { matrix in
                            Text(matrix.name).font(.caption2.weight(.semibold)).padding(.horizontal, 7).padding(.vertical, 4)
                                .background((Color(hex: matrix.color) ?? .secondary).opacity(0.18), in: Capsule())
                        }
                    }
                }.scrollIndicators(.hidden).accessibilityLabel("Matching Matrices")
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 102), spacing: 6)], alignment: .leading, spacing: 6) {
                ForEach(row.contracts.filter { lines.contains($0.line) }) { contract in
                    Button {
                        selection = .init(player: row.player, contract: contract, lineTitle: lineName(contract.line), book: book, market: market, canPost: canPost)
                    } label: { contractTile(contract) }.buttonStyle(SlipSurgePressStyle())
                    .accessibilityHint("Opens the exact sportsbook contract")
                }
            }
        }
    }

    private func contractTile(_ contract: SidelineLadderData.Contract) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(lineName(contract.line)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            Text(primary(contract)).font(.subheadline.weight(.bold)).monospacedDigit()
                .foregroundStyle(display == .movement ? Brand.signal(contract.movement, for: scheme) : Brand.text(for: scheme))
            Text(secondary(contract)).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .padding(7)
        .background(Color.secondary.opacity(0.10), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }

    private func contractDetails(_ item: Selection) -> some View {
        List {
            Section {
                LabeledContent("Player", value: item.player.name)
                HStack { Text("Sportsbook"); Spacer(); ResearchToolBook(book: item.book, price: item.contract.current) }
                LabeledContent("Line", value: item.lineTitle)
                LabeledContent("Opening odds", value: ResearchFormat.price(item.contract.opening))
                if let opening = item.contract.openingLine, opening != item.contract.line {
                    LabeledContent("Opening line", value: opening.formatted())
                }
                LabeledContent("Probability movement", value: ResearchFormat.points(item.contract.movement))
                LabeledContent(item.contract.estimated ? "Estimated picks" : "Observed picks", value: item.contract.picks?.formatted() ?? "—")
            }
            if let leg = item.contract.leg, case .member(let account, let userID) = api.scope {
                Button("Save to Watchlist", systemImage: "star") { Task { await save(leg, account: account, userID: userID) } }.disabled(saving)
                if item.canPost {
                    Button("Compose tracked pick", systemImage: "square.and.pencil") { pendingShare = leg; selection = nil }
                }
            }
            if let notice { Text(notice).foregroundStyle(.secondary) }
        }
        .navigationTitle(SidelineResearchMarket.title(item.market)).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { selection = nil } } }
    }

    private func load(_ requested: Request) async {
        error = nil
        if openedLinkedQuote || initialLine == nil { threshold = nil }
        do {
            let data = try await api.research(SidelineLadderData.self, tool: .ladders, date: date, game: game, sample: requested.sample,
                filters: [.init(name: "market", value: requested.market), .init(name: "book", value: requested.book),
                    .init(name: "kind", value: requested.kind.rawValue), .init(name: "side", value: requested.side.rawValue)])
            guard data.gameId == game, data.date == date, data.market == requested.market, data.book == requested.book,
                data.kind == requested.kind.rawValue, data.side == requested.side.rawValue else { throw URLError(.cannotParseResponse) }
            if !Task.isCancelled, requested == request {
                result = (requested, data)
                if !openedLinkedQuote, let initialPlayer {
                    openedLinkedQuote = true
                    if let row = data.rows.first(where: { $0.id == initialPlayer }) {
                        if let initialLine, let offer = row.contracts.first(where: { $0.line == initialLine }) {
                            selection = .init(player: row.player, contract: offer, lineTitle: lineName(offer.line),
                                book: book, market: market, canPost: data.canPost)
                        } else if initialLine == nil {
                            selectedPlayer = row
                        } else { linkedQuoteUnavailable = true }
                    } else { linkedQuoteUnavailable = true }
                }
            }
        } catch { if !Task.isCancelled { self.error = error } }
    }

    private func save(_ leg: TrackedPickAPI.Leg, account: AccountStore, userID: UUID) async {
        guard !saving else { return }
        saving = true
        notice = nil
        defer { saving = false }
        let id = saved[leg.id] ?? UUID()
        saved[leg.id] = id
        do {
            try await ResearchLibraryAPI(account: account, userID: userID).mutate(.init(kind: "watchlist-save", id: id.uuidString.lowercased(), market: leg))
            notice = "Saved to Watchlist."
        } catch { notice = "Watchlist save couldn’t be confirmed. Tap Save to retry." }
    }

    private func ordered(_ lhs: SidelineLadderData.Row, _ rhs: SidelineLadderData.Row) -> Bool {
        if lhs.eligible != rhs.eligible { return lhs.eligible }
        let a = sortValue(lhs), b = sortValue(rhs)
        return a == b ? lhs.player.name.localizedStandardCompare(rhs.player.name) == .orderedAscending : a > b
    }

    private func sortValue(_ row: SidelineLadderData.Row) -> Double {
        switch order {
        case .player: 0
        case .score: row.score ?? -.infinity
        case .mm: row.mm.map(Double.init) ?? -.infinity
        case .picks: row.picks.map(Double.init) ?? -.infinity
        }
    }

    private func lineName(_ line: Double) -> String {
        if kind == .milestone { return "\(line.formatted())+" }
        return "\(side == .over ? "Over" : "Under") \(line.formatted())"
    }

    private func primary(_ contract: SidelineLadderData.Contract) -> String {
        switch display {
        case .odds: ResearchFormat.price(contract.current)
        case .movement: ResearchFormat.points(contract.movement)
        case .ratio: ResearchFormat.decimal(contract.ratio)
        case .picks: contract.picks?.formatted() ?? "—"
        }
    }

    private func secondary(_ contract: SidelineLadderData.Contract) -> String {
        if display == .picks { return contract.estimated ? "Estimated" : (contract.picks == nil ? "Unavailable" : "Observed") }
        if contract.openingOnly, let opening = contract.opening { return "Open only \(ResearchFormat.price(opening))" }
        return display == .odds ? "Open \(ResearchFormat.price(contract.opening))" : "Odds \(ResearchFormat.price(contract.current))"
    }

    private func teamVisual(_ code: String) -> SidelineMarketTools.Visual {
        teams.first { SidelineResearchMarket.normalizeTeam($0.code) == SidelineResearchMarket.normalizeTeam(code) }
            ?? .init(code: code, logo: nil, primary: Brand.accent(for: scheme), secondary: nil)
    }

}
