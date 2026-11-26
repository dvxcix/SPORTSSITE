import SwiftUI

struct AdminMlbArchiveView: View {
    struct Selection: Hashable {
        var date: String?
        var game: String?
        var frame: String?

        var query: [URLQueryItem] {
            [("date", date), ("game", game), ("frame", frame)].compactMap { item in
                item.1.map { URLQueryItem(name: item.0, value: $0) }
            }
        }
    }

    private struct LoadKey: Hashable { let selection: Selection; let retry: Int }

    private struct Archive: Decodable {
        struct Game: Decodable, Identifiable {
            let id: String
            let home: String?
            let away: String?
            let homeLogo: URL?
            let awayLogo: URL?

            var option: ResearchArtworkPicker.Option {
                .init(id: id, title: "\(away ?? "Away") at \(home ?? "Home")", url: awayLogo, secondaryLogo: homeLogo, icon: "baseball")
            }
        }

        struct Frame: Decodable, Identifiable {
            let id: Int64
            let capturedAt: String
        }

        struct Quotes: Decodable {
            struct Value: Decodable, Identifiable {
                let player: String
                let playerKey: String
                let market: String
                let book: String
                let value: String
                var id: String { "\(playerKey)\u{0}\(market)\u{0}\(book)" }
            }
            let rows: [Value]
            let truncated: Bool
        }

        struct Research: Decodable {
            let observedAt: String
            let source: String
            let content: String?
        }

        let date: String
        let latestDate: String?
        let cutoff: String?
        let games: [Game]
        let selectedGame: String?
        let selectedFrame: Int64?
        let frames: [Frame]
        let quotes: Quotes
        let research: Research?
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var selection: Selection
    @State private var archive: Archive?
    @State private var issue: (any Error)?
    @State private var loading = false
    @State private var revision = 0
    @State private var search = ""

    private static let path = "/api/mobile/admin/mlb-archive"
    private static let easternTimestamp: Date.FormatStyle = {
        var format = Date.FormatStyle(date: .abbreviated, time: .shortened)
        format.timeZone = SlateDate.zone
        return format
    }()

    init(api: DiscoverAPI, selection: Selection = .init()) {
        self.api = api
        _selection = State(initialValue: selection)
    }

    var body: some View {
        List {
            filters
            if let archive {
                observations(archive)
            } else {
                ResearchToolMessage(title: "MLB archive couldn’t load", error: issue) { revision += 1 }
            }
        }
        .navigationTitle("MLB archive")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Player, market or sportsbook")
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .tint(slipPalette.accent)
        .task(id: LoadKey(selection: selection, retry: revision)) { await load(selection) }
        .refreshable { await load(selection) }
    }

    private var filters: some View {
        Section("Saved pregame observations") {
            DatePicker("Slate date", selection: Binding(get: {
                (selection.date ?? archive?.date).flatMap(SlateDate.fromKey) ?? .now
            }, set: { date in
                selection = .init(date: SlateDate.key(date))
            }), displayedComponents: .date)
            .environment(\.timeZone, SlateDate.zone)
            if let latest = archive?.latestDate, latest != archive?.date {
                Button("Latest archived slate", systemImage: "calendar.badge.clock") { selection = .init(date: latest) }
            }
            if let archive, !archive.games.isEmpty {
                ResearchArtworkPicker(title: "Saved games", options: archive.games.map(\.option), selection: Binding(get: {
                    archive.selectedGame ?? ""
                }, set: { game in
                    selection = .init(date: archive.date, game: game)
                }))
                .disabled(loading)
                if !archive.frames.isEmpty {
                    Picker("Captured observation", selection: Binding(get: { archive.selectedFrame }, set: { frame in
                        selection = .init(date: archive.date, game: archive.selectedGame, frame: frame.map(String.init))
                    })) {
                        ForEach(archive.frames) { frame in
                            Text(timestamp(frame.capturedAt)).tag(Optional(frame.id))
                        }
                    }
                    .disabled(loading)
                }
            }
        }
    }

    @ViewBuilder private func observations(_ data: Archive) -> some View {
        if data.games.isEmpty {
            ContentUnavailableView("No archived games", systemImage: "calendar", description: Text("Choose a date with a saved pregame slate."))
        } else if let cutoff = data.cutoff {
            Section {
                LabeledContent("Saved pregame cutoff", value: timestamp(cutoff))
                if let frame = data.frames.first(where: { $0.id == data.selectedFrame }) {
                    LabeledContent("Captured", value: timestamp(frame.capturedAt))
                }
            }
            if let research = data.research {
                Section {
                    NavigationLink {
                        SavedResearchInput(research: research)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Saved research inputs")
                            Text(timestamp(research.observedAt)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } else {
                Text("No pregame research snapshot was saved for this game.").font(.footnote).foregroundStyle(.secondary)
            }
            quotes(data)
        } else {
            ContentUnavailableView("Saved cutoff unavailable", systemImage: "clock.badge.xmark",
                description: Text("This game has no verified pregame cutoff in the archive."))
        }
    }

    private func quotes(_ data: Archive) -> some View {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = data.quotes.rows.filter { quote in
            term.isEmpty || [quote.player, quote.market, quote.book, Sportsbook.name(Sportsbook.normalized(quote.book))]
                .contains { $0.localizedCaseInsensitiveContains(term) }
        }
        return Section {
            if data.frames.isEmpty {
                Text("No price observations were saved before the cutoff.").foregroundStyle(.secondary)
            } else if data.quotes.rows.isEmpty {
                Text("This observation has no displayable market values.").foregroundStyle(.secondary)
            } else if rows.isEmpty {
                ContentUnavailableView.search(text: term)
            } else {
                ForEach(rows) { quote in
                    HStack(spacing: 9) {
                        ProfileSportsbookLogo(key: quote.book, size: 23)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(quote.player).font(.subheadline.weight(.semibold))
                            Text("\(quote.market) · \(Sportsbook.name(Sportsbook.normalized(quote.book)))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 4)
                        Text(verbatim: quote.value).font(.subheadline.monospacedDigit().bold()).multilineTextAlignment(.trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        } header: {
            Text("Saved values")
        } footer: {
            if data.quotes.truncated { Text("Showing the first 1,500 saved values.") }
        }
    }

    private func timestamp(_ raw: String) -> String {
        guard let date = SidelineBoard.timestamp(raw) else { return raw }
        return date.formatted(Self.easternTimestamp) + " ET"
    }

    private func load(_ requested: Selection) async {
        guard !Task.isCancelled else { return }
        loading = true
        archive = nil
        issue = nil
        defer { if requested == selection { loading = false } }
        do {
            let response = try await api.memberRead(Archive.self, path: Self.path, query: requested.query)
            try Task.checkCancellation()
            guard requested == selection else { return }
            archive = response
        } catch is CancellationError {
            return
        } catch {
            if requested == selection { issue = error }
        }
    }

    private struct SavedResearchInput: View {
        let research: Archive.Research

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    LabeledContent("Source", value: research.source == "recovered-cache" ? "Recovered cache" : "Saved capture")
                    if let content = research.content {
                        Text(verbatim: content).font(.caption.monospaced()).textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ContentUnavailableView("Snapshot is too large to display", systemImage: "doc.text.magnifyingglass")
                    }
                }
                .padding(14)
            }
            .navigationTitle("Saved research inputs")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
