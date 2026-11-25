import SwiftUI

struct PickBuilderView: View {
    let api: TrackedPickAPI
    let existing: [TrackedPickAPI.Leg]
    let preferredSport: String
    let onAdd: (TrackedPickAPI.Leg) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var selectedSport: String?
    @State private var date: Date?
    @State private var showDate = false
    @State private var slate: TrackedPickAPI.Slate?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var gameID = ""
    @State private var playerID = ""
    @State private var marketID = ""
    @State private var side = TrackedPickAPI.Offer.Side.over
    @State private var book = ""
    @State private var watchlistID = UUID()
    @State private var lastSaved: String?
    @State private var saving = false
    @State private var notice: String?

    private struct Request: Hashable { let sport: String; let date: Date?; let revision: Int }
    private var sport: String { existing.first?.sport ?? selectedSport ?? (preferredSport == "NBA" ? "NBA" : "NFL") }
    private var request: Request { .init(sport: sport, date: date, revision: revision) }
    private var game: TrackedPickAPI.Game? { slate?.games.first { $0.id == gameID } }
    private var player: TrackedPickAPI.Player? { game?.players.first { $0.id == playerID } }
    private var market: TrackedPickAPI.Market? { player?.markets.first { $0.id == marketID } }
    private var sides: [TrackedPickAPI.Offer.Side] {
        TrackedPickAPI.Offer.Side.allCases.filter { side in
            market?.offers.contains { offer in offer.side == side && (existing.first == nil || existing.first?.book == offer.vendor) } == true
        }
    }
    private var offers: [TrackedPickAPI.Offer] {
        (market?.offers ?? []).filter { $0.side == side && (existing.first == nil || existing.first?.book == $0.vendor) }
    }
    private var activeLeg: TrackedPickAPI.Leg? {
        guard let game, let player, let market, let offer = offers.first(where: { $0.vendor == book }) else { return nil }
        let leg = TrackedPickAPI.Leg(sport: sport, game: game, player: player, market: market, offer: offer)
        return existing.contains(where: { $0.id == leg.id }) ? nil : leg
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        ResearchArtworkPicker(title: "League", options: ["NFL", "NBA"].map {
                            .init(id: $0, title: $0, url: LeagueArtwork.logo($0), icon: "sportscourt")
                        }, selection: Binding(get: { sport }, set: { selectedSport = $0 }))
                            .disabled(!existing.isEmpty)
                        Button(dateLabel, systemImage: "calendar") { showDate = true }
                            .buttonStyle(.bordered).controlSize(.large)
                    }
                    if let slate {
                        slateContents(slate)
                    } else if let response = error as? SlipSurgeHTTP.Status, response.code == 403 {
                        ContentUnavailableView("Membership required", systemImage: "lock", description: Text("The Court is available with Ultimate access."))
                    } else {
                        ResearchToolMessage(title: "Pick markets couldn’t load", error: error) { revision += 1 }
                    }
                    if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                }
                .padding(16)
            }
            .navigationTitle("Add a pick")
            .navigationBarTitleDisplayMode(.inline)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
            }
            .sheet(isPresented: $showDate) {
                DatePicker("Slate date", selection: Binding(get: { date ?? slate.flatMap { SlateDate.fromKey($0.date) } ?? .now },
                    set: { date = $0; showDate = false }), displayedComponents: .date)
                    .datePickerStyle(.graphical).environment(\.timeZone, SlateDate.zone)
                    .padding(16).presentationDetents([.medium])
            }
            .task(id: request) { await load(request) }
            .refreshable { await load(request) }
            .onChange(of: gameID) { _, _ in playerID = ""; marketID = "" }
            .onChange(of: playerID) { _, _ in marketID = "" }
            .onChange(of: marketID) { _, _ in
                side = sides.contains(.over) ? .over : (sides.first ?? .milestone)
                book = offers.first?.vendor ?? ""
            }
            .onChange(of: side) { _, _ in book = offers.first?.vendor ?? "" }
            .onChange(of: activeLeg?.id) { _, _ in watchlistID = UUID(); notice = nil }
        }
    }

    private var dateLabel: String {
        (date ?? slate.flatMap { SlateDate.fromKey($0.date) }).map { SlateDate.label($0) } ?? "Slate date"
    }

    @ViewBuilder
    private func slateContents(_ slate: TrackedPickAPI.Slate) -> some View {
        let games = slate.games.filter { !$0.players.isEmpty }
        if games.isEmpty {
            ContentUnavailableView("No open markets on this slate", systemImage: "sportscourt",
                description: Text("Choose a date with a pregame matchup and sportsbook prices."))
        } else {
            ResearchArtworkPicker(title: "Matchup", options: games.map { .init(id: $0.id, title: "\($0.awayAbbr) at \($0.homeAbbr)",
                url: $0.awayLogo, secondaryLogo: $0.homeLogo, icon: "shield") }, selection: $gameID)
            if let game {
                let players = game.players.filter { player in
                    existing.first.map { leg in player.markets.contains { market in market.offers.contains { $0.vendor == leg.book } } } ?? true
                }
                ResearchArtworkPicker(title: "Player", options: players.map(playerOption), selection: $playerID)
            }
            if let player {
                let options = player.markets.filter { market in existing.first.map { leg in market.offers.contains { $0.vendor == leg.book } } ?? true }
                ResearchArtworkPicker(title: "Market", options: options.map { option in
                    .init(id: option.id, title: option.line.map { "\(option.label) · \($0.formatted())" } ?? option.label, icon: "chart.bar")
                }, selection: $marketID)
            }
            if market != nil {
                if sides.count > 1 {
                    Picker("Line side", selection: $side) {
                        ForEach(sides, id: \.self) { Text($0.label).tag($0) }
                    }.pickerStyle(.segmented)
                }
                ResearchArtworkPicker(title: "Sportsbook", options: Set(offers.map(\.vendor)).sorted().map { vendor in
                    let normalized = Sportsbook.normalized(vendor)
                    let price = offers.first { $0.vendor == vendor }?.odds
                    return .init(id: vendor, title: "\(Sportsbook.name(normalized)) · \(ResearchFormat.price(price))",
                        asset: Sportsbook.artwork(normalized), icon: "chart.bar")
                }, selection: $book)
            }
            if let activeLeg {
                VStack(alignment: .leading, spacing: 9) {
                    Button("Add \(activeLeg.player_name) pick", systemImage: "plus.circle.fill") {
                        onAdd(activeLeg)
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    Button(lastSaved == activeLeg.id ? "Saved to Watchlist" : "Save to Watchlist", systemImage: lastSaved == activeLeg.id ? "star.fill" : "star") {
                        Task { await watch(activeLeg) }
                    }
                    .buttonStyle(.bordered).disabled(saving || lastSaved == activeLeg.id)
                }
            }
        }
    }

    private func playerOption(_ player: TrackedPickAPI.Player) -> ResearchArtworkPicker.Option {
        let url = player.headshotUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
        let colors = (player.colors ?? []).compactMap { Color(hex: $0) }
        return .init(id: player.id, title: [player.name, player.team, player.position].compactMap { $0 }.joined(separator: " · "),
            url: url ?? player.teamLogo, playerTeamLogo: url == nil ? nil : player.teamLogo, playerColors: colors, icon: "person.fill")
    }

    private func load(_ selection: Request) async {
        slate = nil
        error = nil
        gameID = ""
        playerID = ""
        marketID = ""
        do {
            let value = try await api.games(sport: selection.sport, date: selection.date)
            if !Task.isCancelled, request == selection { slate = value }
        } catch {
            if !Task.isCancelled, request == selection { self.error = error }
        }
    }

    private func watch(_ leg: TrackedPickAPI.Leg) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        let id = watchlistID
        do {
            let library = ResearchLibraryAPI(account: api.account, userID: api.userID)
            try await library.mutate(.init(kind: "watchlist-save", id: id.uuidString.lowercased(), market: leg))
            lastSaved = leg.id
        } catch let response as SlipSurgeHTTP.Status where (400...429).contains(response.code) {
            struct Failure: Decodable { let error: String? }
            notice = (try? JSONDecoder().decode(Failure.self, from: response.data))?.error ?? "The market couldn’t be saved."
        } catch { notice = "The market couldn’t be confirmed. Retry to keep from saving it twice." }
    }
}
