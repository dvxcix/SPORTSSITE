import SwiftUI

struct DugoutDailyRecap: View {
    private enum Sort: String, CaseIterable { case distance = "Longest", velocity = "Hardest hit", time = "Most recent", player = "Player" }

    private struct Entry: Identifiable {
        let game: DugoutBoard.Game
        let events: [DugoutBoard.HomeRun]
        var first: DugoutBoard.HomeRun { events[0] }
        var player: DugoutBoard.Batter? { game.batters.first { $0.id == first.playerId } }
        var id: String { "\(game.id):\(first.playerId.map(String.init) ?? first.playerName)" }
        var longest: Double? { events.compactMap(\.distance).max() }
        var hardest: Double? { events.compactMap(\.exitVelocity).max() }
        var latest: String { events.compactMap(\.time).max() ?? "" }
    }

    let api: DugoutAPI
    @State var date: Date
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @State private var board: DugoutBoard?
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var window = DugoutWindow.l10
    @State private var sort = Sort.distance
    @State private var histories: [Int: DugoutOddsHistory] = [:]
    @State private var historyFailed = false
    @State private var cursor: Int?
    @State private var expanded: Entry?
    @State private var opensMatrices = false
    private var profile: DugoutPlayerProfileAPI { .init(account: api.account, userID: api.userID) }
    private var day: String { SlateDate.key(date) }

    var body: some View {
        let requested = day
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                ResearchSlateControls(date: $date, latest: .now)
                if let board, board.date == requested {
                    recap(board)
                } else {
                    ResearchToolMessage(title: "Daily Recap couldn’t load", error: error) { revision += 1 }
                }
            }.padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Daily Recap")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu("Recap tools", systemImage: "ellipsis.circle") {
                    Button("MLB Matrices", systemImage: "square.grid.3x3") { opensMatrices = true }
                    NavigationLink {
                        DugoutView(api: api, date: date)
                    } label: { Label("The Dugout", systemImage: "baseball.diamond") }
                }
            }
        }
        .navigationDestination(isPresented: $opensMatrices) {
            DugoutMatricesView(api: .init(account: api.account, userID: api.userID))
                .onDisappear { revision += 1 }
        }
        .sheet(item: $expanded) { entry in
            NavigationStack {
                details(entry)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { expanded = nil } } }
            }
        }
        .onChange(of: requested) { histories = [:]; cursor = nil; historyFailed = false }
        .task(id: "\(requested):\(revision)") { await load(requested) }
        .task(id: "\(requested):\(phase):\(board?.homeRuns?.count ?? -1)") {
            if let board, board.date == requested { await loadHistory(board) }
            guard requested == SlateDate.key(.now), phase == .active else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                await load(requested)
            }
        }
        .refreshable { await load(requested) }
    }

    @ViewBuilder private func recap(_ board: DugoutBoard) -> some View {
        let games = Dictionary(board.games.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let unique = Dictionary((board.homeRuns ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let grouped = Dictionary(grouping: unique.values) { hit in "\(hit.gameId):\(hit.playerId.map(String.init) ?? hit.playerName)" }
        let entries = grouped.values.compactMap { hits -> Entry? in
            guard let gameID = hits.first?.gameId, let game = games[gameID] else { return nil }
            return Entry(game: game, events: hits.sorted { $0.atBat < $1.atBat })
        }
        if entries.isEmpty {
            ContentUnavailableView("No confirmed home runs", systemImage: "baseball.diamond",
                description: Text("Choose a different slate date to review its results."))
        } else {
            marketStory
            HStack {
                Picker("Sample window", selection: $window) {
                    ForEach(DugoutWindow.form, id: \.self) { Text($0.title).tag($0) }
                }
                Spacer()
                Picker("Sort by", selection: $sort) {
                    ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
            }
            ForEach(entries.sorted(by: ranked)) { entry in
                Button { expanded = entry } label: { row(entry) }.buttonStyle(SlipSurgePressStyle())
            }
        }
    }

    private var timeline: [Date] {
        Set(histories.values.flatMap { $0.series.flatMap { $0.points.map(\.time) } }).sorted()
    }

    private var marketStory: some View {
        let times = timeline
        let position = min(cursor ?? times.count - 1, times.count - 1)
        let point = times.indices.contains(position) ? times[position] : nil
        return ResearchToolCard(color: Brand.accent(for: scheme)) {
            ResearchSectionTitle(title: "Market History")
        } content: {
            if times.count > 1 {
                Slider(value: Binding(get: { Double(max(0, position)) }, set: { cursor = Int($0) }),
                    in: 0...Double(times.count - 1), step: 1) { Text("Pregame capture") }
                    .accessibilityValue(point.map { $0.formatted(date: .omitted, time: .shortened) } ?? "Latest")
                HStack {
                    Text("Open"); Spacer()
                    Text(point.map { $0.formatted(date: .omitted, time: .shortened) } ?? "Latest")
                    Spacer(); Text("Latest")
                }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            } else if historyFailed {
                Text("Some game histories couldn’t load.").font(.caption).foregroundStyle(.secondary)
                Button("Retry history") { if let board { Task { await loadHistory(board, retry: true) } } }.font(.caption)
            } else {
                Text("Opening and latest prices are shown when captured.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func row(_ entry: Entry) -> some View {
        let player = entry.player
        let team = player.map { entry.game.team(for: $0) } ?? entry.game.home
        let mismatch = player?.mismatch(window)
        return ResearchToolCard(color: team.color) {
            HStack {
                DugoutOpponentArtwork(name: entry.first.playerName,
                    subtitle: "\(entry.game.away.code) at \(entry.game.home.code) · \(entry.events.count) HR",
                    headshot: player?.headshot ?? portrait(entry.first.playerId), logo: player == nil ? nil : team.logo)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            }
        } content: {
            ResearchToolValues(items: [
                .init(label: "Longest", text: ResearchFormat.decimal(entry.longest, suffix: " ft")),
                .init(label: "Hardest hit", text: ResearchFormat.decimal(entry.hardest, suffix: " mph")),
                .init(label: "MM \(window.title)", text: ResearchFormat.signed(mismatch), tone: mismatch.flatMap { dugoutTone(-Double($0), scheme: scheme) }),
            ])
            if let quote = homeRunQuote(entry) { DugoutQuoteRow(quote: quote) }
        }
    }

    private func details(_ entry: Entry) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                row(entry)
                ForEach(entry.events) { hit in
                    ResearchToolCard(color: entry.game.home.color) {
                        ResearchSectionTitle(title: hit.grandSlam ? "Grand Slam" : hit.firstHomeRun ? "First Home Run" : "Home Run")
                    } content: {
                        Text(hit.description).font(.subheadline)
                        if let inning = hit.inning {
                            Text("\(hit.half?.capitalized ?? "Inning") \(inning)").font(.caption).foregroundStyle(.secondary)
                        }
                        ResearchToolValues(items: [
                            .init(label: "Distance", text: ResearchFormat.decimal(hit.distance, suffix: " ft")),
                            .init(label: "Exit velocity", text: ResearchFormat.decimal(hit.exitVelocity, suffix: " mph")),
                            .init(label: "Launch angle", text: ResearchFormat.decimal(hit.launchAngle, suffix: "°")),
                        ])
                    }
                }
                if let batter = entry.player {
                    NavigationLink {
                        DugoutPlayerView(player: batter, game: entry.game, window: window,
                            watchTarget: api.watchTarget(date: date, game: entry.game.id, player: batter.id), profileAPI: profile, showsDone: false)
                    } label: { Label("Pregame player research", systemImage: "chart.bar.xaxis") }.buttonStyle(.borderedProminent)
                } else if let id = entry.first.playerId {
                    NavigationLink {
                        DugoutPlayerProfileView(api: profile, playerID: id, preferredRole: .batter)
                    } label: { Label("Player profile", systemImage: "person.crop.circle") }.buttonStyle(.bordered)
                }
                if let id = entry.first.playerId {
                    DugoutWorkspaceMarkets(game: entry.game, playerID: id, batter: entry.player, history: histories[entry.game.id],
                        historyFailed: historyFailed, retry: { if let board { Task { await loadHistory(board, retry: true) } } })
                }
            }.padding(16)
        }
        .navigationTitle(entry.first.playerName)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
    }

    private func ranked(_ left: Entry, _ right: Entry) -> Bool {
        switch sort {
        case .distance: if left.longest != right.longest { return (left.longest ?? -.infinity) > (right.longest ?? -.infinity) }
        case .velocity: if left.hardest != right.hardest { return (left.hardest ?? -.infinity) > (right.hardest ?? -.infinity) }
        case .time: if left.latest != right.latest { return left.latest > right.latest }
        case .player: break
        }
        return left.first.playerName == right.first.playerName ? left.id < right.id : left.first.playerName < right.first.playerName
    }

    private func portrait(_ id: Int?) -> URL? {
        id.flatMap { URL(string: "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_426,q_auto:best/v1/people/\($0)/headshot/silo/current") }
    }

    private func homeRunQuote(_ entry: Entry) -> DugoutBoard.Market.Quote? {
        if let matching = histories[entry.game.id]?.series.first(where: { $0.playerId == entry.first.playerId && $0.market == "sa" && $0.book == "fanduel" }) {
            let times = timeline
            if let cursor, times.indices.contains(cursor) {
                let point = matching.points.last { $0.time <= times[cursor] }
                return point.map { .init(book: matching.book, price: $0.odds, opening: matching.opening?.odds, line: matching.line) }
            }
            return .init(book: matching.book, price: matching.latest?.odds, opening: matching.opening?.odds, line: matching.line)
        }
        if cursor != nil { return nil }
        return entry.player?.markets.first { $0.key == "sa" }?.quotes.first { $0.book == "fanduel" }
    }

    private func load(_ requested: String) async {
        do {
            let result = try await api.board(date: requested, mode: .pregame, recap: true)
            try Task.checkCancellation()
            if day == requested { board = result; error = nil }
        } catch {
            if !Task.isCancelled, day == requested { self.error = error }
        }
    }

    private func loadHistory(_ board: DugoutBoard, retry: Bool = false) async {
        if retry { historyFailed = false }
        for game in Set((board.homeRuns ?? []).map(\.gameId)).sorted() where histories[game] == nil {
            guard !Task.isCancelled, day == board.date else { return }
            do {
                let value = try await api.oddsHistory(date: board.date, game: game)
                try Task.checkCancellation()
                if day == board.date { histories[game] = value }
            } catch {
                if !Task.isCancelled, day == board.date { historyFailed = true }
            }
        }
    }
}
