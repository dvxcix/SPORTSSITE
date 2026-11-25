import SwiftUI

struct CourtMarketActions: View {
    let account: AccountStore
    let userID: UUID
    let game: CourtBoard.Game
    let selection: TrackedPickAPI.Leg
    @State private var result: [ResearchLibraryAPI.CourtSelection]?
    @State private var draft: TrackedPickAPI.Leg?
    @State private var requestIDs: [String: UUID] = [:]
    @State private var busy = false
    @State private var blocked: String?

    private var api: ResearchLibraryAPI { .init(account: account, userID: userID) }
    private var target: String {
        (selection.numeric_line ?? 0).formatted(.number.locale(Locale(identifier: "en_US_POSIX")).grouping(.never)
            .precision(.fractionLength(0...8)))
    }
    private var propKey: String {
        let player = selection.player_id.split(separator: ":").last.map(String.init) ?? selection.player_id
        let contract = selection.market_side == "milestone" ? "milestone" : "over_under"
        return "nba:\(player):\(selection.prop_key):\(contract):\(target):\(selection.market_side)"
    }
    private var existing: ResearchLibraryAPI.CourtSelection? {
        result?.first { $0.propKey == propKey && $0.book == selection.book }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 7) { actions }
                VStack(alignment: .leading, spacing: 6) { actions }
            }
            if let blocked {
                Label(blocked, systemImage: "info.circle").font(.caption).foregroundStyle(.secondary)
            }
        }
        .task(id: game.id) { await refresh() }
        .sheet(item: $draft) { leg in
            FeedComposerView(account: account, userID: userID, allowMLB: false, startWithPick: true, initialPick: leg) {}
        }
    }

    @ViewBuilder private var actions: some View {
        if result != nil {
            Button(existing == nil ? "Save to Watchlist" : "Remove from Watchlist",
                systemImage: existing == nil ? "star" : "star.fill") {
                    Task { await toggleSaved() }
                }
                .buttonStyle(.bordered).disabled(busy)
        } else if blocked != nil {
            Button("Retry Watchlist", systemImage: "arrow.clockwise") { Task { await refresh() } }.buttonStyle(.bordered)
        }
        Button("Compose pick", systemImage: "square.and.pencil") { draft = selection }.buttonStyle(.bordered)
    }

    private func refresh() async {
        do {
            let items = try await api.courtSelections(game: game.id)
            if !Task.isCancelled { result = items; blocked = nil }
        } catch {
            if !Task.isCancelled { blocked = "Watchlist couldn’t load." }
        }
    }

    private func toggleSaved() async {
        guard !busy, let tip = game.datetime.flatMap(SidelineBoard.timestamp), tip > .now else { return }
        busy = true
        blocked = nil
        defer { busy = false }
        do {
            if let existing {
                try await api.mutate(.init(kind: "watchlist-delete", id: existing.id.uuidString.lowercased()))
                result?.removeAll { $0.id == existing.id }
            } else {
                let key = "\(propKey):\(selection.book)"
                let id = requestIDs[key] ?? UUID()
                requestIDs[key] = id
                try await api.mutate(.init(kind: "watchlist-save", id: id.uuidString.lowercased(), market: selection))
                await refresh()
            }
        } catch {
            if !Task.isCancelled { blocked = "The Watchlist change couldn’t be confirmed. Refresh the price and try again." }
        }
    }
}

extension TrackedPickAPI.Leg {
    static func court(game: CourtBoard.Game, playerID: Int, name: String, team: CourtBoard.Team, headshot: URL?,
        position: String?, market key: String, label: String, line: Double, side: TrackedPickAPI.Offer.Side,
        book: String, odds: Int) -> Self {
        let matchup = TrackedPickAPI.Game(gameKey: String(game.id), gamePk: String(game.id), gameDate: game.date,
            gameTime: game.datetime, awayAbbr: game.visitorTeam.abbreviation, homeAbbr: game.homeTeam.abbreviation,
            awayTeam: game.visitorTeam.fullName, homeTeam: game.homeTeam.fullName,
            awayLogo: game.visitorTeam.logo, homeLogo: game.homeTeam.logo, status: game.status, players: [])
        let player = TrackedPickAPI.Player(playerId: "bdl:\(playerID)", mlbId: nil, name: name,
            team: team.abbreviation, position: position, headshotUrl: headshot, teamLogo: team.logo, colors: nil, markets: [])
        let market = TrackedPickAPI.Market(key: side == .milestone ? key + ":milestone" : key,
            propType: key, label: label, line: line, offers: [])
        let offer = TrackedPickAPI.Offer(vendor: book, side: side, odds: odds)
        return Self(sport: "NBA", game: matchup, player: player, market: market, offer: offer)
    }
}
