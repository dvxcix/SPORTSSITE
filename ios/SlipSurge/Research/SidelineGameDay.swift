import SwiftUI

struct SidelineGameDay: View {
    let api: SidelineAPI
    let gameID: String
    let away: String
    let home: String
    let date: String
    @Environment(\.scenePhase) private var scenePhase
    @State private var offers: [GameMarketBook]?
    @State private var unavailable = false
    @State private var retry = 0

    var body: some View {
        Group {
            if let offers {
                GameMarkets(away: away, home: home, offers: offers)
            } else if unavailable {
                VStack(alignment: .leading, spacing: 8) {
                    ResearchSectionTitle(title: "Game markets")
                    Text("Game lines couldn’t load.").foregroundStyle(.secondary)
                    Button("Retry") { retry += 1 }.buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ProgressView("Loading game markets")
                    .frame(maxWidth: .infinity)
                    .padding()
            }
        }
        .task(id: retry) { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { retry += 1 }
        }
    }

    private func load() async {
        unavailable = false
        offers = nil
        do {
            let observation = try await api.gameMarkets(gameID: gameID, date: date)
            try Task.checkCancellation()
            offers = observation.offers
            if let cutoff = observation.cutoff, cutoff > .now {
                try await Task.sleep(for: .seconds(max(0, cutoff.timeIntervalSinceNow)))
                retry += 1
            }
        } catch {
            if !Task.isCancelled { unavailable = true }
        }
    }
}
