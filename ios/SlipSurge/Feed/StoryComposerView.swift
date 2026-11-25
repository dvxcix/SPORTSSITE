import SwiftUI

struct StoryComposerView: View {
    private enum Kind: String, CaseIterable { case text = "Text", photo = "Photo" }
    private static let colors = [("#111111", "Charcoal"), ("#1a1a2e", "Midnight"), ("#16213e", "Indigo"),
        ("#0f3460", "Navy"), ("#1a472a", "Forest"), ("#4a1942", "Plum")]

    let api: StoriesAPI
    let userID: UUID
    let sports: [String]
    var embedded = false
    let shared: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var submission = UUID()
    @State private var kind = Kind.text
    @State private var content = ""
    @State private var sport = ""
    @State private var color = "#111111"
    @State private var photo: URL?
    @State private var uploading = false
    @State private var saving = false
    @State private var failure: String?

    private var text: String { content.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canShare: Bool { !saving && !uploading && text.count <= 1000 && (kind == .text ? !text.isEmpty : photo != nil) }

    var body: some View {
        if embedded { editor }
        else { NavigationStack { editor } }
    }

    private var editor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 15) {
                Picker("Story format", selection: $kind) {
                    ForEach(Kind.allCases, id: \.self) { kind in
                        Label(kind.rawValue, systemImage: kind == .text ? "textformat" : "photo").tag(kind)
                    }
                }.pickerStyle(.segmented)
                preview.frame(maxWidth: .infinity)
                ResearchArtworkPicker(title: "Story sport", options: [.init(id: "", title: "All sports", icon: "sportscourt")]
                    + sports.map { .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt") }, selection: $sport)
                TextField(kind == .text ? "Story text" : "Caption", text: $content, axis: .vertical)
                    .lineLimit(2...5).textFieldStyle(.roundedBorder)
                if kind == .text {
                    colorPicker
                } else {
                    NativePhotoPicker(title: photo == nil ? "Choose photo" : "Change photo", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .stories, account: api.account, userID: userID)
                    }, url: $photo, uploading: $uploading)
                    .buttonStyle(.bordered)
                    NativeGIFPickerButton(account: api.account, userID: userID, uploadKind: .stories) { photo = $0 }
                        .buttonStyle(.bordered)
                }
                if let failure { Label(failure, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.red) }
            }
            .padding(16)
            .disabled(saving)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Add to story")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !embedded {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() }.disabled(saving) }
            }
            ToolbarItem(placement: .confirmationAction) {
                if saving { ProgressView() }
                else { Button("Share") { Task { await publish() } }.disabled(!canShare) }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20).fill(kind == .photo ? Color.black : Color(hex: color) ?? .black)
            if kind == .photo, let photo {
                if NativeGIFSource.canPlay(photo) {
                    NativeGIFPlayback(url: photo, maxHeight: 270, maxWidth: 160, label: "Story GIF preview")
                } else { ResearchArtwork(urls: [photo], fallback: "photo").clipped() }
            } else if kind == .text {
                Text(text.isEmpty ? "Your story" : text)
                    .font(.title3.weight(.bold)).foregroundStyle(.white)
                    .multilineTextAlignment(.center).lineLimit(8).padding(18)
            } else {
                Image(systemName: "photo.on.rectangle").font(.largeTitle).foregroundStyle(.white.opacity(0.68))
            }
        }
        .frame(width: 160, height: 270)
        .clipShape(.rect(cornerRadius: 20))
        .accessibilityLabel("Story preview")
    }

    private var colorPicker: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(Self.colors, id: \.0) { code, label in
                    Button {
                        color = code
                    } label: {
                        Circle().fill(Color(hex: code) ?? .black)
                            .overlay { if color == code { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white) } }
                            .frame(width: 34, height: 34).frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(label) background")
                    .accessibilityAddTraits(color == code ? .isSelected : [])
                }
            }
        }.scrollIndicators(.hidden)
    }

    private func publish() async {
        guard canShare else { return }
        saving = true
        failure = nil
        defer { saving = false }
        do {
            try await api.add(.init(id: submission.uuidString.lowercased(), content: text, sport: sport,
                photo: kind == .photo ? photo : nil, background: color))
            shared()
            if !embedded { dismiss() }
        } catch let error as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            failure = (try? JSONDecoder().decode(Details.self, from: error.data))?.error ?? "Your story couldn’t be shared."
        } catch {
            failure = "Your story couldn’t be confirmed. Tap Share to retry."
        }
    }
}
