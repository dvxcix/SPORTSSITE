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

    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var sportsbook = ""
    @State private var market = ""
    @State private var expired = false
    @State private var side = CourtPlayerMarket.Side.over
    @State private var window = 10
    @State private var line: String?

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
        return listed.isEmpty ? ["points", "rebounds", "assists"] : listed.sorted()
    }

    var body: some View {
        List {
            playerHeader
                .listRowInsets(.init(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
            if expired || (expiry.map { $0 <= .now } ?? false) {
                Text(mode == .live ? "Return to The Court for a fresh live observation." : "Return to The Court to load the saved pregame snapshot.")
                    .listRowBackground(Brand.surface(for: scheme))
            } else {
                Section("Recent form") {
                    trend
                }
                .listRowBackground(Brand.surface(for: scheme))
                if let average = player.average {
                    Section("Recorded averages") {
                        stat("Points", average["pts"] ?? nil)
                        stat("Rebounds", average["reb"] ?? nil)
                        stat("Assists", average["ast"] ?? nil)
                    }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                Section(mode == .live ? (game.isFinal ? "Saved live odds" : "Live odds") : "Pregame odds") {
                    if books.isEmpty {
                        Text("No recorded offers for this player.")
                    } else {
                        ResearchArtworkPicker(title: "Sportsbook", options: books.map(ResearchArtworkPicker.Option.sportsbook), selection: $sportsbook)
                        Picker("Market", selection: $market) {
                            ForEach(markets, id: \.self) {
                                Text(CourtPlayerMarket(rawValue: $0)?.label ?? $0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0)
                            }
                        }
                        ForEach(offers.filter { $0.vendor == sportsbook && $0.propType == market }) { offer in
                            offerRow(offer)
                        }
                    }
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .navigationTitle("\(player.firstName) \(player.lastName)")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .onAppear {
            if sportsbook.isEmpty {
                let fallback = books.contains("fanduel") ? "fanduel" : (books.first ?? "")
                sportsbook = initialBook.flatMap { books.contains($0) ? $0 : nil } ?? fallback
                if let initialMarket { market = initialMarket }
                side = initialSide
                selectMarket()
            }
        }
        .onChange(of: sportsbook) { _, _ in selectMarket() }
        .onChange(of: market) { _, _ in line = nil }
        .onChange(of: side) { _, _ in line = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { expired = expiry.map { $0 <= .now } ?? false }
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
            let history = metric.history(player, game: game, sampleSeason: sampleSeason)
            let prices = offers.filter { $0.vendor == sportsbook && $0.propType == market }.compactMap { offer in
                let isMilestone = offer.market.type == "milestone"
                let price = isMilestone ? (side == .over ? offer.market.odds : nil)
                    : side == .over ? offer.market.overOdds : offer.market.underOdds
                guard let value = Double(offer.lineValue), let price else { return nil as CourtPlayerMarket.Reference? }
                return .init(line: value, vendor: offer.vendor, odds: price, milestone: isMilestone)
            }
            let contracts = prices.sorted { $0.line == $1.line ? $0.odds > $1.odds : $0.line < $1.line }
            let reference = line.flatMap { key in contracts.first { metric.target($0, side: side) == key } }
                ?? metric.reference(player, gameID: game.id, vendor: sportsbook.isEmpty ? nil : sportsbook, side: side)
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
                ResearchToolRail(title: "Side", choices: CourtPlayerMarket.Side.allCases, selection: $side, label: \.rawValue) {
                    $0 == .over ? "arrow.up" : "arrow.down"
                }
                if !contracts.isEmpty {
                    Picker("Line", selection: $line) {
                        Text("Reference line").tag(nil as String?)
                        ForEach(Set(contracts.map { metric.target($0, side: side) }).sorted(), id: \.self) { Text($0).tag(Optional($0)) }
                    }
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
        }
    }

    private func price(_ price: Int?) -> String {
        guard let price else { return "Unavailable" }
        return price > 0 ? "+\(price)" : String(price)
    }
}
