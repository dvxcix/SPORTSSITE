import Charts
import SwiftUI

struct CourtMovementView: View {
    private enum Direction: String, CaseIterable {
        case all = "All movement", up = "Line rising", down = "Line falling", shorter = "Odds shortening", longer = "Odds lengthening"
    }

    private enum Sort: String, CaseIterable {
        case absolute = "Largest price move", shortened = "Most shortened", lengthened = "Most lengthened"
        case line = "Largest line move", name = "Player name"
    }

    private struct Payload: Decodable {
        struct Row: Decodable, Identifiable {
            struct Point: Decodable, Identifiable {
                let at: String
                let line: Double
                let price: Int?
                var id: String { at }
            }

            let playerId: Int
            let line: Double
            let firstLine: Double?
            let lineChange: Double?
            let movement: Double?
            let openingKnown: Bool
            let firstPrice: Int?
            let firstAt: String?
            let price: Int?
            let points: [Point]
            var id: String { "\(playerId):\(line)" }
        }

        let gameId: Int
        let market: String
        let mode: CourtResearchMode
        let book: String
        let side: String
        let contract: CourtLinkContext.Contract
        let captures: [String]
        let selectedAt: String?
        let books: [String]
        let targets: [Double]
        let rows: [Row]
    }

    private struct Request: Equatable {
        let market: CourtPlayerMarket
        let book: String
        let side: CourtPlayerMarket.Side
        let contract: CourtLinkContext.Contract
        let target: Double?
        let capture: String?
        let revision: Int
    }

    let scope: CourtView.Scope
    let game: CourtBoard.Game
    let mode: CourtResearchMode
    let players: [CourtBoard.Player]
    let playerID: Int?
    @Environment(\.colorScheme) private var scheme
    @State private var market: CourtPlayerMarket
    @State private var side: CourtPlayerMarket.Side
    @State private var book: String
    @State private var contract: CourtLinkContext.Contract
    @State private var target: Double?
    @State private var capture: String?
    @State private var direction = Direction.all
    @State private var sort = Sort.absolute
    @State private var minimum = 0.0
    @State private var response: (Request, Payload)?
    @State private var error: (Request, any Error)?
    @State private var retry = 0

    init(scope: CourtView.Scope, game: CourtBoard.Game, mode: CourtResearchMode, players: [CourtBoard.Player],
        initialMarket: CourtPlayerMarket, initialSide: CourtPlayerMarket.Side, initialBook: String?,
        initialContract: CourtLinkContext.Contract?, initialTarget: Double?, playerID: Int? = nil) {
        self.scope = scope
        self.game = game
        self.mode = mode
        self.players = players
        self.playerID = playerID
        _market = State(initialValue: initialMarket)
        _side = State(initialValue: initialSide)
        _book = State(initialValue: initialBook.flatMap { $0 == "all" || $0.isEmpty ? nil : $0 } ?? "fanduel")
        _contract = State(initialValue: initialSide == .under ? .standard : initialContract ?? .milestone)
        _target = State(initialValue: initialTarget)
    }

    private var request: Request {
        .init(market: market, book: book, side: contract == .milestone ? .over : side, contract: contract,
            target: target, capture: capture, revision: retry)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if playerID == nil { ResearchSectionTitle(title: "Market Story") }
            controls
            if let captures = response?.1.captures, !captures.isEmpty { replay(captures) }
            if let response, response.0 == request {
                results(response.1)
            } else {
                ResearchToolMessage(title: "Market history couldn’t load",
                    error: error.flatMap { $0.0 == request ? $0.1 : nil }) { retry += 1 }
            }
        }
        .task(id: request) { await load(request) }
        .refreshable { retry += 1 }
    }

    private var controls: some View {
        let availableBooks = Set((response?.1.books ?? []) + [book]).sorted()
        let targets = Set((response?.1.targets ?? []) + (target.map { [$0] } ?? [])).sorted()
        return VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ResearchToolFilter(title: "Market", selection: market.label) {
                        Picker("Market", selection: $market) {
                            ForEach(CourtPlayerMarket.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    SportsbookPicker(books: availableBooks, selection: $book)
                    ResearchToolFilter(title: "Line", selection: target.map { $0.formatted() } ?? "All lines") {
                        Picker("Line", selection: $target) {
                            Text("All lines").tag(nil as Double?)
                            ForEach(targets, id: \.self) { Text($0.formatted()).tag(Optional($0)) }
                        }
                    }
                }.padding(.vertical, 2)
            }.scrollIndicators(.hidden)
            Picker("Contract", selection: $contract) {
                ForEach(CourtLinkContext.Contract.allCases, id: \.self) { Text($0.label).tag($0) }
            }.pickerStyle(.segmented)
            if contract == .standard {
                Picker("Side", selection: $side) {
                    ForEach(CourtPlayerMarket.Side.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.segmented)
            }
            if playerID == nil {
                Menu("Movement filters", systemImage: "line.3.horizontal.decrease") {
                    Picker("Direction", selection: $direction) {
                        ForEach(Direction.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Sort", selection: $sort) {
                        ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    Picker("Minimum change", selection: $minimum) {
                        ForEach([0.0, 0.25, 1, 2, 5], id: \.self) { Text("\($0.formatted()) pp").tag($0) }
                    }
                }.frame(minHeight: 44)
            }
        }
        .onChange(of: market) { target = nil; capture = nil }
        .onChange(of: contract) { target = nil; direction = .all }
    }

    private func replay(_ captures: [String]) -> some View {
        let index = capture.flatMap { captures.firstIndex(of: $0) } ?? captures.count - 1
        return HStack {
            Button("Previous capture", systemImage: "chevron.left") { capture = captures[index - 1] }
                .labelStyle(.iconOnly).disabled(index == 0).frame(minWidth: 44, minHeight: 44)
            Picker("Capture", selection: $capture) {
                Text("Latest capture").tag(nil as String?)
                ForEach(captures.dropLast().reversed(), id: \.self) { Text(displayTime($0)).tag(Optional($0)) }
            }.frame(maxWidth: .infinity)
            Button("Next capture", systemImage: "chevron.right") {
                capture = index == captures.count - 2 ? nil : captures[index + 1]
            }
            .labelStyle(.iconOnly).disabled(index >= captures.count - 1).frame(minWidth: 44, minHeight: 44)
        }
        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
        .accessibilityHint("Capture \(index + 1) of \(captures.count)")
    }

    @ViewBuilder private func results(_ payload: Payload) -> some View {
        let roster = Dictionary(players.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = payload.rows.filter { row in
            guard roster[row.playerId] != nil, minimum == 0 || abs(row.movement ?? 0) >= minimum else { return false }
            return switch direction {
            case .all: true
            case .up: (row.lineChange ?? 0) > 0
            case .down: (row.lineChange ?? 0) < 0
            case .shorter: (row.movement ?? 0) > 0
            case .longer: (row.movement ?? 0) < 0
            }
        }.sorted { first, second in
            if sort == .name, let a = roster[first.playerId], let b = roster[second.playerId], a.lastName != b.lastName {
                return a.lastName.localizedStandardCompare(b.lastName) == .orderedAscending
            }
            let a = sortValue(first), b = sortValue(second)
            if a != b { return a > b }
            return (first.playerId, first.line) < (second.playerId, second.line)
        }
        if rows.isEmpty {
            ContentUnavailableView("No recorded movement for this selection", systemImage: "chart.line.uptrend.xyaxis")
        } else {
            if let at = payload.selectedAt {
                Label(displayTime(at), systemImage: "clock").font(.caption).foregroundStyle(.secondary)
            }
            LazyVStack(spacing: 8) {
                ForEach(rows) { row in
                    if let player = roster[row.playerId] { card(row, player: player) }
                }
            }
        }
    }

    private func sortValue(_ row: Payload.Row) -> Double {
        switch sort {
        case .absolute: row.movement.map(abs) ?? -.infinity
        case .shortened: row.movement ?? -.infinity
        case .lengthened: row.movement.map { -$0 } ?? -.infinity
        case .line: row.lineChange.map(abs) ?? -.infinity
        case .name: 0
        }
    }

    private func card(_ row: Payload.Row, player: CourtBoard.Player) -> some View {
        let palette = CourtTeamColors.colors(for: player.team.abbreviation)
        let line = contract == .milestone ? "\(row.line.formatted())+" : row.line.formatted()
        return ResearchToolCard(color: palette.primary) {
            if playerID == nil { CourtPlayerIdentity(player: player) }
            else { Text(line).font(.headline) }
        } content: {
            ResearchToolValues(items: [
                .init(label: "Line", text: line),
                .init(label: "Latest price", text: ResearchFormat.price(row.price)),
                .init(label: row.openingKnown ? "Opening" : "First observed", text: ResearchFormat.price(row.firstPrice)),
                .init(label: "Price move", text: ResearchFormat.points(row.movement),
                    tone: Brand.signal(row.movement, for: scheme)),
            ])
            if contract == .standard, let first = row.firstLine, let move = row.lineChange {
                Label("\(first.formatted()) → \(row.line.formatted())", systemImage: move < 0 ? "arrow.down.right" : "arrow.up.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(Brand.signal(move, for: scheme))
            }
            if let first = row.firstAt { Text(displayTime(first)).font(.caption).foregroundStyle(.secondary) }
            if row.points.count > 1 {
                Chart(row.points) { point in
                    if let date = SidelineBoard.timestamp(point.at),
                       let value = contract == .milestone ? point.price.map(probability) : point.line {
                        PointMark(x: .value("Capture", date), y: .value("Observed", value))
                            .foregroundStyle(Brand.accent(for: scheme))
                            .accessibilityValue(value.formatted())
                    }
                }
                .frame(height: 136)
                .accessibilityLabel(contract == .milestone ? "Observed implied probability percent" : "Observed line")
            }
        }
    }

    private func probability(_ price: Int) -> Double {
        let value = Double(price)
        return (value > 0 ? 100 / (100 + value) : -value / (100 - value)) * 100
    }

    private func displayTime(_ value: String) -> String {
        SidelineBoard.timestamp(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
    }

    private func load(_ wanted: Request) async {
        do {
            var query: [URLQueryItem] = [.init(name: "game", value: String(game.id)), .init(name: "mode", value: mode.rawValue),
                .init(name: "market", value: wanted.market.rawValue), .init(name: "book", value: wanted.book),
                .init(name: "side", value: wanted.side.rawValue.lowercased()), .init(name: "contract", value: wanted.contract.rawValue)]
            if let playerID { query.append(.init(name: "player", value: String(playerID))) }
            if let line = wanted.target { query.append(.init(name: "target", value: String(line))) }
            if let at = wanted.capture { query.append(.init(name: "capture", value: at)) }
            let payload = try await CourtToolAPI(scope: scope).read(Payload.self, tool: "movement", query: query)
            try Task.checkCancellation()
            guard wanted == request, payload.gameId == game.id, payload.market == wanted.market.rawValue,
                  payload.book == wanted.book, payload.contract == wanted.contract, payload.mode == mode,
                  payload.side == wanted.side.rawValue.lowercased(),
                  payload.rows.allSatisfy({ playerID == nil || $0.playerId == playerID }) else { return }
            response = (wanted, payload)
            error = nil
        } catch {
            if !Task.isCancelled, wanted == request { self.error = (wanted, error) }
        }
    }
}
