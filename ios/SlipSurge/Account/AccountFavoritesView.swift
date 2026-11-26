import SwiftUI

struct AccountFavoritesView: View {
    let account: AccountStore
    let userID: UUID

    @Environment(\.slipPalette) private var slipPalette
    @State private var data: AccountFavoritesData?
    @State private var league = "nfl"
    @State private var choice = Choice.teams
    @State private var filter = ""
    @State private var results: [NativeOnboarding.Player] = []
    @State private var failure: String?
    @State private var searchFailed = false
    @State private var searching = false
    @State private var saving = false
    @State private var sportEditor = false

    private enum Choice: String, CaseIterable { case teams = "Teams", players = "Players" }
    private struct Search: Equatable { let league: String; let filter: String; let choice: Choice }

    var body: some View {
        List {
            if let data {
                controls(data)
                if choice == .teams { teams(data) } else { players(data) }
            } else if failure == nil {
                ProgressView("Loading favorites")
            } else {
                Button("Retry") { Task { await load() } }
            }
            if let failure { Label(failure, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Favorites")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if data != nil { Button("Sports", systemImage: "slider.horizontal.3") { sportEditor = true }.disabled(saving) }
        }
        .sheet(isPresented: $sportEditor) {
            if let data {
                FavoriteSportsEditor(sports: data.sports, allowMLB: data.leagues.contains("mlb")) { sports in
                    try await patch(.init(sports: sports))
                    await load()
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .task(id: Search(league: league, filter: filter, choice: choice)) { await search() }
        .onChange(of: league) { _, _ in resetSearch() }
        .onChange(of: choice) { _, _ in resetSearch() }
    }

    private func controls(_ data: AccountFavoritesData) -> some View {
        Section {
            HStack {
                ResearchArtworkPicker(title: "League", options: data.leagues.map {
                    .init(id: $0, title: $0.uppercased(), url: LeagueArtwork.logo($0), icon: "sportscourt")
                }, selection: $league)
                Spacer(minLength: 8)
                Picker("Favorites", selection: $choice) {
                    ForEach(Choice.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.segmented)
            }
            TextField(choice == .teams ? "Find a team" : "Find a player", text: $filter).autocorrectionDisabled()
        }.listRowBackground(slipPalette.surface)
    }

    private func teams(_ data: AccountFavoritesData) -> some View {
        let matching = data.catalog.filter { $0.sport == league && (filter.isEmpty || $0.name.localizedStandardContains(filter) || $0.abbr.localizedStandardContains(filter)) }
        return Section("Teams") {
            ForEach(matching) { team in
                let selected = data.teamKeys.contains(team.key)
                favoriteButton(name: team.name, subtitle: nil, selected: selected, edit: .init(action: selected ? "remove" : "add", team: team.key)) {
                    ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield").frame(width: 28, height: 28)
                }
            }
            if matching.isEmpty { Text("No matching teams").foregroundStyle(.secondary) }
        }.listRowBackground(slipPalette.surface)
    }

    @ViewBuilder
    private func players(_ data: AccountFavoritesData) -> some View {
        let selected = data.players.filter { $0.favoriteSport == league }
        Section("Saved players · \(selected.count) of 8") {
            ForEach(selected, id: \.favoriteKey) { playerButton($0, data: data, selected: true) }
            if selected.isEmpty { Text("No saved players").foregroundStyle(.secondary) }
        }.listRowBackground(slipPalette.surface)

        if filter.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
            Section("Results") {
                if searching { ProgressView("Searching players") }
                else if searchFailed { Text("Player search couldn’t load.").foregroundStyle(.secondary) }
                else if results.isEmpty { Text("No matching players").foregroundStyle(.secondary) }
                else {
                    ForEach(results, id: \.favoriteKey) { player in
                        let isSelected = selected.contains { $0.favoriteKey == player.favoriteKey }
                        playerButton(player, data: data, selected: isSelected).disabled(selected.count >= 8 && !isSelected)
                    }
                }
            }.listRowBackground(slipPalette.surface)
        }
    }

    private func playerButton(_ player: NativeOnboarding.Player, data: AccountFavoritesData, selected: Bool) -> some View {
        let logo = player.team_logo.flatMap(URL.init(string:)) ?? data.catalog.first {
            $0.sport == player.favoriteSport && ($0.abbr == player.team || $0.name == player.team)
        }?.logo
        return favoriteButton(name: player.name, subtitle: player.team, selected: selected, edit: .init(action: selected ? "remove" : "add", player: player)) {
            PlayerArtwork(portraits: player.favoritePortrait.map { [$0] } ?? [], logo: logo,
                primary: slipPalette.accent.opacity(0.4), secondary: slipPalette.surface)
        }
    }

    private func favoriteButton<Art: View>(name: String, subtitle: String?, selected: Bool, edit: AccountFavoritesData.Edit, @ViewBuilder art: () -> Art) -> some View {
        Button {
            Task { await change(edit) }
        } label: {
            HStack(spacing: 12) {
                art()
                VStack(alignment: .leading) {
                    Text(verbatim: name).foregroundStyle(slipPalette.text)
                    if let subtitle, !subtitle.isEmpty { Text(verbatim: subtitle).font(.footnote).foregroundStyle(.secondary) }
                }
                Spacer()
                Image(systemName: selected ? "star.fill" : "star")
                    .foregroundStyle(selected ? slipPalette.accent : .secondary).accessibilityHidden(true)
            }
        }.accessibilityAddTraits(selected ? .isSelected : []).disabled(saving)
    }

    private func load() async {
        do {
            let bytes = try await SlipSurgeHTTP.memberData(AccountFavoritesData.path, account: account, userID: userID)
            let source = try JSONDecoder().decode(AccountFavoritesData.self, from: bytes)
            if !source.leagues.contains(league), let first = source.leagues.first { league = first }
            data = source
            failure = nil
        } catch { if !Task.isCancelled { failure = "Favorites couldn’t load. Try again." } }
    }

    private func change(_ edit: AccountFavoritesData.Edit) async {
        guard !saving else { return }
        saving = true
        failure = nil
        defer { saving = false }
        do {
            try await patch(edit)
            await load()
        } catch { failure = "The change couldn’t be confirmed. Refresh and try again." }
    }

    private func patch(_ edit: AccountFavoritesData.Edit) async throws {
        _ = try await AccountPrivacyRequest.send(AccountFavoritesData.path, method: "PATCH", account: account, userID: userID, body: JSONEncoder().encode(edit))
    }

    private func resetSearch() {
        filter = ""
        results = []
    }

    private func search() async {
        let sport = league, query = filter.trimmingCharacters(in: .whitespacesAndNewlines)
        results = []
        searching = false
        searchFailed = false
        guard let data, choice == .players, query.count >= 2 else { return }
        searching = true
        do {
            try await Task.sleep(for: .milliseconds(280))
            let players = try await data.search(query, league: sport, account: account, userID: userID)
            try Task.checkCancellation()
            results = players
            searching = false
        } catch {
            if !Task.isCancelled { searchFailed = true; searching = false }
        }
    }
}
