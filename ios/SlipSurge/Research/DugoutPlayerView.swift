import Charts
import SwiftUI

struct DugoutPlayerView: View {
    let player: DugoutBoard.Batter
    let game: DugoutBoard.Game
    @State var window: DugoutWindow
    var watchTarget: DugoutWatchTarget?
    var profileAPI: DugoutPlayerProfileAPI?
    var showsDone = true
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let team = game.team(for: player)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                ResearchToolCard(color: team.color) {
                    ResearchToolPortrait(name: player.name, subtitle: "\(team.name) · \(player.position) · Bats \(player.bats)",
                        portraits: [player.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                } content: {
                    if let profile = profileAPI ?? watchTarget?.profileAPI {
                        DugoutPlayerProfileLink(api: profile, id: player.id, role: .batter)
                    }
                    if let pitcher = game.opponentPitcher(for: player) {
                        let opponent = team.code == game.home.code ? game.away : game.home
                        NavigationLink {
                            DugoutPitcherView(pitcher: pitcher, team: opponent, watchTarget: watchTarget?.forPlayer(pitcher.id),
                                profileAPI: profileAPI)
                        } label: {
                            HStack {
                                ResearchArtwork(urls: [pitcher.headshot], fallback: "person.fill")
                                    .frame(width: 26, height: 26)
                                Text("vs. \(pitcher.name) · \(pitcher.hand)HP").font(.subheadline.weight(.medium))
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                            }
                            .foregroundStyle(.secondary)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                    }
                    if player.projected {
                        Label("Projected lineup", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
                    }
                    if let outcome = player.outcome, !game.isVoid {
                        outcomeValues(outcome)
                    }
                }
                if game.snapshot.unavailable == true {
                    Label("Pregame research is unavailable for this game", systemImage: "clock.badge.exclamationmark")
                        .font(.caption).foregroundStyle(.secondary)
                } else if player.mm != nil || player.statcast != nil || player.mechanics != nil {
                    Picker("Recent form", selection: $window) {
                        ForEach(DugoutWindow.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    form(team)
                }
                if !player.markets.isEmpty {
                    ResearchSectionTitle(title: "Sportsbook odds")
                    ForEach(player.markets) { DugoutMarketCard(market: $0, color: team.color, watchTarget: watchTarget) }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(player.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showsDone { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    @ViewBuilder
    private func form(_ team: DugoutBoard.Team) -> some View {
        if player.mm != nil || player.bookRank != nil || player.paperRank != nil {
            ResearchToolCard(color: team.color) {
                ResearchSectionTitle(title: "MM")
            } content: {
                DugoutRankValues(player: player, window: window)
                DugoutMismatchTrend(player: player)
            }
        }
        if let mechanics = player.mechanics?[window.rawValue] {
            ResearchToolCard(color: team.secondaryColor) {
                ResearchSectionTitle(title: "SlipSurge Score")
            } content: {
                ResearchToolValues(items: [
                    .init(label: "Score", text: ResearchFormat.decimal(mechanics.index)),
                    .init(label: "Rank", text: mechanics.rank.map { "#\($0)" } ?? "—"),
                    .init(label: "Trend", text: ResearchFormat.signedDecimal(mechanics.trend), tone: mechanics.trend.flatMap { dugoutTone($0, scheme: scheme) }),
                ])
            }
        }
        if let current = player.statcast?[window.rawValue] {
            ResearchToolCard(color: team.color) {
                ResearchSectionTitle(title: "Statcast")
            } content: {
                ResearchToolValues(items: [
                    stat("avgBatSpeed", "Bat speed", current: current, suffix: " mph"),
                    stat("avgAttackAngle", "Attack angle", current: current, suffix: "°"),
                    stat("avgSwingLength", "Swing length", current: current, suffix: " ft"),
                    stat("barrelPct", "Barrels", current: current, suffix: "%"),
                    stat("hardHitPct", "Hard hit", current: current, suffix: "%"),
                    stat("sweetSpotPct", "Sweet spot", current: current, suffix: "%"),
                    stat("avgEv", "Exit velocity", current: current, suffix: " mph"),
                    stat("avgLa", "Launch angle", current: current, suffix: "°"),
                    stat("hr", "Home runs", current: current),
                    stat("squaredUpPct", "Squared up", current: current, suffix: "%", scale: 100),
                    stat("pullAirRate", "Pull air", current: current, suffix: "%", scale: 100),
                    stat("onTimePct", "On time", current: current, suffix: "%", scale: 100),
                ])
            }
        }
    }

    private func stat(_ key: String, _ title: String, current: [String: Double?],
        suffix: String = "", scale: Double = 1) -> ResearchToolValues.Value {
        let value = current[key] ?? nil
        return .init(label: title, text: ResearchFormat.decimal(value.map { $0 * scale }, suffix: suffix))
    }

    @ViewBuilder
    private func outcomeValues(_ outcome: [String: Double?]) -> some View {
        let fields = [("h", "Hits"), ("hr", "Home runs"), ("rbi", "RBI"), ("runs", "Runs"), ("tb", "Total bases"), ("sb", "Stolen bases")]
        let values: [ResearchToolValues.Value] = fields.compactMap { key, label in
            guard let value = outcome[key] ?? nil else { return nil }
            return .init(label: label, text: ResearchFormat.decimal(value))
        }
        if !values.isEmpty { ResearchToolValues(items: values) }
    }
}

struct DugoutPitcherView: View {
    let pitcher: DugoutBoard.Pitcher
    let team: DugoutBoard.Team
    var watchTarget: DugoutWatchTarget?
    var profileAPI: DugoutPlayerProfileAPI?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ResearchToolCard(color: team.color) {
                    ResearchToolPortrait(name: pitcher.name, subtitle: "\(team.name) · \(pitcher.hand)HP",
                        portraits: [pitcher.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                } content: {
                    if let profile = profileAPI ?? watchTarget?.profileAPI {
                        DugoutPlayerProfileLink(api: profile, id: pitcher.id, role: .pitcher)
                    }
                }
                if pitcher.markets.isEmpty {
                    ContentUnavailableView("No pitcher prices posted", systemImage: "chart.line.uptrend.xyaxis")
                } else {
                    ForEach(pitcher.markets) { DugoutMarketCard(market: $0, color: team.color, watchTarget: watchTarget) }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(pitcher.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DugoutPlayerProfileLink: View {
    let api: DugoutPlayerProfileAPI
    let id: Int
    let role: DugoutProfile.Role

    var body: some View {
        NavigationLink {
            DugoutPlayerProfileView(api: api, playerID: id, preferredRole: role)
        } label: {
            HStack {
                Label("Player profile", systemImage: "person.crop.rectangle")
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: 44)
        }
        .buttonStyle(SlipSurgePressStyle())
    }
}

struct DugoutRankValues: View {
    let player: DugoutBoard.Batter
    let window: DugoutWindow
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if let mm = player.mismatch(window) {
            ResearchToolValues(items: [
                .init(label: "MM · \(window.title)", text: ResearchFormat.signed(mm), tone: dugoutTone(Double(mm), scheme: scheme)),
                .init(label: "Book rank", text: player.bookRanking(window).map { "#\($0)" } ?? "—"),
                .init(label: "Paper rank", text: player.paperRanking(window).map { "#\($0)" } ?? "—"),
            ])
        }
    }
}

struct DugoutMismatchTrend: View {
    struct Point: Identifiable {
        let window: DugoutWindow
        let value: Int
        var id: DugoutWindow { window }
    }

    let player: DugoutBoard.Batter
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let points = DugoutWindow.form.compactMap { window in
            player.mismatch(window).map { Point(window: window, value: $0) }
        }
        if !points.isEmpty {
            let limit = max(1, points.map { abs($0.value) }.max() ?? 1)
            Chart {
                RuleMark(y: .value("Neutral", 0)).foregroundStyle(.secondary.opacity(0.45))
                ForEach(points) { point in
                    BarMark(x: .value("Games", point.window.title), y: .value("MM", point.value))
                        .foregroundStyle(dugoutTone(Double(point.value), scheme: scheme) ?? .secondary)
                        .cornerRadius(3)
                        .accessibilityLabel(point.window.title)
                        .accessibilityValue(ResearchFormat.signed(point.value))
                }
            }
            .chartXScale(domain: DugoutWindow.form.map(\.title))
            .chartYScale(domain: -limit...limit)
            .frame(height: 96)
            .accessibilityLabel("MM by recent game window")
        }
    }
}

struct DugoutQuoteRow: View {
    let quote: DugoutBoard.Market.Quote
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let book = Sportsbook.normalized(quote.book)
        HStack(spacing: 8) {
            if let logo = Sportsbook.artwork(book) {
                Image(logo).resizable().scaledToFit().frame(width: 20, height: 20).accessibilityHidden(true)
            }
            Text(Sportsbook.name(book)).font(.subheadline.weight(.medium))
            if let line = quote.line {
                Text("Over \(ResearchFormat.decimal(line))").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if let opening = quote.opening {
                Text("Open \(ResearchFormat.price(opening))").font(.caption).foregroundStyle(.secondary)
            }
            if let price = quote.price {
                let movement = quote.opening.flatMap { dugoutTone(Double($0 - price), scheme: scheme) }
                Text(ResearchFormat.price(price))
                    .font(.subheadline.weight(.bold)).monospacedDigit()
                    .foregroundStyle(movement ?? Brand.text(for: scheme))
            }
        }
        .padding(9)
        .background(Brand.background(for: scheme).opacity(0.7), in: .rect(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }
}

private struct DugoutMarketCard: View {
    let market: DugoutBoard.Market
    let color: Color
    let watchTarget: DugoutWatchTarget?

    var body: some View {
        ResearchToolCard(color: color) {
            Text(market.label).font(.headline)
        } content: {
            ForEach(market.quotes) { quote in
                HStack(spacing: 4) {
                    DugoutQuoteRow(quote: quote)
                    if let watchTarget, let price = quote.price ?? quote.opening {
                        DugoutWatchQuoteButton(api: watchTarget.api, quote: .init(date: watchTarget.date,
                            gameId: watchTarget.game, playerId: watchTarget.player, market: market.key, book: quote.book, price: price),
                            label: market.label)
                            .id(price)
                    }
                }
            }
        }
    }
}

struct DugoutWatchTarget {
    let api: ResearchLibraryAPI
    let date: String
    let game: Int
    let player: Int

    var profileAPI: DugoutPlayerProfileAPI { .init(account: api.account, userID: api.userID) }

    func forPlayer(_ id: Int) -> Self { .init(api: api, date: date, game: game, player: id) }
}

private struct DugoutWatchQuoteButton: View {
    let api: ResearchLibraryAPI
    let quote: ResearchLibraryAPI.MLBQuote
    let label: String
    @State private var requestID = UUID()
    @State private var saving = false
    @State private var saved = false
    @State private var failure: String?

    var body: some View {
        Button {
            Task { await save() }
        } label: {
            Group {
                if saving { ProgressView() }
                else { Image(systemName: saved ? "star.fill" : "star") }
            }
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(saved ? .orange : .secondary)
        .disabled(saving || saved)
        .accessibilityLabel(saved ? "Saved to Watchlist" : "Save \(label) from \(Sportsbook.name(Sportsbook.normalized(quote.book))) to Watchlist")
        .sensoryFeedback(.success, trigger: saved)
        .alert("Watchlist quote", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private func save() async {
        guard !saving, !saved else { return }
        saving = true
        defer { saving = false }
        do {
            try await api.mutate(.init(kind: "watchlist-save", id: requestID.uuidString.lowercased(), mlbQuote: quote))
            saved = true
        } catch let response as SlipSurgeHTTP.Status where response.code == 409 {
            failure = "The quote changed. Refresh the board and try again."
        } catch {
            failure = "The quote couldn’t be saved. Try again."
        }
    }
}

func dugoutTone(_ value: Double, scheme: ColorScheme) -> Color? {
    if value > 0 { return Color(rgb: scheme == .dark ? 0x7EF2AA : 0x14613D) }
    if value < 0 { return Color(rgb: scheme == .dark ? 0xFF999D : 0xAD2438) }
    return nil
}
