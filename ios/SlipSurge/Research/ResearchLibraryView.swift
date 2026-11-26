import SwiftUI

struct ResearchLibraryView: View {
    enum Section: String, CaseIterable {
        case saved = "Watchlist", compare = "Compare", notes = "Notes", evidence = "Evidence"

        var glyph: String {
            switch self {
            case .saved: "star"
            case .compare: "square.split.2x1"
            case .notes: "note.text"
            case .evidence: "square.stack"
            }
        }
    }

    let api: ResearchLibraryAPI
    var initialSection: Section
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var section = Section.saved
    @State private var data: ResearchLibraryData?
    @AppStorage private var selectedWorkspace: String
    @State private var drafts: [String: Selection]
    @State private var loadID: UUID?
    @State private var selectionWithoutWorkspace = Selection()
    @State private var searching = ""
    @State private var error: (any Error)?
    @State private var revision = 0
    @State private var busy = false
    @State private var savingWorkspace: String?
    @State private var newWorkspace = false
    @State private var name = ""
    @State private var creatingID = UUID()
    @State private var note: DraftNote?
    @State private var removingNote: ResearchLibraryData.Note?
    @State private var removingMarket: ResearchLibraryData.SavedMarket?
    @State private var deleteWorkspace = false
    @State private var notice: String?

    private struct Selection: Codable, Equatable {
        var items: [UUID] = []
        var nfl: Set<UUID> = []
        var mlb: Set<UUID> = []

        init() {}

        init(_ workspace: ResearchLibraryData.Workspace, in library: ResearchLibraryData) {
            items = Array(workspace.watchlistItemIds.prefix(4))
            nfl = Set(workspace.nflMatrixIds)
            mlb = Set(workspace.mlbMatrixIds)
            retainAvailable(in: library)
        }

        mutating func retainAvailable(in library: ResearchLibraryData) {
            let available = Set(library.items.map(\.id))
            items.removeAll { !available.contains($0) }
            nfl.formIntersection(library.nflMatrices.map(\.id))
            mlb.formIntersection(library.mlbMatrices.map(\.id))
        }
    }

    init(api: ResearchLibraryAPI, initialSection: Section = .saved) {
        self.api = api
        self.initialSection = initialSection
        _selectedWorkspace = AppStorage(wrappedValue: "", Self.storageKey("selection", for: api.userID))
        let stored = UserDefaults.standard.data(forKey: Self.storageKey("drafts", for: api.userID))
        _drafts = State(initialValue: stored.flatMap { try? JSONDecoder().decode([String: Selection].self, from: $0) } ?? [:])
    }

    private static func storageKey(_ kind: String, for userID: UUID) -> String {
        "slipsurge.workspace.\(kind).\(userID.uuidString)"
    }

    private func storeDrafts() {
        let key = Self.storageKey("drafts", for: api.userID)
        if drafts.isEmpty { UserDefaults.standard.removeObject(forKey: key) }
        else if let encoded = try? JSONEncoder().encode(drafts) { UserDefaults.standard.set(encoded, forKey: key) }
    }

    private struct DraftNote: Identifiable {
        let id: UUID
        let original: ResearchLibraryData.Note?
        init(_ original: ResearchLibraryData.Note? = nil) { id = original?.id ?? UUID(); self.original = original }
    }

    private var workspace: ResearchLibraryData.Workspace? {
        data?.workspaces.first { $0.id.uuidString.lowercased() == selectedWorkspace }
    }

    private var selection: Selection {
        get {
            guard let data, let workspace else { return selectionWithoutWorkspace }
            return drafts[key(workspace.id)] ?? Selection(workspace, in: data)
        }
        nonmutating set {
            guard let data, let workspace else { selectionWithoutWorkspace = newValue; return }
            let id = key(workspace.id)
            drafts[id] = savingWorkspace != id && newValue == Selection(workspace, in: data) ? nil : newValue
            storeDrafts()
        }
    }

    private var selected: [UUID] { selection.items }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let data {
                    ResearchToolRail(title: "Saved research", choices: Section.allCases, selection: $section, label: \.rawValue, glyph: \.glyph, compact: true)
                    if section != .notes { workspaceControls(data.workspaces) }
                    if error != nil {
                        Button("Retry Workspace refresh", systemImage: "arrow.clockwise") { revision += 1 }
                            .buttonStyle(.bordered)
                    }
                    if let notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                    switch section {
                    case .saved: watchlist(data.items)
                    case .compare: comparison(data)
                    case .notes: notes(data.notes)
                    case .evidence: evidence(data.evidence)
                    }
                } else {
                    ResearchToolMessage(title: "Saved research couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .navigationTitle("Workspace")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
        .onAppear { if data == nil { section = initialSection } }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .alert("New workspace", isPresented: $newWorkspace) {
            TextField("Name", text: $name)
            Button("Cancel", role: .cancel) { name = ""; creatingID = UUID() }
            Button("Create") { Task { await createWorkspace() } }
        }
        .confirmationDialog("Delete workspace?", isPresented: $deleteWorkspace, titleVisibility: .visible) {
            if let workspace { Button("Delete \(workspace.name)", role: .destructive) { Task { await save(.init(kind: "workspace-delete", id: key(workspace.id))) } } }
        } message: { Text("Your saved markets and private notes will remain.") }
        .confirmationDialog("Delete note?", isPresented: Binding(get: { removingNote != nil }, set: { if !$0 { removingNote = nil } }), presenting: removingNote) { note in
            Button("Delete \(note.title)", role: .destructive) { Task { await save(.init(kind: "note-delete", id: key(note.id))) } }
        }
        .confirmationDialog("Remove from Watchlist?", isPresented: Binding(get: { removingMarket != nil }, set: { if !$0 { removingMarket = nil } }), presenting: removingMarket) { market in
            Button("Remove \(market.playerName)", role: .destructive) { Task { await save(.init(kind: "watchlist-delete", id: key(market.id))) } }
        }
        .sheet(item: $note) { note in
            ResearchNoteEditor(original: note.original, showMlb: data?.showMlb == true) { title, body, sport in
                let game = selected.count == 1 ? data?.items.first { $0.id == selected.first }?.gamePk : nil
                try await api.mutate(.init(kind: note.original == nil ? "note-create" : "note-edit", id: key(note.id),
                    title: title, body: body, sport: sport, game: game))
                await load()
            }
        }
    }

    private func workspaceControls(_ workspaces: [ResearchLibraryData.Workspace]) -> some View {
        HStack(spacing: 7) {
            if !workspaces.isEmpty {
                ResearchArtworkPicker(title: "Workspace", options: workspaces.map {
                    .init(id: key($0.id), title: $0.name, icon: $0.userId == api.userID ? "square.grid.2x2" : "person.2")
                }, selection: $selectedWorkspace)
            }
            Spacer(minLength: 0)
            Button("New workspace", systemImage: "plus") { newWorkspace = true }
                .labelStyle(.iconOnly).buttonStyle(.bordered).controlSize(.large).disabled(busy)
            if let workspace {
                NavigationLink {
                    ResearchCollaborationView(api: api, workspace: workspace)
                } label: { Label("Collaborate", systemImage: "person.2") }
                    .labelStyle(.iconOnly).buttonStyle(.bordered).controlSize(.large)
                if workspace.userId == api.userID {
                    Button("Delete workspace", systemImage: "trash", role: .destructive) { deleteWorkspace = true }
                        .labelStyle(.iconOnly).buttonStyle(.bordered).controlSize(.large).disabled(busy)
                }
            }
        }
    }

    @ViewBuilder
    private func watchlist(_ markets: [ResearchLibraryData.SavedMarket]) -> some View {
        TextField("Find a saved market", text: $searching).textFieldStyle(.roundedBorder).autocorrectionDisabled()
        let visible = markets.filter { item in
            searching.isEmpty || [item.playerName, item.team, item.sport, item.propLabel, item.book].compactMap { $0 }
                .contains { $0.localizedStandardContains(searching) }
        }
        if visible.isEmpty { ContentUnavailableView("No saved markets", systemImage: "star") }
        ForEach(visible) { market in
            marketCard(market, canRemove: true)
                .contextMenu {
                    Button("Remove from Watchlist", systemImage: "star.slash", role: .destructive) { removingMarket = market }
                }
        }
    }

    @ViewBuilder
    private func comparison(_ library: ResearchLibraryData) -> some View {
        if selected.isEmpty { ContentUnavailableView("No markets selected", systemImage: "square.split.2x1", description: Text("Add up to four markets from Watchlist.")) }
        ForEach(selected.compactMap { id in library.items.first { $0.id == id } }) { market in marketCard(market) }
        if !library.nflMatrices.isEmpty || !library.mlbMatrices.isEmpty {
            ResearchToolCard(color: slipPalette.accent) { Text("Attached Matrices").font(.headline) } content: {
                ForEach(library.nflMatrices) { matrix in matrixToggle(matrix, league: "NFL", field: \.nfl) }
                ForEach(library.mlbMatrices) { matrix in matrixToggle(matrix, league: "MLB", field: \.mlb) }
            }
        }
        if let workspace, workspace.canEdit {
            let hasChanges = drafts[key(workspace.id)] != nil
            if hasChanges {
                Text("Unsaved changes").font(.caption.weight(.medium)).foregroundStyle(.secondary)
            }
            Button("Save comparison", systemImage: "checkmark") {
                Task {
                    let submitted = selection
                    let id = key(workspace.id)
                    let change = ResearchLibraryAPI.Change(kind: "workspace-save", id: id,
                        items: submitted.items.map(key), baseline: Selection(workspace, in: library).items.map(key),
                        nfl: submitted.nfl.map(key).sorted(), mlb: submitted.mlb.map(key).sorted(), updatedAt: workspace.updatedAt)
                    await save(change)
                }
            }
            .buttonStyle(.bordered)
            .disabled(busy || !hasChanges)
        }
    }

    private func matrixToggle(_ matrix: ResearchLibraryData.Matrix, league: String, field: WritableKeyPath<Selection, Set<UUID>>) -> some View {
        Toggle(isOn: Binding(get: { selection[keyPath: field].contains(matrix.id) }, set: {
            if $0 { selection[keyPath: field].insert(matrix.id) } else { selection[keyPath: field].remove(matrix.id) }
        })) {
            HStack {
                ResearchArtwork(urls: LeagueArtwork.logo(league).map { [$0] } ?? [], fallback: "square.grid.3x3").frame(width: 24, height: 24)
                Text(matrix.name)
            }
        }.disabled(workspace?.canEdit != true || busy)
    }

    private func marketCard(_ market: ResearchLibraryData.SavedMarket, canRemove: Bool = false) -> some View {
        let colors = (market.colors ?? []).compactMap { Color(hex: $0) }
        let primary = colors.first ?? slipPalette.accent, secondary = colors.dropFirst().first ?? slipPalette.surface
        let included = selected.contains(market.id)
        let line = market.line.flatMap { $0.isEmpty ? nil : $0 } ?? market.propLabel
        let selectedBook = market.book.map(Sportsbook.normalized)
        let alternateOffers = market.offers.filter {
            Sportsbook.normalized($0.book) != selectedBook || market.odds.map(Double.init) != $0.price
        }
        return ResearchToolCard(color: primary) {
            HStack {
                ResearchToolPortrait(name: market.playerName, subtitle: [market.team, line].compactMap { $0 }.joined(separator: " · "),
                    portraits: [market.headshotUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), teamLogo: market.teamLogo, primary: primary, secondary: secondary)
                Spacer(minLength: 4)
                Button(included ? "Remove from comparison" : "Add to comparison", systemImage: included ? "minus.circle" : "plus.circle") {
                    if included { selection.items.removeAll { $0 == market.id } }
                    else if selected.count < 4 { selection.items.append(market.id) }
                }.labelStyle(.iconOnly).buttonStyle(.bordered).disabled(workspace?.canEdit == false || !included && selected.count >= 4)
                if canRemove {
                    Menu("Saved market actions", systemImage: "ellipsis") {
                        Button("Remove from Watchlist", systemImage: "star.slash", role: .destructive) { removingMarket = market }
                    }.labelStyle(.iconOnly).buttonStyle(.borderless)
                }
            }
        } content: {
            if let book = market.book { ResearchToolBook(book: Sportsbook.normalized(book), price: market.odds) }
            if let date = market.gameDate.flatMap(SlateDate.fromKey) { Text(SlateDate.label(date, year: true)).font(.caption).foregroundStyle(.secondary) }
            if !alternateOffers.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(alternateOffers) { offer in
                            ResearchToolBook(book: Sportsbook.normalized(offer.book), price: offer.price.rounded().isWithinInt ? Int(offer.price.rounded()) : nil)
                        }
                    }
                }.scrollIndicators(.hidden)
            }
            if let notes = market.notes, !notes.isEmpty { Text(verbatim: notes).font(.caption).foregroundStyle(.secondary) }
        }
    }

    @ViewBuilder
    private func notes(_ notes: [ResearchLibraryData.Note]) -> some View {
        Button("New note", systemImage: "square.and.pencil") { note = DraftNote() }.buttonStyle(.borderedProminent)
        if notes.isEmpty { ContentUnavailableView("No notes", systemImage: "note.text") }
        ForEach(notes) { entry in
            ResearchToolCard(color: slipPalette.accent) {
                HStack {
                    if entry.pinned { Image(systemName: "pin.fill").accessibilityLabel("Pinned") }
                    Text(entry.title).font(.headline)
                    Spacer()
                    Menu("Note actions", systemImage: "ellipsis") {
                        Button("Edit", systemImage: "pencil") { note = DraftNote(entry) }
                        Button(entry.pinned ? "Unpin" : "Pin", systemImage: entry.pinned ? "pin.slash" : "pin") {
                            Task { await save(.init(kind: "note-pin", id: key(entry.id), enabled: !entry.pinned)) }
                        }
                        Button("Delete", systemImage: "trash", role: .destructive) { removingNote = entry }
                    }.labelStyle(.iconOnly)
                }
            } content: { Text(verbatim: entry.body).font(.subheadline) }
        }
    }

    @ViewBuilder
    private func evidence(_ entries: [ResearchLibraryData.Evidence]) -> some View {
        let visible = entries.filter { $0.workspaceId == workspace?.id }
        if visible.isEmpty { ContentUnavailableView("No captured evidence", systemImage: "square.stack") }
        ForEach(visible) { item in
            ResearchToolCard(color: slipPalette.accent) {
                Label {
                    Text(item.title).font(.headline)
                } icon: {
                    ResearchArtwork(urls: item.teamLogo.map { [$0] } ?? [], fallback: "shield").frame(width: 20, height: 20)
                }
            } content: {
                Text(item.name).font(.subheadline)
                if let date = SidelineBoard.timestamp(item.capturedAt) { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) }
                ResearchToolValues(items: [
                    .init(label: "SlipSurge Score", text: ResearchFormat.decimal(item.score)),
                    .init(label: "MM", text: ResearchFormat.signedDecimal(item.mm), tone: Brand.signal(item.mm, for: scheme)),
                ])
            }
        }
    }

    private func key(_ id: UUID) -> String { id.uuidString.lowercased() }

    private func load() async {
        let request = UUID()
        loadID = request
        do {
            let result = try await api.load()
            try Task.checkCancellation()
            guard loadID == request else { return }
            let previousDrafts = drafts
            for (id, var draft) in previousDrafts {
                guard let row = result.workspaces.first(where: { key($0.id) == id }), row.canEdit else {
                    drafts[id] = nil
                    continue
                }
                draft.retainAvailable(in: result)
                drafts[id] = draft == Selection(row, in: result) ? nil : draft
            }
            if drafts != previousDrafts { storeDrafts() }
            selectionWithoutWorkspace.retainAvailable(in: result)
            data = result
            if workspace == nil { selectedWorkspace = result.workspaces.first.map { key($0.id) } ?? "" }
            error = nil
        } catch {
            if !Task.isCancelled, loadID == request { self.error = error }
        }
    }

    private func createWorkspace() async {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let current = creatingID
        if await save(.init(kind: "workspace-create", id: key(current), title: name)) {
            selectedWorkspace = key(current)
            name = ""
            creatingID = UUID()
        }
    }

    @discardableResult
    private func save(_ change: ResearchLibraryAPI.Change) async -> Bool {
        guard !busy else { return false }
        busy = true
        savingWorkspace = change.kind == "workspace-save" ? change.id : nil
        defer {
            busy = false
            savingWorkspace = nil
        }
        notice = nil
        do {
            try await api.mutate(change)
            await load()
            return true
        } catch let response as SlipSurgeHTTP.Status where response.code == 409 {
            struct Details: Decodable { let error: String? }
            notice = (try? JSONDecoder().decode(Details.self, from: response.data))?.error ?? "Refresh the workspace and try again."
            return false
        } catch { notice = "The change couldn’t be confirmed."; return false }
    }
}

private extension Double {
    var isWithinInt: Bool { isFinite && self > Double(Int.min) && self < Double(Int.max) }
}
