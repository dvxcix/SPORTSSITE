import SwiftUI

struct DugoutMatricesView: View {
    private struct Editing: Identifiable {
        let original: DugoutMatrix?
        let id = UUID()
    }

    let api: DugoutMatricesAPI
    var opensPublication: NativeMarketplaceTarget.Publication?
    @Environment(\.slipPalette) private var slipPalette
    @State private var matrices: [DugoutMatrix]?
    @State private var editor: Editing?
    @State private var deleting: DugoutMatrix?
    @State private var publication: DugoutMatrix?
    @State private var importing = false
    @State private var code = ""
    @State private var busy = false
    @State private var notice: String?
    @State private var choosingPublication = false
    @State private var attemptedPublication = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 7) {
                    Button("New Matrix", systemImage: "plus") { editor = .init(original: nil) }
                        .buttonStyle(SlipSurgePrimaryButtonStyle())
                        .disabled(matrices == nil || (matrices?.count ?? 0) >= 10 || busy)
                    NavigationLink {
                        DugoutMatrixMarketplace(api: api) { await load() }
                    } label: { Label("Marketplace", systemImage: "storefront") }
                    .buttonStyle(.bordered)
                }
                Button("Import Element Code", systemImage: "arrow.down.document") { code = ""; importing = true }
                    .buttonStyle(.bordered).disabled(busy)
                if let matrices {
                    if matrices.isEmpty { ContentUnavailableView("No MLB Matrices", systemImage: "square.grid.3x3") }
                    ForEach(matrices) { matrix in card(matrix) }
                } else if let notice {
                    ContentUnavailableView {
                        Label("Matrices couldn’t load", systemImage: "exclamationmark.circle")
                    } description: { Text(notice) } actions: { Button("Retry") { Task { await load() } } }
                } else { ProgressView().frame(maxWidth: .infinity).padding() }
                if let notice, matrices != nil { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("MLB Matrices")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editor) { change in
            DugoutMatrixEditor(original: change.original) { draft in
                try await api.save(draft, previous: change.original)
                await load()
            }
        }
        .sheet(item: $publication) { matrix in DugoutMatrixPublishSheet(api: api, matrix: matrix) }
        .alert("Import Element Code", isPresented: $importing) {
            TextField("Element Code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
            Button("Cancel", role: .cancel) {}
            Button("Import") {
                let entered = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                Task { await change { try await api.importElement(entered) } }
            }
        }
        .confirmationDialog("Delete Matrix?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible, presenting: deleting) { matrix in
                Button("Delete \(matrix.name)", role: .destructive) { Task { await change { try await api.delete(matrix) } } }
            }
        .confirmationDialog("Choose a Matrix", isPresented: $choosingPublication, titleVisibility: .visible) {
            ForEach(matrices ?? []) { item in Button(item.name) { publication = item } }
        }
    }

    private func openPublication() {
        guard let opensPublication, let matrices, !attemptedPublication else { return }
        attemptedPublication = true
        switch opensPublication {
        case .chooser:
            if matrices.isEmpty { notice = "Create a Matrix before publishing." }
            else { choosingPublication = true }
        case .matrix(let id):
            publication = matrices.first { $0.id == id }
            if publication == nil { notice = "This Matrix is unavailable." }
        }
    }

    private func card(_ matrix: DugoutMatrix) -> some View {
        let tone = Color(hex: matrix.color) ?? slipPalette.accent
        return ResearchToolCard(color: tone) {
            HStack(spacing: 8) {
                Image(systemName: matrix.matrix_type == "pipeline" ? "point.3.connected.trianglepath.dotted" : "square.grid.3x3.fill")
                    .foregroundStyle(tone)
                Text(matrix.name).font(.headline)
                Spacer()
                Menu("Matrix actions", systemImage: "ellipsis") {
                    Button("Edit", systemImage: "pencil") { editor = .init(original: matrix) }
                    Button(matrix.enabled ? "Disable" : "Enable", systemImage: matrix.enabled ? "eye.slash" : "eye") {
                        Task { await change { try await api.enable(matrix, enabled: !matrix.enabled) } }
                    }
                    if let code = matrix.element_code { ShareLink(item: code) { Label("Share Element Code", systemImage: "square.and.arrow.up") } }
                    Button("Publish to Marketplace", systemImage: "storefront") { publication = matrix }
                    Button("Delete", systemImage: "trash", role: .destructive) { deleting = matrix }
                }.labelStyle(.iconOnly).disabled(busy)
            }
        } content: {
            HStack(spacing: 8) {
                Text(matrix.matrix_type.capitalized)
                Text("·")
                Text("\(matrix.count) \(matrix.matrix_type == "pipeline" ? "steps" : "factors")")
                if !matrix.enabled { Label("Disabled", systemImage: "eye.slash") }
            }.font(.caption).foregroundStyle(.secondary)
            if let code = matrix.element_code {
                Text(code).font(.caption.monospaced()).textSelection(.enabled)
            }
        }
    }

    private func load() async {
        do { matrices = try await api.list(); notice = nil }
        catch { if !Task.isCancelled { notice = dugoutMatrixError(error) } }
        openPublication()
    }

    private func change(_ work: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await work(); await load() }
        catch { notice = dugoutMatrixError(error) }
    }
}

private struct DugoutMatrixPublishSheet: View {
    let api: DugoutMatricesAPI
    let matrix: DugoutMatrix
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var tags = ""
    @State private var busy = false
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Listing title", text: $title)
                TextField("Description", text: $description, axis: .vertical).lineLimit(3...8)
                TextField("Tags, separated with commas", text: $tags)
                if let failure { Text(failure).foregroundStyle(.red) }
            }
            .navigationTitle("Publish Matrix")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { if title.isEmpty { title = matrix.name } }
            .disabled(busy)
            .interactiveDismissDisabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publish") { Task { await publish() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                }
            }
        }
    }

    private func publish() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await api.publish(matrix, title: title, description: description,
                tags: tags.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) })
            dismiss()
        } catch { failure = dugoutMatrixError(error) }
    }
}

struct DugoutMatrixMarketplace: View {
    private struct Search: Hashable { let text: String; let sort: String; let type: String; let mine: Bool }
    let api: DugoutMatricesAPI
    var author: UUID? = nil
    var opensListing: UUID? = nil
    let onImport: () async -> Void
    @Environment(\.slipPalette) private var slipPalette
    @State private var search = ""
    @State private var sort = "newest"
    @State private var type = ""
    @State private var mine = false
    @State private var listings: [DugoutMatrixListing]?
    @State private var selection: DugoutMatrixListing?
    @State private var removal: DugoutMatrixListing?
    @State private var busy = false
    @State private var notice: String?
    @State private var openedListing = false
    @State private var listingProblem: String?

    private var query: Search { .init(text: search, sort: sort, type: type, mine: mine) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack {
                    Picker("Sort", selection: $sort) {
                        Text("Newest").tag("newest"); Text("Most copied").tag("popular")
                    }
                    Spacer()
                    Picker("Type", selection: $type) {
                        Text("All types").tag(""); Text("Classic").tag("classic"); Text("Pipeline").tag("pipeline")
                    }
                    Toggle("My listings", isOn: $mine).toggleStyle(.button)
                }
                if let listings {
                    if listings.isEmpty { ContentUnavailableView("No matching Matrices", systemImage: "storefront") }
                    ForEach(listings) { listing in
                        Button { selection = listing } label: { listingCard(listing) }
                            .buttonStyle(SlipSurgePressStyle())
                    }
                } else if notice == nil {
                    ProgressView().frame(maxWidth: .infinity).padding()
                }
                if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
                if let listingProblem { Text(listingProblem).font(.subheadline).foregroundStyle(.secondary) }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .navigationTitle("Matrix Marketplace")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Find an MLB Matrix")
        .task(id: query) {
            try? await Task.sleep(for: .milliseconds(search.isEmpty ? 0 : 220))
            if !Task.isCancelled { await load(query) }
        }
        .task(id: opensListing) {
            guard let opensListing, !openedListing else { return }
            do {
                let listing = try await api.listing(opensListing)
                guard !Task.isCancelled else { return }
                selection = listing
                openedListing = true
            } catch {
                if !Task.isCancelled { listingProblem = dugoutMatrixError(error) }
            }
        }
        .refreshable { await load(query) }
        .sheet(item: $selection) { listing in
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        listingCard(listing)
                        ForEach(listing.matrix_type == "pipeline" ? listing.snapshot.pipeline_steps ?? [] : listing.snapshot.factors ?? []) { rule in
                            let title = DugoutMatrixCatalog.field(rule.category, rule.field_key)?.label ?? rule.field_key
                            Label(title, systemImage: rule.kind == "rank" ? "arrow.up.arrow.down" : "line.3.horizontal.decrease")
                        }
                        Button("Import Matrix", systemImage: "arrow.down.doc") { Task { await takeCopy(listing) } }
                            .buttonStyle(SlipSurgePrimaryButtonStyle()).disabled(busy)
                        if listing.is_owner {
                            Button("Remove listing", systemImage: "trash", role: .destructive) { removal = listing }.disabled(busy)
                        }
                        if let share = URL(string: "https://" + SlipSurgeHTTP.site + "/marketplace/" + listing.id.uuidString.lowercased()) {
                            ShareLink(item: share) { Label("Share listing", systemImage: "square.and.arrow.up") }
                                .buttonStyle(.bordered)
                        }
                        if let notice { Text(notice).font(.caption).foregroundStyle(.secondary) }
                    }
                    .padding(16)
                }
                .navigationTitle(listing.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { selection = nil } } }
                .confirmationDialog("Remove listing?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }),
                    presenting: removal) { item in
                        Button("Remove \(item.title)", role: .destructive) { Task { await remove(item) } }
                    }
            }
        }
    }

    private func listingCard(_ listing: DugoutMatrixListing) -> some View {
        ResearchToolCard(color: Color(hex: listing.color) ?? slipPalette.accent) {
            Text(listing.title).font(.headline)
        } content: {
            if let author = listing.author {
                HStack(spacing: 7) {
                    ResearchArtwork(urls: [author.avatar_url].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                        .frame(width: 23, height: 23)
                    Text(author.display_name ?? author.username ?? "Member").font(.caption.weight(.semibold))
                    if author.is_verified == true { Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified") }
                }
            }
            if let description = listing.description, !description.isEmpty { Text(description).font(.subheadline).foregroundStyle(.secondary) }
            if let tags = listing.tags, !tags.isEmpty { Text(tags.joined(separator: " · ")).font(.caption) }
            Label("\(listing.matrix_type.capitalized) · \(listing.copy_count) copies", systemImage: "square.on.square")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func load(_ requested: Search) async {
        do {
            let value = try await api.marketplace(search: requested.text, sort: requested.sort, type: requested.type,
                mine: requested.mine, author: author)
            if !Task.isCancelled, query == requested { listings = value; notice = nil }
        } catch { if !Task.isCancelled, query == requested { notice = dugoutMatrixError(error) } }
    }

    private func takeCopy(_ listing: DugoutMatrixListing) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await api.importMarketplace(listing.id); selection = nil; await onImport(); await load(query) }
        catch { notice = dugoutMatrixError(error) }
    }

    private func remove(_ listing: DugoutMatrixListing) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await api.removeMarketplace(listing.id); selection = nil; await load(query) }
        catch { notice = dugoutMatrixError(error) }
    }
}
