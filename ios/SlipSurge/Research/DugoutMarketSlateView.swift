import SwiftUI

struct DugoutMarketSlateView: View {
    enum Mode {
        case publicPicks, cost
        var title: String { self == .cost ? "Batter Cost" : "The Public" }
    }

    private struct Market: Identifiable {
        let id: String
        let title: String
        var crowd: String? = nil
        var outcome: String? = nil
        var rungs: [(String, Int)] = []
    }

    private struct Row: Identifiable {
        let game: DugoutBoard.Game
        let batter: DugoutBoard.Batter
        let market: Market
        let quotes: [DugoutBoard.Market.Quote]
        var id: String { "\(game.id):\(batter.id)" }
        var crowd: DugoutBoard.Batter.Crowd? { market.crowd.flatMap { batter.crowd?[$0] } }
        var fanDuel: DugoutBoard.Market.Quote? { quotes.first { Sportsbook.normalized($0.book) == "fanduel" } }
        var delta: Int? {
            guard let current = fanDuel?.price, let opening = fanDuel?.opening else { return nil }
            return current - opening
        }
    }

    private enum Sort: String, CaseIterable {
        case popularity = "Most picks", increase = "Biggest increase", decrease = "Biggest decrease"
        case seasonHR = "HR vs season", seasonFirst = "FHR vs season", shorten = "Shortened most", drift = "Drifted most"
    }

    private enum Movement: String, CaseIterable {
        case all = "Any movement", shorter = "Shortened", longer = "Drifted", flat = "Unchanged"

        func matches(_ delta: Int?) -> Bool {
            switch self {
            case .all: true
            case .shorter: (delta ?? 0) < 0
            case .longer: (delta ?? 0) > 0
            case .flat: delta == 0
            }
        }
    }

    private static let publicMarkets: [Market] = [
        .init(id: "sa", title: "Home Run", crowd: "home_runs", outcome: "hr"),
        .init(id: "hits", title: "To Record a Hit", crowd: "hits", outcome: "h"),
        .init(id: "singles", title: "Singles", crowd: "singles", outcome: "singles"),
        .init(id: "doubles", title: "Doubles", crowd: "doubles", outcome: "doubles"),
        .init(id: "triples", title: "Triples", crowd: "triples", outcome: "triples"),
        .init(id: "stolen_bases", title: "Stolen Base", crowd: "stolen_bases", outcome: "sb"),
        .init(id: "tb", title: "Total Bases", crowd: "bases", outcome: "tb", rungs: [("tb", 2), ("tb3", 3), ("tb4", 4), ("tb5", 5)]),
        .init(id: "rbi", title: "RBI", crowd: "rbi", outcome: "rbi", rungs: [("rbi", 1), ("rbi2", 2), ("rbi3", 3)]),
        .init(id: "hrr", title: "Hits + Runs + RBI", crowd: "hits_runs_rbi", outcome: "hrr"),
    ]
    private static let extraCostMarkets: [Market] = [
        .init(id: "fhr", title: "First Home Run"), .init(id: "hr2", title: "2+ Home Runs"), .init(id: "hits2", title: "2+ Hits"),
        .init(id: "rbi2", title: "2+ RBI"), .init(id: "rbi3", title: "3+ RBI"), .init(id: "tb3", title: "3+ Total Bases"),
        .init(id: "tb4", title: "4+ Total Bases"), .init(id: "tb5", title: "5+ Total Bases"), .init(id: "runs", title: "1+ Runs"),
        .init(id: "runs2", title: "2+ Runs"), .init(id: "stolen_bases2", title: "2+ Stolen Bases"),
    ]

    let api: DugoutAPI
    @State var date: Date
    let mode: Mode
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var slate: DugoutBoard?
    @State private var game = ""
    @State private var market = "sa"
    @State private var sort: Sort?
    @State private var movement = Movement.all
    @State private var powerOnly = false
    @State private var search = ""
    @State private var revision = 0
    @State private var failure: (any Error)?
    @State private var selection: Row?

    private var markets: [Market] { Self.publicMarkets + (mode == .cost ? Self.extraCostMarkets : []) }
    private var sortMode: Sort { sort ?? (mode == .cost ? .seasonHR : .popularity) }

    var body: some View {
        let key = SlateDate.key(date)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ResearchSlateControls(date: $date)
                if let slate, slate.date == key {
                    if mode == .cost ? slate.batterCostAccess == true : slate.publicAccess == true {
                        table(slate)
                    } else {
                        ContentUnavailableView(mode == .cost ? "Ultimate access required" : "Advanced access required", systemImage: "lock")
                        NavigationLink {
                            NativeMembershipOverview(account: api.account)
                        } label: { Text("Compare memberships") }
                        .buttonStyle(.bordered)
                    }
                } else {
                    ResearchToolMessage(title: "\(mode.title) couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(key):\(revision)") {
            await load(key)
            while !Task.isCancelled, key == SlateDate.key(.now), let slate, slate.games.contains(where: { $0.status == "Live" || $0.status == "Preview" }) {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                if scenePhase == .active { await load(key) }
            }
        }
        .refreshable { await load(key) }
        .onChange(of: key) { game = ""; failure = nil }
        .sheet(item: $selection) { row in
            NavigationStack { DugoutPlayerView(player: row.batter, game: row.game, window: .l5) }
                .presentationDragIndicator(.visible)
        }
    }

    private func table(_ slate: DugoutBoard) -> some View {
        let games = game.isEmpty ? slate.games : slate.games.filter { String($0.id) == game }
        let selectedMarket = markets.first { $0.id == market } ?? markets[0]
        let filtered = rows(games, market: selectedMarket)
        return VStack(alignment: .leading, spacing: 10) {
            controls(slate)
            if mode == .publicPicks, games.contains(where: { $0.snapshot.unavailable == true }) {
                Label("Some pregame public picks are unavailable", systemImage: "clock.badge.exclamationmark")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if filtered.isEmpty {
                ContentUnavailableView(slate.games.isEmpty ? "No games on this date" : "No matching \(mode == .cost ? "opening prices" : "public picks")",
                    systemImage: mode == .cost ? "chart.line.uptrend.xyaxis" : "person.2")
            } else {
                ForEach(filtered) { row in
                    card(row)
                }
            }
        }
    }

    private func controls(_ slate: DugoutBoard) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    let counts = Dictionary(grouping: slate.games) { [$0.away.code, $0.home.code] }.mapValues(\.count)
                    ResearchArtworkPicker(title: "Matchups", options: [
                        .init(id: "", title: "All games", url: LeagueArtwork.logo("mlb"), icon: "baseball"),
                    ] + slate.games.map { game in
                        let doubleheader = (counts[[game.away.code, game.home.code]] ?? 0) > 1
                        return .init(id: String(game.id), title: "\(game.away.code) at \(game.home.code)\(doubleheader ? " · Game \(game.number)" : "")",
                            url: game.away.logo, secondaryLogo: game.home.logo, icon: "shield")
                    }, selection: $game)
                    ResearchArtworkPicker(title: "Market", options: markets.map {
                        .init(id: $0.id, title: $0.title, icon: "chart.bar")
                    }, selection: $market)
                }
                .padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ResearchToolFilter(title: "Sort", selection: sortMode.rawValue) {
                        Picker("Sort", selection: Binding(get: { sortMode }, set: { sort = $0 })) {
                            ForEach(mode == .cost ? [Sort.seasonHR, .seasonFirst, .shorten, .drift] : [.popularity, .increase, .decrease], id: \.self) {
                                Text($0.rawValue).tag($0)
                            }
                        }
                    }
                    if mode == .cost {
                        ResearchToolFilter(title: "Price movement", selection: movement.rawValue) {
                            Picker("Price movement", selection: $movement) {
                                ForEach(Movement.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                            }
                        }
                        Toggle("Power Vehicle", isOn: $powerOnly).toggleStyle(.button).buttonStyle(.bordered)
                    }
                }
            }.scrollIndicators(.hidden)
            TextField("Find a batter", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        }
    }

    private func rows(_ games: [DugoutBoard.Game], market: Market) -> [Row] {
        games.flatMap { game in
            game.batters.compactMap { batter -> Row? in
                guard search.isEmpty || batter.name.localizedCaseInsensitiveContains(search) else { return nil }
                let quotes = batter.markets.first { $0.key == market.id }?.quotes ?? []
                let row = Row(game: game, batter: batter, market: market, quotes: quotes)
                if mode == .publicPicks {
                    guard quotes.contains(where: { $0.price != nil }), let crowd = row.crowd,
                          crowd.count > 0 || (crowd.movement?.previous ?? 0) > 0 else { return nil }
                } else {
                    guard row.fanDuel?.opening != nil || batter.cost?.firstHomeRunVsSeason != nil || batter.cost?.homeRunVsSeason != nil,
                          movement.matches(row.delta), !powerOnly || batter.cost?.power == true else { return nil }
                }
                return row
            }
        }.sorted(by: ordered)
    }

    private func ordered(_ first: Row, _ second: Row) -> Bool {
        func rank(_ row: Row) -> Double? {
            switch sortMode {
            case .popularity: row.crowd.map { -Double($0.count) }
            case .increase: row.crowd?.movement?.delta.map { -Double($0) }
            case .decrease: row.crowd?.movement?.delta.map(Double.init)
            case .seasonHR: row.batter.cost?.homeRunVsSeason
            case .seasonFirst: row.batter.cost?.firstHomeRunVsSeason
            case .shorten: row.delta.map(Double.init)
            case .drift: row.delta.map { -Double($0) }
            }
        }
        if let left = rank(first), let right = rank(second), left != right { return left < right }
        if (rank(first) == nil) != (rank(second) == nil) { return rank(first) != nil }
        let leftCount = first.crowd?.count ?? 0, rightCount = second.crowd?.count ?? 0
        if leftCount != rightCount { return leftCount > rightCount }
        if first.batter.name != second.batter.name { return first.batter.name.localizedStandardCompare(second.batter.name) == .orderedAscending }
        return first.id < second.id
    }

    private func card(_ row: Row) -> some View {
        let team = row.game.team(for: row.batter)
        let opponent = team.code == row.game.home.code ? row.game.away : row.game.home
        return ResearchToolCard(color: team.color) {
            Button {
                selection = row
            } label: {
                HStack {
                    ResearchToolPortrait(name: row.batter.name, subtitle: "\(team.code) · vs \(opponent.code)",
                        portraits: [row.batter.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                    Spacer()
                    if mode == .publicPicks { grade(row) }
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
                }
                .contentShape(.rect)
            }
            .buttonStyle(SlipSurgePressStyle())
        } content: {
            if mode == .cost {
                ResearchToolValues(items: [
                    .init(label: "FanDuel open", text: ResearchFormat.price(row.fanDuel?.opening)),
                    .init(label: "FanDuel price", text: ResearchFormat.price(row.fanDuel?.price)),
                    .init(label: "Movement", text: ResearchFormat.signed(row.delta), tone: row.delta.flatMap { tone(-Double($0)) }),
                ])
                if let cost = row.batter.cost {
                    ResearchToolValues(items: [
                        .init(label: "HR vs season", text: ResearchFormat.signedDecimal(cost.homeRunVsSeason.map { $0 * 100 }, suffix: "%"),
                            tone: cost.homeRunVsSeason.flatMap { tone(-$0) }),
                        .init(label: "FHR vs season", text: ResearchFormat.signedDecimal(cost.firstHomeRunVsSeason.map { $0 * 100 }, suffix: "%"),
                            tone: cost.firstHomeRunVsSeason.flatMap { tone(-$0) }),
                    ])
                    if cost.power {
                        Label("Power Vehicle", systemImage: "bolt.fill").font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                    }
                }
            }
            if let crowd = row.crowd {
                HStack {
                    Label("\(crowd.count.formatted()) picks", systemImage: "person.2.fill").font(.caption.weight(.semibold))
                    if let delta = crowd.movement?.delta {
                        Text(ResearchFormat.signed(delta)).font(.caption.weight(.bold)).foregroundStyle(tone(Double(delta)) ?? .secondary)
                    }
                }
            }
            quoteStrip(row.quotes)
            if mode == .publicPicks { clearedRungs(row) }
        }
    }

    @ViewBuilder
    private func grade(_ row: Row) -> some View {
        if row.game.isVoid {
            Label("Void", systemImage: "minus.circle").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        } else if ["Live", "Final"].contains(row.game.status), let key = row.market.outcome,
                  let outcome = row.batter.outcome?[key] ?? nil {
            let label = outcome == 0 && row.game.status == "Live" ? "Live" : ResearchFormat.decimal(outcome)
            let color: Color = outcome > 0 ? .green : row.game.status == "Final" ? .red : .gray
            Text(label).font(.caption.weight(.bold)).monospacedDigit()
                .padding(.horizontal, 8).padding(.vertical, 5)
                .background(color.opacity(0.20), in: .capsule)
                .accessibilityLabel("Outcome \(label)")
        }
    }

    @ViewBuilder
    private func clearedRungs(_ row: Row) -> some View {
        if !row.game.isVoid, ["Live", "Final"].contains(row.game.status), let key = row.market.outcome,
           let value = row.batter.outcome?[key] ?? nil {
            ForEach(row.market.rungs.filter { value >= Double($0.1) }, id: \.0) { key, threshold in
                let quotes = row.batter.markets.first { $0.key == key }?.quotes.filter { $0.price != nil } ?? []
                if !quotes.isEmpty {
                    Label("\(threshold)+ cleared", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                    quoteStrip(quotes)
                }
            }
            if row.market.id == "hrr" {
                let cleared = row.quotes.filter { quote in
                    guard let line = quote.line, quote.price != nil else { return false }
                    return value > line
                }
                if !cleared.isEmpty {
                    Label("Cleared lines", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Brand.accent(for: scheme))
                    quoteStrip(cleared)
                }
            }
        }
    }

    @ViewBuilder
    private func quoteStrip(_ quotes: [DugoutBoard.Market.Quote]) -> some View {
        if !quotes.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(quotes) { quote in
                        VStack(alignment: .leading, spacing: 2) {
                            ResearchToolBook(book: Sportsbook.normalized(quote.book), price: quote.price ?? quote.opening)
                            if quote.price == nil {
                                Text("Opening only").font(.caption2).foregroundStyle(.secondary)
                            }
                            if let line = quote.line {
                                Text("Over \(ResearchFormat.decimal(line))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 8).padding(.vertical, 6)
                        .background(Brand.background(for: scheme), in: .rect(cornerRadius: 8))
                    }
                }
            }.scrollIndicators(.hidden)
        }
    }

    private func tone(_ value: Double) -> Color? {
        if value > 0 { return Color(rgb: scheme == .dark ? 0x7EF2AA : 0x14613D) }
        if value < 0 { return Color(rgb: scheme == .dark ? 0xFF999D : 0xAD2438) }
        return nil
    }

    private func load(_ key: String) async {
        do {
            let loaded = try await api.board(date: key, mode: .pregame)
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            slate = loaded
            failure = nil
        } catch {
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            if let status = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(status.code) { slate = nil }
            failure = error
        }
    }
}
