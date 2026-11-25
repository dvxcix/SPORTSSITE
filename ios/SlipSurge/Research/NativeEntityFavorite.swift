import SwiftUI

struct NativeEntityFavorite: View {
    enum Target {
        case team(String)
        case player(NativeOnboarding.Player)

        func includes(_ current: AccountFavoritesData) -> Bool {
            switch self {
            case .team(let key): current.teamKeys.contains(key)
            case .player(let player): current.players.contains { $0.favoriteKey == player.favoriteKey }
            }
        }

        func edit(selected: Bool) -> AccountFavoritesData.Edit {
            let action = selected ? "remove" : "add"
            switch self {
            case .team(let key): return .init(action: action, team: key)
            case .player(let player): return .init(action: action, player: player)
            }
        }
    }

    let account: AccountStore
    let userID: UUID
    let target: Target
    @State private var selected: Bool?
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        if let selected {
            Button(selected ? "Favorite" : "Add favorite", systemImage: selected ? "star.fill" : "star") {
                Task { await change(selected) }
            }
            .buttonStyle(.bordered)
            .disabled(busy)
            .sensoryFeedback(.selection, trigger: self.selected)
        } else if failed {
            Button("Retry favorites", systemImage: "arrow.clockwise") { Task { await load() } }.buttonStyle(.bordered)
        } else {
            ProgressView().controlSize(.small).accessibilityLabel("Loading favorites")
                .task { await load() }
        }
    }

    private func load() async {
        do {
            let data = try await SlipSurgeHTTP.memberData(AccountFavoritesData.path, account: account, userID: userID)
            let current = try JSONDecoder().decode(AccountFavoritesData.self, from: data)
            guard !Task.isCancelled, account.memberID == userID else { return }
            selected = target.includes(current)
            failed = false
        } catch {
            if !Task.isCancelled { selected = nil; failed = true }
        }
    }

    private func change(_ current: Bool) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await AccountPrivacyRequest.send(AccountFavoritesData.path, method: "PATCH", account: account,
                userID: userID, body: JSONEncoder().encode(target.edit(selected: current)))
        } catch {
            failed = true
        }
        await load()
    }
}
