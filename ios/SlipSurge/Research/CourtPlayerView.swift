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

    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var sportsbook = ""
    @State private var market = ""
    @State private var expired = false

    private var expiry: Date? {
        if mode == .live { return game.isFinal ? nil : observedAt.addingTimeInterval(30) }
        return frozen ? nil : (tip ?? .distantPast)
    }

    private var offers: [CourtBoard.Prop] {
        player.props.filter { $0.gameId == game.id && $0.playerId == player.id }
    }

    private var books: [String] { Set(offers.map(\.vendor)).sorted() }
    private var markets: [String] {
        Set(offers.filter { $0.vendor == sportsbook }.map(\.propType)).sorted()
    }

    var body: some View {
        List {
            CourtPlayerIdentity(player: player)
                .listRowBackground(Brand.surface(for: scheme))
            if expired || (expiry.map { $0 <= .now } ?? false) {
                Text(mode == .live ? "Return to The Court for a fresh live observation." : "Return to The Court to load the saved pregame snapshot.")
                    .listRowBackground(Brand.surface(for: scheme))
            } else {
                if let average = player.average {
                    Section("Recorded averages") {
                        stat("Points", average.pts)
                        stat("Rebounds", average.reb)
                        stat("Assists", average.ast)
                    }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                Section(mode == .live ? (game.isFinal ? "Saved live odds" : "Live odds") : "Pregame odds") {
                    if books.isEmpty {
                        Text("No recorded offers for this player.")
                    } else {
                        SportsbookPicker(books: books, selection: $sportsbook)
                        Picker("Market", selection: $market) {
                            ForEach(markets, id: \.self) {
                                Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0)
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
        .navigationTitle("Player research")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .onAppear {
            if sportsbook.isEmpty {
                sportsbook = books.contains("fanduel") ? "fanduel" : (books.first ?? "")
                selectMarket()
            }
        }
        .onChange(of: sportsbook) { _, _ in selectMarket() }
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
