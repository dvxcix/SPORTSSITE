import SwiftUI

struct SidelineSlateEdgeView: View {
    private enum Sort: String, CaseIterable { case score = "SlipSurge Score", mismatch = "MM", picks = "Public picks" }

    private struct Request: Equatable {
        let date: String
        let sample: SidelineResearchSample
        let revision: Int
        let retry: Int
    }

    let api: SidelineAPI
    let date: String
    let teams: [SidelineMarketTools.Visual]
    let revision: Int
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sample = SidelineResearchSample.automatic
    @State private var market = "anytime_td"
    @State private var game: String?
    @State private var book: String?
    @State private var sort = Sort.score
    @State private var search = ""
    @State private var result: (Request, SidelineEdgePayload)?
    @State private var error: (any Error)?
    @State private var retry = 0

    init(api: SidelineAPI, date: String, teams: [SidelineMarketTools.Visual], revision: Int,
        initialSample: SidelineResearchSample = .automatic) {
        self.api = api
        self.date = date
        self.teams = teams
        self.revision = revision
        _sample = State(initialValue: initialSample)
    }

    private var request: Request { .init(date: date, sample: sample, revision: revision, retry: retry) }
    private var data: SidelineEdgePayload? { result.flatMap { $0.0 == request ? $0.1 : nil } }

    var body: some View {
        if api.isFeatured {
            ResearchToolMessage(title: "Slate Edge unavailable", error: SlipSurgeHTTP.Status(code: 403, data: Data()))
        } else {
            VStack(alignment: .leading, spacing: 9) {
                controls
                if let data {
                    rows(data)
                } else {
                    ResearchToolMessage(title: "Slate Edge couldn’t load", error: error) { retry += 1 }
                }
            }
            .onChange(of: date) { _, _ in game = nil; book = nil }
            .onChange(of: market) { _, _ in book = nil }
            .task(id: request) { await load(request) }
        }
    }

    private var controls: some View {
        let books = Set(data?.entries.flatMap { $0.markets[market]?.books ?? [] } ?? []).sorted()
        return VStack(alignment: .leading, spacing: 7) {
            ResearchToolRail(title: "Market", choices: SidelineResearchMarket.edge, selection: $market,
                label: SidelineResearchMarket.title, glyph: SidelineResearchMarket.glyph)
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchToolFilter(title: "Sample", symbol: "clock.arrow.circlepath", selection: data?.sampleLabel ?? sample.label) {
                        Picker("Sample", selection: $sample) {
                            ForEach(SidelineResearchSample.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    ResearchToolFilter(title: "Game", symbol: "calendar", selection: data?.games.first { $0.id == game }?.label ?? "All games") {
                        Picker("Game", selection: $game) {
                            Text("All games").tag(nil as String?)
                            ForEach(data?.games ?? []) { Text($0.label).tag(Optional($0.id)) }
                        }
                    }
                    ResearchArtworkPicker(title: "Availability by sportsbook",
                        options: [.init(id: "", title: "All books", icon: "books.vertical")] + books.map(ResearchArtworkPicker.Option.sportsbook),
                        selection: Binding(get: { book ?? "" }, set: { book = $0.isEmpty ? nil : $0 }))
                    ResearchToolFilter(title: "Sort", symbol: "arrow.up.arrow.down", selection: sort.rawValue) {
                        Picker("Sort", selection: $sort) {
                            ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                    }
                }
            }.scrollIndicators(.hidden)
            TextField("Find a player or team", text: $search)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    @ViewBuilder
    private func rows(_ data: SidelineEdgePayload) -> some View {
        let visible = data.entries.filter { row in
            guard let offer = row.markets[market] else { return false }
            return (game == nil || game == row.gameId) && (book.map(offer.books.contains) ?? true)
                && (search.isEmpty || row.name.localizedCaseInsensitiveContains(search) || row.team.localizedCaseInsensitiveContains(search))
        }.sorted { rank($0) > rank($1) }

        if let missing = data.unavailableGames, !missing.isEmpty {
            Label("Pregame research unavailable for \(missing.count) matchups.", systemImage: "clock")
                .font(.caption).foregroundStyle(.secondary)
        }
        if let legacy = data.legacyUnverifiedGames, !legacy.isEmpty {
            Label("Some ranks were withheld because their original inputs couldn’t be verified.", systemImage: "info.circle")
                .font(.caption).foregroundStyle(.secondary)
        }
        if visible.isEmpty {
            ContentUnavailableView("No Slate Edge rows for these filters", systemImage: "chart.bar.xaxis")
        } else {
            LazyVStack(spacing: 9) {
                ForEach(visible) { row in
                    if let offer = row.markets[market] {
                        card(row, offer: offer, savedAt: data.snapshots?[row.gameId])
                    }
                }
            }
        }
    }

    private func card(_ row: SidelineEdgePayload.Player, offer: SidelineEdgePayload.Market, savedAt: String?) -> some View {
        let visual = teams.first { SidelineResearchMarket.normalizeTeam($0.code) == SidelineResearchMarket.normalizeTeam(row.team) }
        let primary = visual?.primary ?? slipPalette.surface
        let mm = row.mm[market] ?? nil
        return ResearchToolCard(color: primary) {
            ResearchToolPortrait(name: row.name, subtitle: "\(row.team) · \(row.position) · \(row.gameLabel)",
                portraits: row.headshot.map { [$0] } ?? [], teamLogo: visual?.logo ?? row.teamLogo,
                primary: primary, secondary: visual?.secondary ?? primary)
        } content: {
            HStack {
                Text(offer.label + (offer.line.map { " · \($0.formatted())" } ?? "")).font(.caption.weight(.semibold))
                Spacer(minLength: 2)
                if let vendor = offer.vendor { ResearchToolBook(book: vendor, price: offer.odds) }
            }
            ResearchToolValues(items: [
                .init(label: "SlipSurge Score", text: ResearchFormat.decimal(row.score[market] ?? nil), tone: slipPalette.accent),
                .init(label: "MM", text: ResearchFormat.signed(mm), tone: Brand.signal(mm.map(Double.init), for: scheme)),
                .init(label: "Public picks", text: offer.picks.map(String.init) ?? "—"),
                .init(label: "Opening price", text: ResearchFormat.price(offer.openingOdds)),
                .init(label: "Opening line", text: ResearchFormat.decimal(offer.openingLine)),
                .init(label: "Book gap", text: ResearchFormat.decimal(offer.bookGap))
            ])
            if let value = savedAt.flatMap(SidelineBoard.timestamp) {
                Label("Pregame snapshot \(value.formatted(date: .abbreviated, time: .shortened))", systemImage: "clock")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func rank(_ row: SidelineEdgePayload.Player) -> Double {
        switch sort {
        case .score: (row.score[market] ?? nil) ?? -.infinity
        case .mismatch: (row.mm[market] ?? nil).map(Double.init) ?? -.infinity
        case .picks: row.markets[market]?.picks.map(Double.init) ?? -.infinity
        }
    }

    private func load(_ requested: Request) async {
        error = nil
        do {
            let payload = try await api.research(SidelineEdgePayload.self, tool: .slateEdge, date: requested.date, sample: requested.sample)
            guard !Task.isCancelled, requested == request else { return }
            guard payload.date == requested.date else { throw URLError(.cannotParseResponse) }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { result = (requested, payload) }
        } catch {
            if !Task.isCancelled, requested == request { self.error = error }
        }
    }
}
