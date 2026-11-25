import SwiftUI

struct NativeGIFPickerButton: View {
    let account: AccountStore
    let userID: UUID
    let uploadKind: NativeMediaUpload.Kind
    var compact = false
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
                NativeGIFPicker(account: account, userID: userID, uploadKind: uploadKind) { url in
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
    let choose: (URL) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @AppStorage("slipsurgeRecentGIFs") private var stored = Data()
    @State private var query = ""
    @State private var search = ""
    @State private var count: Int?
    @State private var searchFailed = false
    @State private var revision = 0
    @State private var showAttachments = false
    @State private var pasted = ""
    @State private var uploaded: URL?
    @State private var uploading = false
    @State private var checkingLink = false
    @State private var linkFailure = false

    private let tags = ["Trending", "Sports", "Winner", "Hype", "Reaction", "Pain"]

    private var term: String { String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) }
    private var recents: [URL] { ((try? JSONDecoder().decode([URL].self, from: stored)) ?? []).filter(NativeGIFSource.canPlay) }
    private var pastedURL: URL? {
        guard let url = URL(string: pasted.trimmingCharacters(in: .whitespacesAndNewlines)),
              NativeGIFSource.isProvider(url) else { return nil }
        return url
    }

    var body: some View {
        Group {
            if GiphySearchGrid.isConfigured && !showAttachments {
                catalog
                    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search GIFs")
                    .task(id: term) {
                        if !term.isEmpty {
                            do { try await Task.sleep(for: .milliseconds(320)) } catch { return }
                        }
                        if search != term {
                            count = nil
                            searchFailed = false
                            search = term
                        }
                    }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !GiphySearchGrid.isConfigured {
                            Text("GIF search is currently unavailable.").font(.subheadline).foregroundStyle(.secondary)
                        }
                        attachments
                        recentGIFs
                    }
                    .padding(16)
                }
            }
        }
        .background(Brand.background(for: scheme))
        .navigationTitle(showAttachments ? "GIF attachments" : "Choose a GIF")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(showAttachments ? "Back" : "Close") {
                    if showAttachments {
                        count = nil
                        searchFailed = false
                        showAttachments = false
                    } else { dismiss() }
                }
            }
        }
        .onChange(of: uploaded) { _, value in
            if let value { select(value, remember: true) }
        }
    }

    private var catalog: some View {
        VStack(spacing: 8) {
            if term.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(tags, id: \.self) { tag in
                            Button(tag) { query = tag == "Trending" ? "" : tag }.buttonStyle(.bordered)
                        }
                    }.padding(.horizontal, 14)
                }.scrollIndicators(.hidden)
            }
            GiphySearchGrid(query: search, onUpdate: { count = $0; searchFailed = $1 }, onSearch: { query = $0 }) { url in
                select(url, remember: false)
            }
            .id(revision)
            .overlay {
                if searchFailed || count == 0 {
                    ContentUnavailableView {
                        Label(searchFailed ? "GIFs couldn’t load" : "No GIFs found", systemImage: "magnifyingglass")
                    } actions: { Button("Try again") { count = nil; searchFailed = false; revision += 1 } }
                }
            }
            .padding(.horizontal, 14)
            HStack {
                Image("GiphyAttribution").resizable().scaledToFit().frame(width: 120)
                    .accessibilityLabel("Powered by GIPHY")
                Spacer()
                Button("Link or Photos", systemImage: "paperclip") { showAttachments = true }
                    .buttonStyle(.bordered)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 6)
        }
    }

    @ViewBuilder private var recentGIFs: some View {
        if !recents.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Recent attachments").font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader)
                ScrollView(.horizontal) {
                    HStack(spacing: 7) {
                        ForEach(recents, id: \.self) { url in
                            Button { select(url, remember: true) } label: {
                                GIFThumbnail(url: url)
                                    .frame(width: 80, height: 61)
                                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 9))
                                    .clipShape(.rect(cornerRadius: 9))
                            }
                            .buttonStyle(SlipSurgePressStyle())
                            .accessibilityLabel("Use recent GIF")
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private var attachments: some View {
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

    private func useLink(_ url: URL) async {
        checkingLink = true
        defer { checkingLink = false }
        linkFailure = false
        do {
            _ = try await NativeGIFPlayback.thumbnail(url, checkingAttachment: true)
            guard url == pastedURL else { return }
            select(url, remember: true)
        } catch {
            if url == pastedURL { linkFailure = true }
        }
    }

    private func select(_ url: URL, remember: Bool) {
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
