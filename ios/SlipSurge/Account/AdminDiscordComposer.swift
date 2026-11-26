import SwiftUI

struct AdminDiscordComposer: View {
    let api: AdminDiscordAPI
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var draft = AdminDiscordAPI.Draft()
    @State private var channels: [AdminDiscordAPI.Channel]?
    @State private var revision = 0
    @State private var issue: (any Error)?
    @State private var uploads = Set<String>()
    @State private var confirming = false
    @State private var sending = false
    @State private var feedback: String?
    @State private var colorHex = "#B4FF4D"

    private var channel: AdminDiscordAPI.Channel? { channels?.first { $0.id == draft.channelId } }
    private var tint: Color { Color(hex: colorHex) ?? slipPalette.accent }
    private var hasContent: Bool {
        [draft.content, draft.title, draft.description, draft.authorName, draft.thumbnailUrl, draft.imageUrl, draft.footerText]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    private var valid: Bool {
        channel != nil && hasContent && uploads.isEmpty && !sending &&
        [draft.url, draft.authorIconUrl, draft.thumbnailUrl, draft.imageUrl, draft.footerIconUrl].allSatisfy {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || address($0) != nil
        } && parseColor != nil
    }

    var body: some View {
        Form {
            Section("Channel") {
                if let channels, !channels.isEmpty {
                    Picker("Channel", selection: $draft.channelId) {
                        Text("Choose a channel").tag("")
                        ForEach(channels) { Text("#" + $0.name).tag($0.id) }
                    }
                } else if channels != nil {
                    Text("No posting channels are configured.").foregroundStyle(.secondary)
                } else {
                    ResearchToolMessage(title: "Discord channels couldn’t load", error: issue) { revision += 1 }
                }
                input("Message", selection: $draft.content, limit: 2_000, multiline: true)
            }
            Section("Embed") {
                input("Title", selection: $draft.title, limit: 256)
                input("Description", selection: $draft.description, limit: 4_096, multiline: true)
                addressField("Title link", selection: $draft.url)
                HStack {
                    Circle().fill(tint).frame(width: 20, height: 20)
                    TextField("Embed color", text: $colorHex).textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                imageField("Thumbnail", key: "thumbnail", selection: $draft.thumbnailUrl)
                imageField("Image", key: "image", selection: $draft.imageUrl)
            }
            Section("Author and footer") {
                input("Author", selection: $draft.authorName, limit: 256)
                imageField("Author icon", key: "author", selection: $draft.authorIconUrl)
                input("Footer", selection: $draft.footerText, limit: 2_048, multiline: true)
                imageField("Footer icon", key: "footer", selection: $draft.footerIconUrl)
            }
            if hasContent { Section("Preview") { preview } }
            if let feedback { Section { Text(feedback).font(.footnote).foregroundStyle(.secondary) } }
        }
        .navigationTitle("Post to Discord")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if sending { ProgressView() }
                else { Button("Send") { confirming = true }.disabled(!valid) }
            }
        }
        .task(id: revision) { await load() }
        .interactiveDismissDisabled(sending)
        .confirmationDialog("Send to #\(channel?.name ?? "")?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Send as SlipSurge") { Task { await send() } }
        } message: { Text("The SlipSurge bot will publish this message immediately.") }
    }

    private func input(_ title: String, selection: Binding<String>, limit: Int, multiline: Bool = false) -> some View {
        TextField(title, text: selection, axis: multiline ? .vertical : .horizontal)
            .lineLimit(multiline ? 2...6 : 1...1)
            .onChange(of: selection.wrappedValue) { _, value in
                if value.utf16.count > limit { selection.wrappedValue = String(decoding: value.utf16.prefix(limit), as: UTF16.self) }
            }
    }

    private func addressField(_ title: String, selection: Binding<String>) -> some View {
        TextField(title, text: selection).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
    }

    @ViewBuilder private func imageField(_ title: String, key: String, selection: Binding<String>) -> some View {
        addressField(title + " URL", selection: selection)
        if let userID = api.viewer.userID {
            NativePhotoPicker(title: "Choose " + title.lowercased(), upload: { photo in
                try await NativeMediaUpload.upload(photo, kind: .discordEmbeds, account: api.viewer.account, userID: userID)
            }, url: Binding(get: { address(selection.wrappedValue) }, set: { selection.wrappedValue = $0?.absoluteString ?? "" }),
                uploading: Binding(get: { uploads.contains(key) }, set: { pending in
                    if pending { uploads.insert(key) } else { uploads.remove(key) }
                }))
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 7) {
            if !draft.content.isEmpty { Text(draft.content) }
            ResearchToolCard(color: tint) {
                if !draft.authorName.isEmpty {
                    HStack {
                        if let icon = address(draft.authorIconUrl) { previewImage(icon, height: 24).frame(width: 24) }
                        Text(draft.authorName).font(.caption.weight(.semibold))
                    }
                }
                if !draft.title.isEmpty { Text(draft.title).font(.headline) }
            } content: {
                if !draft.description.isEmpty { Text(draft.description).font(.subheadline) }
                if let thumbnail = address(draft.thumbnailUrl) { previewImage(thumbnail, height: 52).frame(width: 52) }
                if let image = address(draft.imageUrl) { previewImage(image, height: 115) }
                if !draft.footerText.isEmpty {
                    HStack {
                        if let icon = address(draft.footerIconUrl) { previewImage(icon, height: 20).frame(width: 20) }
                        Text(draft.footerText).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }.foregroundStyle(slipPalette.text)
    }

    private func previewImage(_ url: URL, height: CGFloat) -> some View {
        ResearchArtwork(urls: [url], fallback: "photo").frame(height: height).clipShape(.rect(cornerRadius: 7))
    }

    private func address(_ value: String) -> URL? {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.utf8.count <= 2_048, let url = URL(string: text), url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil, url.host != nil else { return nil }
        return url
    }

    private var parseColor: Int? {
        let value = colorHex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard value.utf8.count == 6 else { return nil }
        return Int(value, radix: 16)
    }

    private func load() async {
        issue = nil
        do {
            let received = try await api.channels()
            try Task.checkCancellation()
            channels = received
        } catch { if !Task.isCancelled { issue = error } }
    }

    private func send() async {
        guard valid else { return }
        sending = true
        feedback = nil
        defer { sending = false }
        do {
            draft.color = parseColor
            try await api.post(draft)
            feedback = "Discord confirmed the post."
            let channelID = draft.channelId
            draft = .init()
            draft.channelId = channelID
        } catch {
            feedback = "Discord didn’t confirm delivery. Check the channel before trying again."
        }
    }
}
