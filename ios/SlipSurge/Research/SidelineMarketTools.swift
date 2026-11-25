import SwiftUI

struct SidelineMarketTools: View {
    enum Tool: String {
        case publicActivity = "The Public"
        case sportsbooks = "Sportsbooks"
    }

    struct Visual {
        let code: String
        let logo: URL?
        let primary: Color
        let secondary: Color?
    }

    private struct Payload: Decodable {
        struct Odds: Decodable {
            let players: [Player]
            let picksCapturedAt: String?
            let availabilityStale: Bool?
            let availabilityCutoffAt: String?
        }

        struct Player: Decodable, Identifiable {
            let id: Int
            let name: String
            let team: String
            let position: String?
            let headshot: URL?
            let headshotFallbacks: [URL]?
            let markets: [Market]
            let publicPicks: [Pick]?
        }

        struct Pick: Decodable {
            let propType: String
            let label: String
            let picks: Int
            let capturedAt: String
        }

        struct Market: Decodable {
            let key: String
            let label: String
            let category: String
            let line: Double?
            let offers: [Offer]
        }

        struct Offer: Decodable {
            struct Values: Decodable {
                let odds: Int?
                let over: Int?
                let under: Int?
            }
            let vendor: String
            let line: Double?
            let current: Values?
            let updatedAt: String?
            let isOpeningOnly: Bool?
        }

        let odds: Odds
    }

    private struct Row: Identifiable {
        let id: String
        let player: Payload.Player
        let category: String
        let title: String
        var picks: Int?
        var observedAt: Date?
        var prices: [Price] = []
    }

    private struct Contract: Hashable {
        let line: Double?
        let side: String
    }

    private struct Price: Identifiable {
        let book: String
        let value: Int
        let stamp: Date

        var id: String { book }
    }

    let api: SidelineAPI
    let tool: Tool
    let date: String
    let gameID: String
    let teams: [Visual]

    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var data: Payload.Odds?
    @State private var failed = false
    @State private var denied = false
    @State private var retry = 0
    @State private var query = ""
    @State private var category: String?
    @State private var team: String?
    @State private var book: String?
    @State private var visible = 24

    private var captureCutoff: Date? { data?.availabilityCutoffAt.flatMap(SidelineBoard.timestamp) }

    private var rows: [Row] {
        guard let data, data.availabilityStale != true, let cutoff = captureCutoff else { return [] }
        let today = Date.now
        return data.players.flatMap { player -> [Row] in
            switch tool {
            case .publicActivity:
                return (player.publicPicks ?? []).enumerated().compactMap { index, pick in
                    guard (0...10_000_000).contains(pick.picks), let stamp = SidelineBoard.timestamp(pick.capturedAt),
                          stamp <= today, stamp < cutoff else { return nil }
                    return Row(id: "\(player.id):\(index)", player: player, category: pick.propType, title: pick.label,
                               picks: pick.picks, observedAt: stamp)
                }
            case .sportsbooks:
                return player.markets.flatMap { market -> [Row] in
                    var contracts: [Contract: [Price]] = [:]
                    for offer in market.offers where offer.isOpeningOnly != true {
                        guard let stamp = offer.updatedAt.flatMap(SidelineBoard.timestamp), stamp < cutoff, stamp <= today else { continue }
                        let line = offer.line ?? market.line
                        for (side, value) in [("Milestone", offer.current?.odds), ("Over", offer.current?.over), ("Under", offer.current?.under)] {
                            guard let value, abs(Double(value)) >= 100 else { continue }
                            contracts[Contract(line: line, side: side), default: []].append(.init(book: offer.vendor, value: value, stamp: stamp))
                        }
                    }
                    return contracts.map { contract, prices in
                        let line = contract.line?.formatted() ?? ""
                        let label = contract.side == "Milestone" ? (line.isEmpty ? market.label : "\(market.label) · \(line)+") :
                            "\(market.label) · \(contract.side) \(line)"
                        let byBook = Dictionary(grouping: prices, by: \.book)
                        let latest = byBook.values.compactMap { paths -> Price? in
                            guard let newest = paths.max(by: { $0.stamp < $1.stamp }) else { return nil }
                            return paths.contains { $0.stamp == newest.stamp && $0.value != newest.value } ? nil : newest
                        }.sorted { $0.value == $1.value ? $0.book < $1.book : $0.value > $1.value }
                        return Row(id: "\(player.id):\(market.key):\(line):\(contract.side)", player: player,
                            category: market.category, title: label, prices: latest)
                    }
                }
            }
        }
    }

    private var filtered: [Row] {
        let matches = rows.filter { row in
            (category == nil || row.category == category) && (team == nil || canonicalTeam(row.player.team) == team) &&
            (book == nil || row.prices.contains { $0.book == book }) &&
            (query.isEmpty || "\(row.player.name) \(row.player.team) \(row.title)".localizedStandardContains(query))
        }
        return matches.sorted {
            if let first = $0.picks, let second = $1.picks, first != second { return first > second }
            let name = $0.player.name.localizedStandardCompare($1.player.name)
            return name == .orderedSame ? $0.title < $1.title : name == .orderedAscending
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if denied {
                ContentUnavailableView("Ultimate research", systemImage: "lock", description: Text("Ultimate or NFL early access includes the full research workspace."))
            } else if failed {
                ContentUnavailableView {
                    Label("\(tool.rawValue) couldn’t load", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("Retry") { retry += 1 }
                }
            } else if let data {
                controls
                if data.availabilityStale == true {
                    ContentUnavailableView("Checking player availability", systemImage: "clock")
                } else if filtered.isEmpty {
                    ContentUnavailableView("No captured data for these filters", systemImage: "chart.bar")
                } else {
                    let matches = filtered
                    let total = matches.reduce(0) { $0 + ($1.picks ?? 0) }
                    LazyVStack(spacing: 10) {
                        ForEach(matches.prefix(visible)) { row in card(row, total: total) }
                        if matches.count > visible { Button("Show more") { visible += 24 }.buttonStyle(.bordered) }
                    }
                }
            } else {
                ProgressView("Loading \(tool.rawValue)").frame(maxWidth: .infinity).padding()
            }
        }
        .task(id: retry) { await load() }
        .onChange(of: scenePhase) { _, value in if value == .active { retry += 1 } }
    }

    private var controls: some View {
        let categories = Set(rows.map(\.category)).sorted()
        let books = Set(rows.flatMap(\.prices).map(\.book)).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            TextField("Player, team or market", text: $query)
                .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                .submitLabel(.search).frame(minHeight: 44)
            ViewThatFits(in: .horizontal) {
                HStack { teamPicker; categoryPicker(categories); if tool == .sportsbooks { bookPicker(books) } }
                VStack(alignment: .leading) { teamPicker; categoryPicker(categories); if tool == .sportsbooks { bookPicker(books) } }
            }
        }
    }

    private var teamPicker: some View {
        Picker("Team", selection: $team) {
            Text("Both teams").tag(nil as String?)
            ForEach(teams, id: \.code) { Text($0.code).tag(Optional(canonicalTeam($0.code))) }
        }
    }

    private func categoryPicker(_ categories: [String]) -> some View {
        Picker("Market", selection: $category) {
            Text("All markets").tag(nil as String?)
            ForEach(categories, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag(Optional($0)) }
        }
    }

    private func bookPicker(_ books: [String]) -> some View {
        Picker("Sportsbook", selection: $book) {
            Text("All books").tag(nil as String?)
            ForEach(books, id: \.self) { Text(Sportsbook.name($0)).tag(Optional($0)) }
        }
    }

    private func card(_ row: Row, total: Int) -> some View {
        let team = teams.first { canonicalTeam($0.code) == canonicalTeam(row.player.team) }
        let color = team?.primary ?? Brand.accent(for: scheme)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                PlayerArtwork(portraits: (row.player.headshot.map { [$0] } ?? []) + (row.player.headshotFallbacks ?? []),
                    logo: team?.logo, primary: color, secondary: team?.secondary ?? Brand.surface(for: scheme))
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.player.name).font(.headline)
                    Text(row.title).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 5)
                Text(team?.code ?? row.player.team).font(.caption.weight(.semibold))
            }
            if let picks = row.picks {
                HStack {
                    Text("\(picks.formatted()) picks").font(.subheadline.weight(.semibold))
                    Spacer()
                    if total > 0 {
                        Text("\((Double(picks) / Double(total)).formatted(.percent.precision(.fractionLength(1)))) of filtered picks")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if total > 0 { ProgressView(value: Double(picks), total: Double(total)).tint(Brand.accent(for: scheme)) }
                if let stamp = row.observedAt {
                    Text("Recorded \(stamp.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(row.prices.filter { book == nil || $0.book == book }) { item in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack(spacing: 4) {
                                    if let asset = Sportsbook.artwork(item.book) {
                                        Image(asset).resizable().scaledToFit().frame(width: 16, height: 16).accessibilityHidden(true)
                                    }
                                    Text(Sportsbook.name(item.book)).font(.caption2)
                                }
                                Text(item.value > 0 ? "+\(item.value)" : String(item.value)).font(.subheadline.bold()).monospacedDigit()
                                Text(item.stamp.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(8).background(.thinMaterial, in: .rect(cornerRadius: 8))
                        }
                    }
                }
            }
        }
        .padding(13)
        .background {
            LinearGradient(colors: [color.opacity(scheme == .dark ? 0.24 : 0.13), Brand.surface(for: scheme)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(Brand.surface(for: scheme))
        }
        .clipShape(.rect(cornerRadius: 14))
    }

    private func load() async {
        data = nil
        failed = false
        denied = false
        do {
            let response = try await api.marketData(gameID: gameID, date: date)
            let odds = try JSONDecoder().decode(Payload.self, from: response).odds
            try Task.checkCancellation()
            let teamCodes = Set(teams.map { canonicalTeam($0.code) })
            guard odds.players.count <= 160, Set(odds.players.map(\.id)).count == odds.players.count,
                  odds.players.allSatisfy({ teamCodes.contains(canonicalTeam($0.team)) }) else { throw URLError(.cannotParseResponse) }
            data = odds
            if let cutoff = captureCutoff, cutoff > .now {
                try await Task.sleep(for: .seconds(min(60, max(1, cutoff.timeIntervalSinceNow))))
                retry += 1
            }
        } catch let error as SlipSurgeHTTP.Status where [401, 403].contains(error.code) {
            if !Task.isCancelled { denied = true }
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }

    private func canonicalTeam(_ code: String) -> String {
        let aliases = ["LA": "LAR", "JAC": "JAX", "WAS": "WSH", "OAK": "LV", "SD": "LAC", "STL": "LAR"]
        let uppercase = code.uppercased()
        return aliases[uppercase] ?? uppercase
    }
}
