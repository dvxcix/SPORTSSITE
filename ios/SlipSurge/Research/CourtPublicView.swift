import SwiftUI

struct CourtPublicView: View {
    private struct Captures: Decodable {
        struct Entry: Decodable { let snapshot: Snapshot }
        let captures: [Entry]
        let mode: CourtResearchMode
    }

    private struct Snapshot: Decodable {
        struct Row: Decodable, Identifiable {
            let playerId: Int
            let market: String
            let picks: Int
            let capturedAt: String?
            let previous: Int?
            let hasOwnPrevious: Bool
            var id: String { "\(playerId):\(market)" }

            private enum CodingKeys: String, CodingKey { case playerId, market, picks, capturedAt, previous }

            init(from decoder: Decoder) throws {
                let value = try decoder.container(keyedBy: CodingKeys.self)
                playerId = try value.decode(Int.self, forKey: .playerId)
                market = try value.decode(String.self, forKey: .market)
                picks = try value.decode(Int.self, forKey: .picks)
                capturedAt = try value.decodeIfPresent(String.self, forKey: .capturedAt)
                previous = try value.decodeIfPresent(Int.self, forKey: .previous)
                hasOwnPrevious = value.contains(.previous)
            }
        }

        let gameId: Int
        let capturedAt: String
        let rows: [Row]
    }

    private struct Results: Decodable {
        struct Player: Decodable {
            let id: Int
            let played: Bool?
            let values: [String: Double?]
        }

        let status: String
        let complete: Bool
        let players: [Player]
    }

    private enum Sort: String, CaseIterable { case picks = "Most picks", share = "Highest share", movement = "Largest change", name = "Player A–Z" }

    let scope: CourtView.Scope
    let board: CourtBoard
    let observedAt: Date
    let revision: Int
    @Environment(\.colorScheme) private var scheme
    @State private var captures: Captures?
    @State private var results: Results?
    @State private var error: (any Error)?
    @State private var market = ""
    @State private var search = ""
    @State private var sort = Sort.picks
    @State private var retry = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let captures {
                if let snapshot = captures.captures.first?.snapshot {
                    cards(snapshot, prior: captures.captures.dropFirst().first?.snapshot)
                } else {
                    ContentUnavailableView("No public activity recorded", systemImage: "person.2")
                }
            } else {
                ResearchToolMessage(title: "Public activity couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: "\(revision):\(retry)") {
            await load()
            while !Task.isCancelled && (board.oddsMode == .live && !board.game.isFinal || (board.tip.map { $0 > .now } ?? false)) {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                await load()
            }
        }
    }

    @ViewBuilder
    private func cards(_ snapshot: Snapshot, prior: Snapshot?) -> some View {
        let markets = Set(snapshot.rows.map(\.market)).sorted()
        let roster = Dictionary(board.players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let counts = Dictionary(grouping: snapshot.rows, by: \.market).mapValues { $0.reduce(0) { $0 + max(0, min($1.picks, 10_000_000)) } }
        let previous = Dictionary((prior?.rows ?? []).map { ($0.id, $0.picks) }, uniquingKeysWith: { first, _ in first })
        let rows = snapshot.rows.filter { row in
            guard let player = roster[row.playerId] else { return false }
            return (market.isEmpty || row.market == market) && (search.isEmpty || "\(player.firstName) \(player.lastName)".localizedCaseInsensitiveContains(search))
        }.sorted { a, b in
            if sort == .name { return (roster[a.playerId]?.lastName ?? "") < (roster[b.playerId]?.lastName ?? "") }
            return order(a, totals: counts, previous: previous) > order(b, totals: counts, previous: previous)
        }
        HStack {
            ResearchToolFilter(title: "Market", selection: market.isEmpty ? "All markets" : label(market)) {
                Picker("Market", selection: $market) {
                    Text("All markets").tag("")
                    ForEach(markets, id: \.self) { Text(label($0)).tag($0) }
                }
            }
            Spacer()
            ResearchToolFilter(title: "Sort", selection: sort.rawValue) {
                Picker("Sort", selection: $sort) {
                    ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
            }
        }
        TextField("Find a player", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        if let results, !results.complete {
            Text("Game results are incomplete.").font(.caption).foregroundStyle(.secondary)
        }
        if rows.isEmpty {
            ContentUnavailableView("No activity matches these filters", systemImage: "person.2")
        }
        LazyVStack(spacing: 9) {
            ForEach(rows) { row in
                if let player = roster[row.playerId] {
                    let colors = CourtTeamColors.colors(for: player.team.abbreviation)
                    let movement = difference(row, previous: previous)
                    let observed = SidelineBoard.timestamp(row.capturedAt ?? snapshot.capturedAt)
                    ResearchToolCard(color: colors.primary) {
                        NavigationLink {
                            CourtPlayerView(player: player, game: board.game, mode: board.oddsMode, frozen: board.isFrozen,
                                tip: board.tip, observedAt: observedAt, sampleSeason: board.sampleSeason, initialMarket: row.market)
                        } label: {
                            CourtPlayerIdentity(player: player)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                    } content: {
                        Text(label(row.market)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                        ResearchToolValues(items: [
                            .init(label: "Picks", text: row.picks.formatted(), tone: Brand.accent(for: scheme)),
                            .init(label: "Market share", text: share(row.picks, total: counts[row.market]).map {
                                $0.formatted(.percent.precision(.fractionLength(1)))
                            } ?? "—"),
                            .init(label: "Change", text: ResearchFormat.signed(movement),
                                tone: Brand.signal(movement.map(Double.init), for: scheme)),
                        ])
                        HStack {
                            if let observed { Text(observed.formatted(date: .abbreviated, time: .shortened)) }
                            Spacer()
                            if let stat = results?.players.first(where: { $0.id == row.playerId }), stat.played == true,
                               let actual = stat.values[row.market] ?? nil {
                                Text("\(results?.status == "final" ? "Final" : "Game") \(ResearchFormat.decimal(actual))")
                            }
                        }.font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func share(_ picks: Int, total: Int?) -> Double? {
        guard let total, total > 0 else { return nil }
        return Double(picks) / Double(total)
    }

    private func difference(_ row: Snapshot.Row, previous: [String: Int]) -> Int? {
        (row.hasOwnPrevious ? row.previous : previous[row.id]).flatMap {
            guard (0...10_000_000).contains($0), (0...10_000_000).contains(row.picks) else { return nil }
            return row.picks - $0
        }
    }

    private func order(_ row: Snapshot.Row, totals: [String: Int], previous: [String: Int]) -> Double {
        switch sort {
        case .picks, .name: Double(row.picks)
        case .share: share(row.picks, total: totals[row.market]) ?? -.infinity
        case .movement: difference(row, previous: previous).map(Double.init) ?? -.infinity
        }
    }

    private func label(_ market: String) -> String {
        CourtPlayerMarket(rawValue: market)?.label ?? market.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func load() async {
        let api = CourtToolAPI(scope: scope)
        let query = [URLQueryItem(name: "game", value: String(board.game.id)), .init(name: "mode", value: board.oddsMode.rawValue)]
        do {
            let data = try await api.read(Captures.self, tool: "public", publicPath: "/the-paint/public", query: query)
            guard !Task.isCancelled else { return }
            guard data.mode == board.oddsMode, data.captures.allSatisfy({ $0.snapshot.gameId == board.game.id }) else {
                throw URLError(.cannotParseResponse)
            }
            captures = data
            if board.oddsMode == .live, board.game.isInProgress || board.game.isFinal {
                let current = try? await api.read(Results.self, tool: "results", publicPath: "/the-paint/results", query: query)
                if !Task.isCancelled { results = current }
            }
        } catch {
            if !Task.isCancelled { captures = nil; self.error = error }
        }
    }
}
