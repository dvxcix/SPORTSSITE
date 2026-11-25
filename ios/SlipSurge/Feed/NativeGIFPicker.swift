import SwiftUI

struct NativeGIFPickerButton: View {
    let account: AccountStore
    let userID: UUID
    let uploadKind: NativeMediaUpload.Kind
    var compact = false
    var placement: GiphyCatalog.Placement = .feed
    let choose: (URL) -> Void
    @State private var open = false

    var body: some View {
        Button {
            open = true
        } label: {
            Group {
                if compact { Image(systemName: "gif") }
                else { Label("GIF", systemImage: "gif") }
            }
            .frame(minWidth: compact ? 38 : nil, minHeight: 44)
        }
        .accessibilityLabel("Choose a GIF")
        .sheet(isPresented: $open) {
            NavigationStack {
                NativeGIFPicker(account: account, userID: userID, uploadKind: uploadKind, placement: placement) { url in
                    choose(url)
                    open = false
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

private struct NativeGIFPicker: View {
    let account: AccountStore
    let userID: UUID
    let uploadKind: NativeMediaUpload.Kind
    let placement: GiphyCatalog.Placement
    let choose: (URL) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @AppStorage("slipsurgeRecentGIFs") private var stored = Data()
    @State private var query = ""
    @State private var items: [GiphyCatalog.Clip] = []
    @State private var next: Int?
    @State private var loadedQuery: String?
    @State private var loading = false
    @State private var failure: String?
    @State private var revision = 0
    @State private var pasted = ""
    @State private var uploaded: URL?
    @State private var uploading = false
    @State private var checkingLink = false
    @State private var linkFailure = false

    private let tags = ["Trending", "Sports", "Winner", "Hype", "Reaction", "Pain"]

    private var term: String { String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) }
    private var recents: [URL] { ((try? JSONDecoder().decode([URL].self, from: stored)) ?? []).filter(NativeGIFSource.canPlay) }
    private var pastedURL: URL? {
        guard let url = URL(string: pasted.trimmingCharacters(in: .whitespacesAndNewlines)), NativeGIFSource.isProvider(url) else { return nil }
        return url
    }

    var body: some View {
        Group {
            if let catalog = GiphyCatalog(placement) {
                picker(catalog)
                    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search GIFs")
                    .task(id: "\(term):\(revision)") {
                        if !term.isEmpty {
                            do { try await Task.sleep(for: .milliseconds(260)) } catch { return }
                        }
                        await load(catalog, search: term)
                    }
            } else {
                picker(nil)
            }
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Choose a GIF")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        .onChange(of: uploaded) { _, value in
            if let value { select(value) }
        }
    }

    private func picker(_ catalog: GiphyCatalog?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if let catalog {
                    if term.isEmpty { suggestions }
                    if let failure {
                        ContentUnavailableView {
                            Label(failure, systemImage: "exclamationmark.circle")
                        } actions: { Button("Try again") { revision += 1 } }
                    } else if loadedQuery == term {
                        if items.isEmpty { ContentUnavailableView("No GIFs found", systemImage: "magnifyingglass") }
                        libraryGrid
                        if let next {
                            Button("Load more GIFs") { Task { await load(catalog, search: term, offset: next) } }
                                .disabled(loading)
                        }
                    }
                    if loading { ProgressView().frame(maxWidth: .infinity).accessibilityLabel("Loading GIFs") }
                    Image("GiphyAttribution").resizable().scaledToFit().frame(width: 145)
                        .accessibilityLabel("Powered by GIPHY")
                } else {
                    Text("GIF search is currently unavailable.").font(.subheadline).foregroundStyle(.secondary)
                    linkAndPhotos
                }
                if term.isEmpty { recentGIFs }
                if catalog != nil { DisclosureGroup("Add from link or Photos") { linkAndPhotos.padding(.top, 5) } }
            }
            .padding(14)
        }
    }

    private var libraryGrid: some View {
        LazyVGrid(columns: [.init(.adaptive(minimum: 105), spacing: 6)], spacing: 6) {
            ForEach(items) { result in
                Button { select(result.url, remember: false) } label: { preview(result.previewURL, height: 89) }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel(result.title)
            }
        }
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(tags, id: \.self) { tag in
                        Button(tag) { query = tag == "Trending" ? "" : tag }
                            .buttonStyle(.bordered)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder private var recentGIFs: some View {
        if !recents.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Recent").font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader)
                ScrollView(.horizontal) {
                    HStack(spacing: 7) {
                        ForEach(recents, id: \.self) { url in
                            Button { select(url) } label: { preview(url, height: 61).frame(width: 80) }
                                .buttonStyle(SlipSurgePressStyle())
                                .accessibilityLabel("Use recent GIF")
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private var linkAndPhotos: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("GIF link", text: $pasted)
                .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).textFieldStyle(.roundedBorder)
                .onChange(of: pasted) { _, _ in linkFailure = false }
            if let pastedURL {
                Button("Use link") { Task { await useLink(pastedURL) } }.buttonStyle(.bordered).disabled(checkingLink)
            } else if !pasted.isEmpty {
                Text("Enter a direct GIF image link from Tenor or GIPHY.").font(.caption).foregroundStyle(.secondary)
            }
            if checkingLink { ProgressView("Checking GIF link") }
            if linkFailure { Text("That GIF couldn’t load. Try another link.").font(.caption).foregroundStyle(.secondary) }
            NativePhotoPicker(title: "Upload GIF", upload: { photo in
                guard photo.mime == "image/gif" else { throw URLError(.cannotDecodeContentData) }
                return try await NativeMediaUpload.upload(photo, kind: uploadKind, account: account, userID: userID)
            }, url: $uploaded, uploading: $uploading)
        }
        .font(.subheadline)
    }

    private func preview(_ url: URL, height: CGFloat) -> some View {
        GIFThumbnail(url: url)
            .frame(maxWidth: .infinity).frame(height: height)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 9))
            .clipShape(.rect(cornerRadius: 9))
    }

    private func load(_ catalog: GiphyCatalog, search: String, offset: Int = 0) async {
        if offset > 0 && loading { return }
        if offset == 0 { failure = nil }
        loading = true
        defer { if search == term { loading = false } }
        do {
            let page = try await catalog.page(search: search, offset: offset)
            try Task.checkCancellation()
            guard search == term else { return }
            let previous = offset == 0 ? [] : items
            let seen = Set(previous.map(\.id))
            items = previous + page.clips.filter { !seen.contains($0.id) }
            next = page.next
            loadedQuery = search
            failure = nil
        } catch {
            guard !Task.isCancelled, search == term else { return }
            failure = "The GIF library couldn’t load"
        }
    }

    private func useLink(_ url: URL) async {
        checkingLink = true
        defer { checkingLink = false }
        linkFailure = false
        do {
            _ = try await NativeGIFPlayback.thumbnail(url, checkingAttachment: true)
            guard url == pastedURL else { return }
            select(url)
        } catch {
            if url == pastedURL { linkFailure = true }
        }
    }

    private func select(_ url: URL, remember: Bool = true) {
        guard NativeGIFSource.canPlay(url) else { return }
        if remember {
            let choices = Array(([url] + recents.filter { $0 != url }).prefix(8))
            if let data = try? JSONEncoder().encode(choices) { stored = data }
        }
        choose(url)
    }
}

private struct GIFThumbnail: View {
    let url: URL
    @State private var image: CGImage?

    var body: some View {
        GeometryReader { proxy in
            Group {
                if let image { Image(decorative: image, scale: 1).resizable().scaledToFill() }
                else { Image(systemName: "gif").foregroundStyle(.secondary) }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
        }
        .accessibilityHidden(true)
        .task(id: url) {
            image = nil
            if let loaded = try? await NativeGIFPlayback.thumbnail(url), !Task.isCancelled { image = loaded }
        }
        .onDisappear { image = nil }
    }
}
