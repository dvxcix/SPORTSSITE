import SwiftUI

private struct HrIntelSlate: Decodable {
    struct Availability: Decodable { let paused: Bool }
    struct Diagnostics: Decodable { let gamesAnalyzed: Int }
    struct Market: Decodable { let open: Double?; let current: Double? }
    struct Movement: Decodable { let hrImpliedPoints: Double? }
    struct Evidence: Decodable, Identifiable { let key: String; let label: String; let value: String; let tone: String; var id: String { key } }

    struct Player: Decodable, Identifiable {
        let mlbId: Int
        let name: String
        let team: String
        let battingOrder: Int
        let position: String
        let headshot: URL?
        let teamLogo: URL?
        let teamColors: [String]?
        let fhr: Market
        let hr: Market
        let markets: [String: Market]
        let picksByMarket: [String: Int?]
        let fhrBaselineDeltaPct: Double?
        let hrPicks: Int?
        let publicRank: Int?
        let fhrTieSize: Int
        let contactAcceleration: Double?
        let diagnosticFhrScore: Double
        let diagnosticAnytimeScore: Double
        let diagnosticArchetype: String
        let movement: Movement
        let evidence: [Evidence]
        let mm: [String: Double?]?
        let bookRank: [String: Double?]?
        let paperRank: [String: Double?]?
        var id: Int { mlbId }
    }

    struct Settlement: Decodable, Identifiable {
        let mlbId: Int
        let name: String
        let team: String
        let headshot: URL?
        let teamLogo: URL?
        let teamColors: [String]?
        let firstHr: Bool
        let hits: Int?
        let homeRuns: Int?
        let totalBases: Int?
        let runs: Int?
        let rbi: Int?
        let hrr: Int?
        let grandSlam: Bool
        let maxHrSwingRbi: Int
        let onlyHitWasHr: Bool?
        let additionalHit: Bool?
        let cashedMarkets: [String]
        let missedMarkets: [String]
        var id: Int { mlbId }
    }

    struct Game: Decodable, Identifiable {
        struct Read: Decodable {
            let mode: String
            let boardFhrMlbId: Int?
            let boardCompanionMlbId: Int?
            let boardFhrScore: Double?
            let boardCompanionScore: Double?
            let boardCompanionLane: String?
        }
        struct Diagnostics: Decodable {
            let gameRegime: String
            let boardProfile: String
            let marketCoveragePct: Double
            let picksCoveragePct: Double
            let crossMarketPicksCoveragePct: Double
            let noHrImpliedPct: Double?
        }
        struct Validation: Decodable { let actualNoHr: Bool; let firstHrName: String?; let realizedHrOutcomes: [Settlement] }

        let gamePk: Int
        let awayTeam: String
        let homeTeam: String
        let awayLogo: URL?
        let homeLogo: URL?
        let players: [Player]
        let recommendation: Read
        let diagnostics: Diagnostics
        let warnings: [String]?
        let validation: Validation?
        var id: Int { gamePk }

        var pair: [Player] {
            [recommendation.boardFhrMlbId, recommendation.boardCompanionMlbId].compactMap { id in
                players.first { $0.id == id }
            }
        }

        var homerIDs: Set<Int> { Set(validation?.realizedHrOutcomes.map(\.id) ?? []) }
        var pairHits: Int { pair.filter { homerIDs.contains($0.id) }.count }
    }

    let date: String
    let games: [Game]
    let diagnostics: Diagnostics
    let marketLabels: [String: String]
    let pickLabels: [String: String]
}

struct AdminHrIntelligenceView: View {
    private struct Issue: Decodable { let error: String }
    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @State private var date = Date.now
    @State private var availability: HrIntelSlate.Availability?
    @State private var availabilityError: (any Error)?
    @State private var result: HrIntelSlate?
    @State private var selectedGame = ""
    @State private var error: String?
    @State private var loading = false
    @State private var retry = 0

    private static let path = "/api/mobile/admin/hr-intelligence"

    var body: some View {
        List {
            if let availability {
                Section {
                    DatePicker("Slate date", selection: $date, displayedComponents: .date).environment(\.timeZone, SlateDate.zone)
                        .disabled(loading)
                    if availability.paused {
                        Label("MLB analysis is paused for the off-season.", systemImage: "pause.circle").foregroundStyle(.secondary)
                    } else if loading {
                        ProgressView("Analyzing slate")
                    } else {
                        Button("Analyze full slate", systemImage: "chart.bar.xaxis") { Task { await analyze() } }
                    }
                    if let error { Label(error, systemImage: "exclamationmark.triangle").font(.footnote) }
                }
            } else {
                ResearchToolMessage(title: "HR Intelligence couldn’t load", error: availabilityError) { retry += 1 }
            }
            if let result { slate(result) }
        }
        .navigationTitle("HR Intelligence")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: retry) { await check() }
        .refreshable { if !loading { await check() } }
    }

    @ViewBuilder private func slate(_ data: HrIntelSlate) -> some View {
        if data.games.isEmpty {
            ContentUnavailableView("No games found", systemImage: "baseball", description: Text("Choose another slate date."))
        } else {
            Section {
                ResearchArtworkPicker(title: "Select game", options: data.games.map { game in
                    .init(id: String(game.id), title: "\(game.awayTeam) at \(game.homeTeam)", url: game.awayLogo,
                        secondaryLogo: game.homeLogo, icon: "baseball")
                }, selection: $selectedGame)
                LabeledContent("Games analyzed", value: data.diagnostics.gamesAnalyzed.formatted())
            } header: { Text(SlateDate.fromKey(data.date).map { SlateDate.label($0, year: true) } ?? data.date) }
            let graded = data.games.filter { $0.validation != nil }
            if !graded.isEmpty {
                Section("Slate scorecard") {
                    let winningGames = graded.filter { $0.pairHits > 0 }.count
                    LabeledContent("Games with a hit", value: "\(winningGames) of \(graded.count)")
                    LabeledContent("Player hits", value: "\(graded.reduce(0) { $0 + $1.pairHits }) of \(graded.count * 2)")
                    LabeledContent("Game coverage", value: (Double(winningGames) / Double(graded.count)).formatted(.percent.precision(.fractionLength(0))))
                }
            }
            if let game = data.games.first(where: { String($0.id) == selectedGame }) ?? data.games.first {
                HrIntelGameBoard(game: game, marketLabels: data.marketLabels, pickLabels: data.pickLabels)
            }
        }
    }

    private func check() async {
        do {
            let value = try await api.memberRead(HrIntelSlate.Availability.self, path: Self.path)
            try Task.checkCancellation()
            availability = value
            availabilityError = nil
        } catch is CancellationError {
            return
        } catch {
            availabilityError = error
        }
    }

    private func analyze() async {
        guard !loading, availability?.paused == false else { return }
        loading = true
        error = nil
        result = nil
        defer { loading = false }
        do {
            let snapshot = try await api.memberRead(HrIntelSlate.self, path: Self.path,
                query: [.init(name: "date", value: SlateDate.key(date))], timeout: 315)
            result = snapshot
            selectedGame = snapshot.games.first.map { String($0.id) } ?? ""
        } catch let failure as SlipSurgeHTTP.Status {
            error = (try? JSONDecoder().decode(Issue.self, from: failure.data))?.error ?? "The slate couldn’t load."
        } catch {
            self.error = "The slate couldn’t load."
        }
    }
}

private struct HrIntelGameBoard: View {
    let game: HrIntelSlate.Game
    let marketLabels: [String: String]
    let pickLabels: [String: String]

    var body: some View {
        if let warnings = game.warnings, !warnings.isEmpty {
            Section {
                ForEach(warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        Section("Pregame two-player read") {
            let read = game.recommendation
            recommendation(id: read.boardFhrMlbId, title: "Market and form anchor", score: read.boardFhrScore, icon: "scope")
            recommendation(id: read.boardCompanionMlbId, title: (read.boardCompanionLane?.replacingOccurrences(of: "-", with: " ").capitalized ?? "Structural dislocation"),
                score: read.boardCompanionScore, icon: "waveform.path")
        }
        if let validation = game.validation {
            Section("Postgame scorecard") {
                LabeledContent("Pair result", value: "\(game.pairHits) of 2")
                if validation.actualNoHr { Text("No home runs in this game") }
                else if let first = validation.firstHrName { LabeledContent("First home run", value: first) }
                ForEach(game.pair) { player in
                    let homered = game.homerIDs.contains(player.id)
                    Label(player.name, systemImage: homered ? "checkmark.circle.fill" : "xmark.circle")
                        .foregroundStyle(homered ? Color.green : Color.red)
                        .accessibilityValue(homered ? "Home run" : "No home run")
                }
                if !validation.realizedHrOutcomes.isEmpty {
                    NavigationLink("Realized home run settlements") { settlements(validation.realizedHrOutcomes) }
                }
            }
        }
        Section {
            DisclosureGroup("Model diagnostics") {
                LabeledContent("Game regime", value: game.diagnostics.gameRegime.replacingOccurrences(of: "-", with: " ").capitalized)
                LabeledContent("Board profile", value: game.diagnostics.boardProfile.capitalized)
                LabeledContent("Market coverage", value: metric(game.diagnostics.marketCoveragePct, suffix: "%"))
                LabeledContent("HR pick coverage", value: metric(game.diagnostics.picksCoveragePct, suffix: "%"))
                LabeledContent("Cross-market coverage", value: metric(game.diagnostics.crossMarketPicksCoveragePct, suffix: "%"))
                LabeledContent("No home run implied", value: metric(game.diagnostics.noHrImpliedPct, suffix: "%"))
            }
        }
        ForEach([game.awayTeam, game.homeTeam], id: \.self) { team in
            let players = game.players.filter { $0.team == team }.sorted { $0.battingOrder < $1.battingOrder }
            Section {
                ForEach(players) { player in
                    NavigationLink {
                        HrIntelPlayerDetail(player: player, marketLabels: marketLabels, pickLabels: pickLabels)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            identity(player)
                            Text("FHR \(odds(player.fhr.current)) · HR \(odds(player.hr.current)) · \(count(player.hrPicks)) HR picks")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } header: { Text("\(team) · \(players.count) of 9") }
        }
    }

    @ViewBuilder private func recommendation(id: Int?, title: String, score: Double?, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabeledContent { Text(metric(score)) } label: { Label(title, systemImage: icon) }
                .font(.subheadline.weight(.semibold))
            if let player = game.players.first(where: { $0.id == id }) {
                identity(player)
                Text("FHR \(odds(player.fhr.current)) · HR \(odds(player.hr.current)) · \(count(player.hrPicks)) HR picks")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("No qualified player").font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func identity(_ player: HrIntelSlate.Player) -> some View {
        HrIntelPlayerIdentity(name: player.name, detail: "\(player.team) · #\(player.battingOrder) · \(player.position)",
            photo: player.headshot, logo: player.teamLogo, colors: player.teamColors)
    }

    private func settlements(_ players: [HrIntelSlate.Settlement]) -> some View {
        List {
            ForEach(players) { player in
                Section(player.name) {
                    HrIntelPlayerIdentity(name: player.name, detail: player.firstHr ? "First home run" : player.team,
                        photo: player.headshot, logo: player.teamLogo, colors: player.teamColors)
                    if player.grandSlam { Label("Grand slam", systemImage: "star.fill") }
                    if player.hits == nil {
                        Text("Box score unavailable").foregroundStyle(.secondary)
                    } else {
                        LabeledContent("Hits", value: count(player.hits))
                        LabeledContent("Home runs", value: count(player.homeRuns))
                        LabeledContent("Total bases", value: count(player.totalBases))
                        LabeledContent("RBI", value: count(player.rbi))
                        LabeledContent("Runs", value: count(player.runs))
                        LabeledContent("H+R+RBI", value: count(player.hrr))
                    }
                    LabeledContent("RBI on largest home run", value: player.maxHrSwingRbi.formatted())
                    if player.additionalHit == true { Text("Additional hit recorded") }
                    if player.onlyHitWasHr == true { Text("Homer was the only hit") }
                    if !player.cashedMarkets.isEmpty { Label(player.cashedMarkets.joined(separator: " · "), systemImage: "checkmark.circle") }
                    if !player.missedMarkets.isEmpty { Label(player.missedMarkets.joined(separator: " · "), systemImage: "xmark.circle") }
                }
            }
        }
        .navigationTitle("Home run settlements")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HrIntelPlayerDetail: View {
    let player: HrIntelSlate.Player
    let marketLabels: [String: String]
    let pickLabels: [String: String]

    var body: some View {
        List {
            Section {
                HrIntelPlayerIdentity(name: player.name, detail: "\(player.team) · #\(player.battingOrder) · \(player.position)",
                    photo: player.headshot, logo: player.teamLogo, colors: player.teamColors)
                LabeledContent("First home run", value: odds(player.fhr.current))
                LabeledContent("FHR baseline", value: player.fhrTieSize > 1 ? "\(player.fhrTieSize)-way tie" : signed(player.fhrBaselineDeltaPct, suffix: "%"))
                LabeledContent("Anytime", value: odds(player.hr.current))
                LabeledContent("HR movement", value: signed(player.movement.hrImpliedPoints, suffix: " pp"))
                LabeledContent("Public exposure", value: "\(count(player.hrPicks)) · Rank \(count(player.publicRank))")
                LabeledContent("Contact acceleration", value: signed(player.contactAcceleration, suffix: "%"))
                LabeledContent("Board read", value: "\(metric(player.diagnosticFhrScore)) / \(metric(player.diagnosticAnytimeScore))")
                Text(player.diagnosticArchetype.replacingOccurrences(of: "-", with: " ").capitalized).foregroundStyle(.secondary)
            }
            Section("Evidence") {
                ForEach(player.evidence) { evidence in
                    LabeledContent(evidence.label) {
                        Text(evidence.value).foregroundStyle(evidence.tone == "positive" ? Color.green : evidence.tone == "warning" ? .orange : .secondary)
                    }
                }
            }
            Section("Market ladder") {
                ForEach(player.markets.keys.sorted(), id: \.self) { key in
                    if let market = player.markets[key] {
                        LabeledContent(marketLabels[key] ?? key, value: "\(odds(market.open)) to \(odds(market.current))")
                    }
                }
            }
            Section("Public exposure by market") {
                ForEach(player.picksByMarket.keys.sorted(), id: \.self) { key in
                    LabeledContent(pickLabels[key] ?? key, value: count(player.picksByMarket[key] ?? nil))
                }
            }
            Section("MM and rank windows") {
                ForEach(["l1", "l3", "l5", "l10"], id: \.self) { key in
                    VStack(alignment: .leading, spacing: 4) {
                        LabeledContent(key.uppercased(), value: "MM \(metric(player.mm?[key] ?? nil))")
                        Text("Book \(metric(player.bookRank?[key] ?? nil)) · Paper \(metric(player.paperRank?[key] ?? nil))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(player.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HrIntelPlayerIdentity: View {
    let name: String
    let detail: String
    let photo: URL?
    let logo: URL?
    let colors: [String]?

    var body: some View {
        let palette = colors?.compactMap(Color.init(hex:)) ?? []
        HStack(spacing: 9) {
            ResearchArtwork(urls: [photo].compactMap { $0 }, fallback: "person.crop.circle.fill")
                .frame(width: 41, height: 43)
                .background(LinearGradient(colors: [palette.first ?? .secondary, palette.dropFirst().first ?? .secondary],
                    startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 9))
                .overlay(alignment: .bottomTrailing) {
                    if let logo {
                        ResearchArtwork(urls: [logo], fallback: "baseball").padding(2)
                            .frame(width: 17, height: 17).background(.background, in: .circle)
                    }
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private func count(_ value: Int?) -> String { value?.formatted() ?? "N/A" }
private func metric(_ value: Double?, suffix: String = "") -> String {
    value.map { $0.formatted(.number.precision(.fractionLength(0...1))) + suffix } ?? "N/A"
}
private func signed(_ value: Double?, suffix: String = "") -> String {
    value.map { ($0 > 0 ? "+" : "") + metric($0, suffix: suffix) } ?? "N/A"
}
private func odds(_ value: Double?) -> String { signed(value) }
