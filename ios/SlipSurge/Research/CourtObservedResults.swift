import SwiftUI

struct CourtObservedResults: Decodable {
    struct Player: Decodable {
        let id: Int
        let played: Bool?
        let values: [String: Double?]

        func stat(_ market: String) -> Double? {
            guard played == true, let value = values[market] ?? nil, value.isFinite, value >= 0 else { return nil }
            return value
        }
    }

    struct Snapshot {
        let gameID: Int
        let data: CourtObservedResults
    }

    let status: String
    let complete: Bool
    let updatedAt: String
    let players: [Player]

    var isFinal: Bool { status == "final" }
    var label: String { isFinal ? "Final" : "Live" }

    func player(_ id: Int) -> Player? { players.first { $0.id == id } }

    static func allowed(game: CourtBoard.Game, mode: CourtResearchMode) -> Bool {
        game.isFinal || mode == .live && game.isInProgress
    }

    static func read(scope: CourtView.Scope, game: CourtBoard.Game, mode: CourtResearchMode) async throws -> Snapshot {
        let result = try await CourtToolAPI(scope: scope).read(Self.self, tool: "results", publicPath: "/the-paint/results",
            query: [.init(name: "game", value: String(game.id)), .init(name: "mode", value: mode.rawValue)])
        guard ["in_progress", "final"].contains(result.status), !game.isFinal || result.isFinal,
              SidelineBoard.timestamp(result.updatedAt) != nil else { throw URLError(.cannotParseResponse) }
        return .init(gameID: game.id, data: result)
    }
}

extension EnvironmentValues {
    @Entry var courtResults: CourtObservedResults.Snapshot?
}

struct CourtResultLine: View {
    let results: CourtObservedResults
    let playerID: Int
    let market: CourtPlayerMarket
    var quote: CourtPlayerMarket.Reference? = nil
    var side = CourtPlayerMarket.Side.over
    @Environment(\.slipPalette) private var slipPalette

    var body: some View {
        let player = results.player(playerID)
        if let actual = player?.stat(market.rawValue) {
            let grade = results.isFinal ? quote.map {
                ResearchGameChart.Result(value: actual, line: $0.line, under: side == .under, milestone: $0.milestone)
            } : nil
            HStack(spacing: 7) {
                Text("\(results.label) · \(market.label)").foregroundStyle(.secondary)
                Spacer(minLength: 4)
                Text(ResearchFormat.decimal(actual)).monospacedDigit()
                if let grade {
                    Label(grade.rawValue, systemImage: grade.icon).foregroundStyle(grade.color(in: slipPalette))
                }
            }.font(.caption.weight(.semibold)).accessibilityElement(children: .combine)
        } else if results.isFinal && player?.played == false {
            Label("Did not play", systemImage: "person.crop.circle.badge.minus").font(.caption).foregroundStyle(.secondary)
        }
    }
}
