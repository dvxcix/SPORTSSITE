import PhotosUI
import SwiftUI

@Observable
final class GameRoomDraft {
    var text = ""
    var play: GameCenterData.Play?
    var attachment: URL?

    func message(for game: GameLink) -> String {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var lines = body.isEmpty ? [] : [body]
        if let attachment { lines.append(attachment.absoluteString) }
        if !lines.isEmpty, let play, let url = GameLink(sport: game.sport, id: game.id, play: play.id).url {
            lines.append(url.absoluteString)
        }
        return lines.joined(separator: "\n")
    }
}

struct GameRoomComposer: View {
    private enum Picker: String, Identifiable {
        case gif, emoji
        var id: Self { self }
    }

    @Bindable var draft: GameRoomDraft
    let link: GameLink
    let account: AccountStore
    let userID: UUID
    let sending: Bool
    let send: () -> Void
    @State private var picker: Picker?
    @State private var pickingPhoto = false
    @State private var photo: PhotosPickerItem?
    @State private var uploading = false
    @FocusState private var messageFocused: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let message = draft.message(for: link)
        return VStack(alignment: .leading, spacing: 0) {
            if let play = draft.play {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.turn.down.right").foregroundStyle(Brand.accent(for: scheme)).accessibilityHidden(true)
                    Text(play.text.isEmpty ? play.title ?? "Play" : play.text)
                        .font(.caption.weight(.medium)).lineLimit(2)
                    Spacer(minLength: 0)
                    Button("Remove play context", systemImage: "xmark") { draft.play = nil }
                        .labelStyle(.iconOnly).frame(width: 44, height: 44)
                }
                .padding(.leading, 10)
            }
            if let attachment = draft.attachment {
                HStack(spacing: 8) {
                    ResearchArtwork(urls: [attachment], fallback: "photo", pointSize: 32)
                        .frame(width: 32, height: 32)
                    Text(NativeGIFSource.canPlay(attachment) ? "GIF attached" : "Photo attached").font(.caption.weight(.medium))
                    Spacer(minLength: 0)
                    Button("Remove attachment", systemImage: "xmark") { draft.attachment = nil }
                        .labelStyle(.iconOnly).frame(width: 44, height: 44)
                }
                .padding(.leading, 10)
            }
            HStack(alignment: .bottom, spacing: 4) {
                if !messageFocused {
                    Menu {
                        Button("Photo", systemImage: "photo.on.rectangle") { pickingPhoto = true }
                        Button("GIF", systemImage: "play.rectangle") { picker = .gif }
                        Button("Emoji", systemImage: "face.smiling") { picker = .emoji }
                    } label: {
                        Group {
                            if uploading { ProgressView() }
                            else { Image(systemName: "plus.circle").font(.title2) }
                        }
                        .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Add to message")
                    .disabled(uploading)
                }
                TextField("Message Game Room", text: $draft.text, axis: .vertical)
                    .font(.subheadline).lineLimit(1...4).focused($messageFocused)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .frame(minHeight: 44, alignment: .leading)
                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 16))
                    .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(.secondary.opacity(0.19)) }
                if messageFocused {
                    Button("Hide keyboard", systemImage: "keyboard.chevron.compact.down") { messageFocused = false }
                        .labelStyle(.iconOnly).frame(width: 44, height: 44)
                        .foregroundStyle(.secondary)
                }
                Button("Send to Game Room", systemImage: "arrow.up.circle.fill", action: send)
                    .labelStyle(.iconOnly).font(.title).frame(width: 44, height: 44)
                    .foregroundStyle(Brand.accent(for: scheme))
                    .disabled(sending || uploading || message.isEmpty || message.utf16.count > 800)
            }
            .buttonStyle(.plain)
            if message.utf16.count > 800 {
                Text("Message exceeds the 800-character limit.").font(.caption).foregroundStyle(.secondary)
                    .padding(.leading, 10).padding(.top, 4)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(.bar)
        .overlay(alignment: .top) { Divider().allowsHitTesting(false) }
        .photosPicker(isPresented: $pickingPhoto, selection: $photo, matching: .images, preferredItemEncoding: .current)
        .modifier(NativePhotoSelection(photo: $photo, url: $draft.attachment, uploading: $uploading) { image in
            try await NativeMediaUpload.upload(image, kind: .messages, account: account, userID: userID)
        })
        .sheet(item: $picker) { choice in
            switch choice {
            case .gif:
                NativeGIFPickerSheet(account: account, userID: userID, uploadKind: .messages) { url in
                    draft.attachment = url
                    picker = nil
                }
            case .emoji:
                NavigationStack {
                    NativeEmojiPicker { value in
                        draft.text += draft.text.isEmpty ? value : " " + value
                        picker = nil
                    }
                }
                .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
        }
    }
}

struct GameRoomMessageBody: View {
    let content: String

    var body: some View {
        let attachment = Self.extract(from: content)
        if !attachment.text.isEmpty { NativeSocialBody(content: attachment.text) }
        if let url = attachment.url {
            if NativeGIFSource.canPlay(url) {
                NativeGIFPlayback(url: url, maxHeight: 190).clipShape(.rect(cornerRadius: 9))
            } else {
                PostArtwork(url: url, label: "Game Room photo", maxHeight: 235)
                    .clipShape(.rect(cornerRadius: 9))
            }
        }
    }

    private static func extract(from content: String) -> (text: String, url: URL?) {
        guard content.contains("https://") else { return (content, nil) }
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let start = trimmed.lastIndex(where: \.isNewline).map { trimmed.index(after: $0) } ?? trimmed.startIndex
        let line = trimmed[start...].trimmingCharacters(in: .whitespaces)
        guard !line.contains(where: \.isWhitespace), let url = URL(string: line),
              NativeGIFSource.canPlay(url) || (
                FeedPostCard.allowedMedia(url) && url.path.hasPrefix("/storage/v1/object/public/media/messages/") &&
                ["jpeg", "jpg", "png", "webp"].contains(url.pathExtension.lowercased())
              ) else { return (content, nil) }
        return (trimmed[..<start].trimmingCharacters(in: .whitespacesAndNewlines), url)
    }
}
