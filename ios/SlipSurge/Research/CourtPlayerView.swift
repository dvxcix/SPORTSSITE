import SwiftUI

struct CourtPlayerIdentity: View {
    let player: CourtBoard.Player

    var body: some View {
        let colors = CourtTeamColors.colors(for: player.team.abbreviation)
        HStack(spacing: 12) {
            PlayerArtwork(
                portraits: player.headshot.map { [$0] } ?? [],
                logo: player.team.logo, primary: colors.primary, secondary: colors.secondary
            )
            VStack(alignment: .leading, spacing: 3) {
                Text("\(player.firstName) \(player.lastName)").font(.headline)
                Text([player.team.abbreviation, player.position].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct CourtPlayerView: View {
    let player: CourtBoard.Player
    let game: CourtBoard.Game
    let mode: CourtResearchMode
    let frozen: Bool
    let tip: Date?
    let observedAt: Date
    let sampleSeason: Int?
    var initialBook: String?
    var initialMarket: String?
    var initialSide = CourtPlayerMarket.Side.over
    var researchScope: CourtView.Scope?
    var linkedQuote: CourtLinkContext.Quote?
    var matchupBoard: CourtBoard?
    var linkedPanel: CourtLinkContext.Panel?
    var linkedMetric: String?
    var initialVenue = CourtPlayerMarket.Venue.all

    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.nativeResume) private var resume
    @Environment(\.nativeResumeActive) private var resumeActive
    @Environment(\.courtResults) private var boardResults
    @State private var sportsbook = ""
    @State private var market = ""
    @State private var expired = false
    @State private var side = CourtPlayerMarket.Side.over
    @State private var window = 10
    @State private var line: CourtLinkContext.Quote?
    @State private var selectedPanel: CourtLinkContext.Panel?
    @State private var trackingMetric: String?
    @State private var chosenVenue: CourtPlayerMarket.Venue?
    @State private var configured = false
    @State private var ownResults: CourtObservedResults.Snapshot?

    private var panel: CourtLinkContext.Panel { selectedPanel ?? linkedPanel ?? .trends }
    private var venue: CourtPlayerMarket.Venue { chosenVenue ?? initialVenue }
    private var results: CourtObservedResults? {
        if let boardResults, boardResults.gameID == game.id { return boardResults.data }
        return ownResults?.gameID == game.id ? ownResults?.data : nil
    }
    private var panelOptions: [CourtLinkContext.Panel] {
        CourtLinkContext.Panel.allCases.filter {
            switch $0 {
            case .tracking: researchScope != nil && matchupBoard != nil
            case .court, .movement: researchScope != nil
            default: true
            }
        }
    }

    private var expiry: Date? {
        if mode == .live { return game.isFinal ? nil : observedAt.addingTimeInterval(30) }
        return frozen ? nil : (tip ?? .distantPast)
    }

    private var offers: [CourtBoard.Prop] {
        player.props.filter { $0.gameId == game.id && $0.playerId == player.id }
    }

    private var books: [String] { Set(offers.map(\.vendor)).sorted() }
    private var markets: [String] {
        let listed = Set(offers.filter { $0.vendor == sportsbook }.map(\.propType))
        let fallback = initialMarket.map { [$0, "points", "rebounds", "assists"] } ?? ["points", "rebounds", "assists"]
        return listed.isEmpty ? Set(fallback).sorted() : listed.sorted()
    }

    var body: some View {
        List {
            playerHeader
                .listRowInsets(.init(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            if expired || (expiry.map { $0 <= .now } ?? false) {
                Text(mode == .live ? "Return to The Court for a fresh live observation." : "Return to The Court to load the saved pregame snapshot.")
                    .listRowBackground(Brand.surface(for: scheme))
            } else {
                ResearchToolRail(title: "Player research", choices: panelOptions,
                    selection: Binding(get: { panel }, set: { selectedPanel = $0 }), label: \.label, glyph: \.icon)
                    .listRowInsets(.init(top: 2, leading: 0, bottom: 2, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                playerPanel
            }
        }
        .navigationTitle("\(player.firstName) \(player.lastName)")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .toolbar {
            if let url = shareURL {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url).accessibilityLabel("Share player research")
                }
            }
        }
        .onAppear {
            if !configured {
                let fallback = books.contains("fanduel") ? "fanduel" : (books.first ?? "")
                sportsbook = initialBook.flatMap { $0 == "all" ? nil : $0 } ?? fallback
                market = initialMarket ?? ""
                side = initialSide
                if initialMarket == nil { selectMarket() }
                line = linkedQuote
                configured = true
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { expired = expiry.map { $0 <= .now } ?? false }
        }
        .onChange(of: shareURL) { old, url in
            if resumeActive, let url, let researchScope, case .member(let account, _) = researchScope,
               let next = NativeResumeLocation.destination(url, title: "\(player.firstName) \(player.lastName)") {
                resume?.record(next, account: account, interaction: old != nil || linkedPanel == nil)
            }
        }
        .task(id: "\(game.id):\(mode.rawValue)") {
            guard results == nil, let researchScope, CourtObservedResults.allowed(game: game, mode: mode) else { return }
            let loaded = try? await CourtObservedResults.read(scope: researchScope, game: game, mode: mode)
            if !Task.isCancelled { ownResults = loaded }
        }
        .task {
            if let expiry {
                do {
                    try await Task.sleep(for: .seconds(max(0, expiry.timeIntervalSinceNow)))
                    expired = true
                } catch {
                    // Navigation removed the screen.
                }
            }
        }
    }

    @ViewBuilder private var playerPanel: some View {
        switch panel {
        case .trends:
            Section("Recent form") {
                marketSelection
                trend
            }.listRowBackground(Brand.surface(for: scheme))
            if let average = player.average {
                Section("Recorded averages") {
                    stat("Points", average["pts"] ?? nil)
                    stat("Rebounds", average["reb"] ?? nil)
                    stat("Assists", average["ast"] ?? nil)
                }.listRowBackground(Brand.surface(for: scheme))
            }
        case .ladder, .markets:
            Section(panel == .ladder ? "Recorded lines" : mode == .live ? "Live markets" : "Pregame markets") {
                marketSelection
                let selected = offers.filter { $0.vendor == sportsbook && $0.propType == market }
                    .sorted { (Double($0.lineValue) ?? 0, $0.id) < (Double($1.lineValue) ?? 0, $1.id) }
                if selected.isEmpty { Text("No recorded offers for this selection.").foregroundStyle(.secondary) }
                ForEach(selected) { offer in offerRow(offer) }
            }.listRowBackground(Brand.surface(for: scheme))
            if panel == .ladder {
                Section("Recent form") { trend }.listRowBackground(Brand.surface(for: scheme))
            }
        case .movement:
            if let researchScope, let metric = CourtPlayerMarket(rawValue: market) {
                CourtMovementView(scope: researchScope, game: game, mode: mode, players: [player],
                    initialMarket: metric, initialSide: side, initialBook: sportsbook,
                    initialContract: line?.contract, initialTarget: line?.line, playerID: player.id)
                    .listRowBackground(Brand.surface(for: scheme))
            }
        case .tracking:
            if let matchupBoard, let researchScope {
                CourtTrackingView(scope: researchScope, board: matchupBoard, revision: 0,
                    linkedPlayerID: player.id, linkedMetric: trackingMetric ?? linkedMetric) { trackingMetric = $0 }
                    .listRowBackground(Brand.surface(for: scheme))
            }
        case .court:
            if let researchScope {
                CourtShotView(api: .init(scope: researchScope), player: player, game: game, mode: mode, embedded: true)
                    .listRowBackground(Brand.surface(for: scheme))
            }
        }
    }

    private var shareURL: URL? {
        guard let researchScope, case .member = researchScope, !market.isEmpty else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = "/the-paint"
        var query: [URLQueryItem] = [.init(name: "date", value: game.date), .init(name: "game", value: String(game.id)),
            .init(name: "mode", value: mode.rawValue), .init(name: "view", value: "research"),
            .init(name: "player", value: String(player.id)), .init(name: "panel", value: panel.rawValue),
            .init(name: "market", value: market), .init(name: "side", value: side.rawValue.lowercased()),
            .init(name: "book", value: sportsbook.isEmpty ? "all" : sportsbook)]
        if let line {
            query += [.init(name: "line", value: String(line.line)), .init(name: "type", value: line.contract.rawValue)]
        }
        if panel == .tracking, let metric = trackingMetric ?? linkedMetric {
            query.append(.init(name: "metric", value: metric))
        }
        components.queryItems = query
        return components.url
    }

    private var marketSelection: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 8) { marketControls }
            VStack(alignment: .leading, spacing: 4) { marketControls }
        }
    }

    @ViewBuilder private var marketControls: some View {
        if !books.isEmpty || !sportsbook.isEmpty {
            let choices = Set(books + (sportsbook.isEmpty ? [] : [sportsbook])).sorted()
            ResearchArtworkPicker(title: "Sportsbook", options: choices.map(ResearchArtworkPicker.Option.sportsbook),
                selection: Binding(get: { sportsbook }, set: { sportsbook = $0; line = nil; selectMarket() }))
        }
        ResearchToolFilter(title: "Market", symbol: "ticket", selection: marketName(market)) { marketPicker }
    }

    private var marketPicker: some View {
        let choices = Set(markets + (market.isEmpty ? [] : [market])).sorted()
        return Picker("Market", selection: Binding(get: { market }, set: { market = $0; line = nil })) {
            ForEach(choices, id: \.self) {
                Label(marketName($0), systemImage: CourtPlayerMarket(rawValue: $0)?.symbol ?? "ticket").tag($0)
            }
        }
    }

    private func marketName(_ key: String) -> String {
        CourtPlayerMarket(rawValue: key)?.label ?? key.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private var playerHeader: some View {
        let team = player.team
        let palette = CourtTeamColors.colors(for: team.abbreviation)
        return ResearchToolCard(color: palette.primary) {
            ResearchToolPortrait(name: "\(player.firstName) \(player.lastName)",
                subtitle: [team.fullName, player.position].compactMap { $0 }.joined(separator: " · "),
                portraits: player.headshot.map { [$0] } ?? [], teamLogo: team.logo,
                primary: palette.primary, secondary: palette.secondary)
        } content: {
            if let injury = player.injury, !injury.status.isEmpty {
                Label(injury.status, systemImage: "cross.case").font(.subheadline).foregroundStyle(.secondary)
            }
            if mode == .pregame, frozen {
                Label("Saved pregame research", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var trend: some View {
        if let metric = CourtPlayerMarket(rawValue: market) {
            let history = metric.history(player, game: game, sampleSeason: sampleSeason).filter(venue.accepts)
            let vendor = sportsbook.isEmpty ? nil : sportsbook
            let contracts = Set(metric.offers(player, gameID: game.id, side: side).filter { vendor == nil || vendor == $0.vendor }
                .map { CourtLinkContext.Quote(line: $0.line, contract: $0.milestone ? .milestone : .standard) }
                + (line.map { [$0] } ?? [])).sorted { ($0.line, $0.contract.rawValue) < ($1.line, $1.contract.rawValue) }
            let reference = metric.reference(player, gameID: game.id, vendor: vendor, side: side,
                contract: line?.contract, target: line?.line)
            let samples = [3, 5, 10, 20].map { length in reference.map { metric.rate(history.prefix(length), against: $0, side: side) } }
            let chartGames: [ResearchGameChart.Game] = history.prefix(window).reversed().compactMap { log in
                guard let value = metric.statistic(log) else { return nil }
                let label = SlateDate.fromKey(String(log.game.date.prefix(10))).map {
                    SlateDate.label($0)
                } ?? log.game.date
                return .init(id: String(log.id), label: label, value: value,
                    result: .init(value: value, line: reference?.line, under: side == .under, milestone: reference?.milestone == true))
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if let reference {
                        Text(metric.target(reference, side: side)).font(.headline).monospacedDigit()
                        Spacer()
                        ResearchToolBook(book: reference.vendor, price: reference.odds)
                    } else {
                        Text(metric.label).font(.headline)
                    }
                }
                if let line, reference == nil {
                    Label("Recorded price for \(lineLabel(line)) is unavailable.", systemImage: "clock.badge.questionmark")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let results {
                    CourtResultLine(results: results, playerID: player.id, market: metric, quote: reference, side: side)
                }
                ResearchToolRail(title: "Side", choices: CourtPlayerMarket.Side.allCases,
                    selection: Binding(get: { side }, set: { side = $0; line = nil }), label: \.rawValue) {
                    $0 == .over ? "arrow.up" : "arrow.down"
                }
                if !contracts.isEmpty {
                    Picker("Line", selection: $line) {
                        Text("Reference line").tag(nil as String?)
                        ForEach(contracts, id: \.self) { Text(lineLabel($0)).tag(Optional($0)) }
                    }
                }
                Picker("Venue", selection: Binding(get: { venue }, set: { chosenVenue = $0 })) {
                    ForEach(CourtPlayerMarket.Venue.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                ResearchSampleBars(labels: ["L3", "L5", "L10", "L20"], rates: samples.map { $0?.percent },
                    counts: samples.map { sample in
                        sample.map { "\($0.wins)/\($0.decisions)" + ($0.pushes > 0 ? " · \($0.pushes)P" : "") }
                    })
                Picker("Games shown", selection: $window) {
                    ForEach([3, 5, 10, 20], id: \.self) { Text("L\($0)").tag($0) }
                }
                .pickerStyle(.segmented)
                ResearchGameChart(games: chartGames, line: reference?.line, metric: metric.label)
                if let reference, let researchScope, case .member(let account, let userID) = researchScope,
                   mode == .pregame, !frozen, let tip, tip > .now {
                    let selection = TrackedPickAPI.Leg.court(game: game, playerID: player.id,
                        name: "\(player.firstName) \(player.lastName)", team: player.team, headshot: player.headshot,
                        position: player.position, market: metric.rawValue, label: metric.label, line: reference.line,
                        side: reference.milestone ? .milestone : side == .under ? .under : .over, book: reference.vendor, odds: reference.odds)
                    CourtMarketActions(account: account, userID: userID, game: game, selection: selection)
                }
            }
        } else {
            Text("Choose a market to view recent form.").foregroundStyle(.secondary)
        }
    }

    private func selectMarket() {
        if !markets.contains(market) {
            market = markets.contains("points") ? "points" : (markets.first ?? "")
        }
    }

    private func lineLabel(_ quote: CourtLinkContext.Quote) -> String {
        quote.contract == .milestone ? "\(quote.line.formatted())+" :
            "\(side == .over ? "O" : "U") \(quote.line.formatted())"
    }

    private func stat(_ label: String, _ value: Double?) -> some View {
        LabeledContent(label, value: value?.formatted(.number.precision(.fractionLength(0...2))) ?? "Unavailable")
    }

    private func offerRow(_ offer: CourtBoard.Prop) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(offer.lineValue.isEmpty ? "Line unavailable" : offer.lineValue).font(.headline)
            if offer.market.type == "milestone" {
                LabeledContent("Milestone", value: price(offer.market.odds))
            } else if offer.market.type == "over_under" {
                LabeledContent("Over", value: price(offer.market.overOdds))
                LabeledContent("Under", value: price(offer.market.underOdds))
            }
            if let observed = SidelineBoard.timestamp(offer.updatedAt) {
                Text(observed.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let results, let metric = CourtPlayerMarket(rawValue: offer.propType), let line = Double(offer.lineValue) {
                let milestone = offer.market.type == "milestone"
                let odds = milestone ? (side == .over ? offer.market.odds : nil) : (side == .under ? offer.market.underOdds : offer.market.overOdds)
                let quote = odds.map { CourtPlayerMarket.Reference(line: line, vendor: offer.vendor, odds: $0, milestone: milestone) }
                CourtResultLine(results: results, playerID: player.id, market: metric, quote: quote, side: side)
            }
        }
    }

    private func price(_ price: Int?) -> String {
        guard let price else { return "Unavailable" }
        return price > 0 ? "+\(price)" : String(price)
    }
}
