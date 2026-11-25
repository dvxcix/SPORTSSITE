import SwiftUI

struct MatricesView: View {
    private enum Tab: String, CaseIterable { case mine = "My Matrices", community = "Community" }
    private struct Edit: Identifiable {
        let id = UUID()
        let matrix: ResearchMatrix?
    }

    let api: MatricesAPI
    var gameID: Int? = nil
    var mode: CourtResearchMode = .pregame
    let didChange: () -> Void
    private let showsDone: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var tab = Tab.mine
    @State private var catalog: ResearchMatrixCatalog?
    @State private var matrices: [ResearchMatrix]?
    @State private var listings: [ResearchMatrixListing]?
    @State private var code = ""
    @State private var editing: Edit?
    @State private var publishing: ResearchMatrix?
    @State private var deleting: ResearchMatrix?
    @State private var adding: ResearchMatrixListing?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: (any Error)?
    @State private var retry = 0

    init(api: MatricesAPI, gameID: Int? = nil, mode: CourtResearchMode = .pregame,
        opensCommunity: Bool = false, showsDone: Bool = true, didChange: @escaping () -> Void) {
        self.api = api
        self.gameID = gameID
        self.mode = mode
        self.didChange = didChange
        self.showsDone = showsDone
        _tab = State(initialValue: opensCommunity ? .community : .mine)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ResearchToolRail(title: "\(api.league.title) Matrices", choices: Tab.allCases, selection: $tab, label: \.rawValue) {
                    $0 == .mine ? "square.grid.3x3" : "person.2"
                }
                if tab == .mine, let matrices {
                    Button("New \(api.league.title) Matrix", systemImage: "plus") { editing = Edit(matrix: nil) }
                        .buttonStyle(SlipSurgePrimaryButtonStyle()).disabled(catalog == nil || busy || matrices.count >= 20)
                    ForEach(matrices, content: matrixCard)
                    if matrices.isEmpty { ContentUnavailableView("No saved Matrices", systemImage: "square.grid.3x3") }
                    importField
                } else if tab == .community, let listings {
                    ForEach(listings, content: listingCard)
                    if listings.isEmpty { ContentUnavailableView("No published Matrices", systemImage: "person.2") }
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView(tab == .community || api.league == .nba ? "Ultimate required" : "NFL research access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Matrices couldn’t load", error: error) { retry += 1 }
                }
                if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
            }.padding(16)
        }
        .navigationTitle("\(api.league.title) Matrices")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .toolbar {
            if showsDone { ToolbarItem(placement: .cancellationAction) { Button("Done", role: .cancel) { dismiss() } } }
        }
        .task(id: "\(tab.rawValue)-\(retry)") { await load(tab) }
        .refreshable { await load(tab) }
        .sheet(item: $editing) { draft in
            if let catalog {
                ResearchMatrixEditor(api: api, catalog: catalog, original: draft.matrix, gameID: gameID, mode: mode) { await changed() }
            }
        }
        .sheet(item: $publishing) { matrix in
            PublishResearchMatrixView(api: api, matrix: matrix) { await changed() }
        }
        .confirmationDialog("Delete \(api.league.title) Matrix?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { matrix in
            Button("Delete \(matrix.name)", role: .destructive) { Task { await mutate(success: "Matrix deleted.") { try await api.delete(matrix) } } }
        }
        .confirmationDialog("Add this \(api.league.title) Matrix?", isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } }),
            titleVisibility: .visible, presenting: adding) { listing in
            Button("Add \(listing.title)") { Task { await mutate(success: "Matrix added.") { try await api.importListing(listing.id) } } }
        }
    }

    private func matrixCard(_ matrix: ResearchMatrix) -> some View {
        ResearchToolCard(color: Color(hex: matrix.color) ?? Brand.accent(for: scheme)) {
            HStack(spacing: 8) {
                Image(systemName: "square.grid.3x3.fill").foregroundStyle(Color(hex: matrix.color) ?? Brand.accent(for: scheme))
                Text(verbatim: matrix.name).font(.headline)
                Spacer()
                Button(matrix.enabled ? "Disable Matrix" : "Enable Matrix", systemImage: matrix.enabled ? "checkmark.circle.fill" : "circle") {
                    Task { await mutate { try await api.save(.init(enabled: !matrix.enabled, expected_updated_at: matrix.updatedAt), id: matrix.id) } }
                }.labelStyle(.iconOnly).buttonStyle(.bordered).disabled(busy)
            }
        } content: {
            let rule = matrix.matrixType == "pipeline" ? "step" : "condition"
            Text("\(matrix.conditionCount) \(matrix.conditionCount == 1 ? rule : rule + "s")")
                .font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 9) {
                Button("Edit", systemImage: "slider.horizontal.3") { editing = Edit(matrix: matrix) }.disabled(catalog == nil)
                ShareLink(item: matrix.elementCode) { Label("Share code", systemImage: "square.and.arrow.up") }
                Spacer(minLength: 0)
                Menu("More Matrix actions", systemImage: "ellipsis") {
                    Button("Publish", systemImage: "person.2") { publishing = matrix }
                    Button("Delete", systemImage: "trash", role: .destructive) { deleting = matrix }
                }.labelStyle(.iconOnly)
            }.font(.footnote).buttonStyle(.bordered).disabled(busy)
        }
    }

    private func listingCard(_ listing: ResearchMatrixListing) -> some View {
        ResearchToolCard(color: Color(hex: listing.color) ?? Brand.accent(for: scheme)) {
            Text(verbatim: listing.title).font(.headline)
        } content: {
            if !listing.description.isEmpty { Text(verbatim: listing.description).font(.subheadline) }
            Text("\(listing.matrixType.capitalized) · \(listing.copyCount.formatted()) added").font(.footnote).foregroundStyle(.secondary)
            Button("Add to My Matrices", systemImage: "plus.circle") { adding = listing }.buttonStyle(.bordered).disabled(busy)
        }
    }

    private var importField: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("Import by element code", systemImage: "tray.and.arrow.down").font(.headline)
        } content: {
            HStack {
                TextField("\(api.league.title)-XXXXXXXX", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                Button("Import") {
                    Task {
                        let submitted = code
                        await mutate { try await api.importCode(submitted); self.code = "" }
                    }
                }.buttonStyle(SlipSurgePrimaryButtonStyle()).disabled(busy || !code.uppercased().hasPrefix("\(api.league.title)-"))
            }
        }
    }

    private func load(_ requested: Tab) async {
        error = nil
        do {
            if requested == .mine {
                async let definitions = api.mine()
                async let fields = api.catalog()
                let values = try await (definitions, fields)
                try Task.checkCancellation()
                matrices = values.0
                catalog = values.1
            } else {
                let values = try await api.community()
                try Task.checkCancellation()
                listings = values
            }
        } catch { if !Task.isCancelled && tab == requested { self.error = error } }
    }

    private func changed() async {
        await load(.mine)
        if tab == .community { await load(.community) }
        didChange()
    }

    private func mutate(success: String = "Saved.", _ change: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do { try await change(); await changed(); notice = success }
        catch let status as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            notice = (try? JSONDecoder().decode(Details.self, from: status.data))?.error ?? "The Matrix change couldn’t be confirmed."
        }
        catch { notice = "The Matrix change couldn’t be confirmed. Try again." }
    }
}

private struct PublishResearchMatrixView: View {
    let api: MatricesAPI
    let matrix: ResearchMatrix
    let didSave: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var summary = ""
    @State private var busy = false
    @State private var issue = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Listing title", text: $title)
                TextField("Description", text: $summary, axis: .vertical).lineLimit(4...8)
                if issue { Text("The Matrix couldn’t be published.").foregroundStyle(.red) }
            }
            .navigationTitle("Publish \(api.league.title) Matrix")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publish") { Task { await publish() } }.disabled(busy || title.utf16.count > 100 || summary.utf16.count > 1000)
                }
            }.disabled(busy)
        }
        .interactiveDismissDisabled(busy)
        .onAppear { title = matrix.name }
    }

    private func publish() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await api.publish(matrix.id, title: title, description: summary); await didSave(); dismiss() }
        catch { issue = true }
    }
}
