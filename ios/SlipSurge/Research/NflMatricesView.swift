import SwiftUI

struct NflMatricesView: View {
    private enum Tab: String, CaseIterable { case mine = "My Matrices", community = "Community" }
    private struct Edit: Identifiable {
        let id = UUID()
        let matrix: NflMatrix?
    }

    let api: NflMatricesAPI
    let didChange: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var tab = Tab.mine
    @State private var catalog: NflMatrixCatalog?
    @State private var matrices: [NflMatrix]?
    @State private var listings: [NflMatrixListing]?
    @State private var code = ""
    @State private var editing: Edit?
    @State private var publishing: NflMatrix?
    @State private var deleting: NflMatrix?
    @State private var adding: NflMatrixListing?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ResearchToolRail(title: "NFL Matrices", choices: Tab.allCases, selection: $tab, label: \.rawValue) {
                    $0 == .mine ? "square.grid.3x3" : "person.2"
                }
                if tab == .mine, let matrices {
                    Button("New NFL Matrix", systemImage: "plus") { editing = Edit(matrix: nil) }
                        .buttonStyle(.borderedProminent).disabled(catalog == nil || busy || matrices.count >= 20)
                    ForEach(matrices, content: matrixCard)
                    if matrices.isEmpty { ContentUnavailableView("No NFL Matrices", systemImage: "square.grid.3x3") }
                    importField
                } else if tab == .community, let listings {
                    ForEach(listings, content: listingCard)
                    if listings.isEmpty { ContentUnavailableView("No published Matrices", systemImage: "person.2") }
                } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                    ContentUnavailableView(tab == .community ? "Ultimate required" : "NFL research access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "NFL Matrices couldn’t load", error: error) { retry += 1 }
                }
                if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
            }.padding(16)
        }
        .navigationTitle("NFL Matrices")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done", role: .cancel) { dismiss() } } }
        .task(id: "\(tab.rawValue)-\(retry)") { await load(tab) }
        .refreshable { await load(tab) }
        .sheet(item: $editing) { draft in
            if let catalog {
                NflMatrixEditor(api: api, catalog: catalog, original: draft.matrix) { await changed() }
            }
        }
        .sheet(item: $publishing) { matrix in
            PublishNflMatrixView(api: api, matrix: matrix) { await changed() }
        }
        .confirmationDialog("Delete NFL Matrix?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { matrix in
            Button("Delete \(matrix.name)", role: .destructive) { Task { await mutate { try await api.delete(matrix) } } }
        }
        .confirmationDialog("Add this NFL Matrix?", isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } }),
            titleVisibility: .visible, presenting: adding) { listing in
            Button("Add \(listing.title)") { Task { await mutate { try await api.importListing(listing.id) } } }
        }
    }

    private func matrixCard(_ matrix: NflMatrix) -> some View {
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
            Text("\(matrix.conditionCount) \(matrix.matrixType == "pipeline" ? "steps" : "conditions")")
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

    private func listingCard(_ listing: NflMatrixListing) -> some View {
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
                TextField("NFL-XXXXXXXX", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                Button("Import") {
                    Task {
                        let submitted = code
                        await mutate { try await api.importCode(submitted); self.code = "" }
                    }
                }.buttonStyle(.borderedProminent).disabled(busy || !code.uppercased().hasPrefix("NFL-"))
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

    private func mutate(_ change: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do { try await change(); await changed(); notice = "Saved" }
        catch { notice = "The Matrix change couldn’t be confirmed. Try again." }
    }
}

private struct PublishNflMatrixView: View {
    let api: NflMatricesAPI
    let matrix: NflMatrix
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
            .navigationTitle("Publish NFL Matrix")
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
