import SwiftUI

struct FeedComposerView: View {
    struct Community {
        let id: UUID
        let name: String
        let preferredSport: String?
        let artwork: URL?
        let memberOnly: Bool
    }

    let account: AccountStore
    let userID: UUID
    let allowMLB: Bool
    var startWithPick = false
    var initialPick: TrackedPickAPI.Leg? = nil
    var community: Community? = nil
    let onPost: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draftID = UUID()
    @State private var content = ""
    @State private var kind = Kind.text
    @State private var sport = "NFL"
    @State private var audience = Audience.everyone
    @State private var spoiler = false
    @State private var image: URL?
    @State private var uploading = false
    @State private var pickBuilder = false
    @State private var legs: [TrackedPickAPI.Leg] = []
    @State private var wager = ""
    @State private var choices = ["", ""]
    @State private var duration = 24
    @State private var posting = false
    @State private var notice: String?
    @State private var attempted = false
    @State private var initialized = false

    private enum Kind: String, CaseIterable, Encodable {
        case text, analysis, poll, pick
        var label: String { self == .text ? "Post" : rawValue.capitalized }
    }

    private enum Audience: String, CaseIterable, Encodable {
        case everyone = "public"
        case followers
        case personal = "private"
        var label: String {
            switch self {
            case .everyone: "Public"
            case .followers: "Followers"
            case .personal: "Only me"
            }
        }
    }

    private struct Draft: Encodable {
        struct Poll: Encodable {
            let options: [String]
            let duration: Int
        }

        let id: UUID
        let content: String
        let kind: Kind
        let sport: String
        let visibility: Audience
        let spoiler: Bool
        let image: URL?
        let poll: Poll?
        let groupId: String?
    }

    private var pollChoices: [String] {
        choices.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private var canPost: Bool {
        guard !posting, !uploading, content.utf16.count <= 500 else { return false }
        switch kind {
        case .poll: return pollChoices.count >= 2 && pollChoices.allSatisfy { $0.utf16.count <= 80 }
        case .pick: return !legs.isEmpty && (wager.isEmpty || parsedWager != nil)
        case .text, .analysis: return image != nil || !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private var parsedWager: Double? {
        guard let amount = try? Double(wager, format: .number), amount.isFinite, amount > 0 else { return nil }
        return amount
    }

    private var personalAllowed: Bool { community == nil && kind == .pick && legs.first?.sport == "NBA" }
    private var destination: String? { community?.id.uuidString.lowercased() }
    private var finalAudience: Audience { community?.memberOnly == true ? .everyone : audience }

    var body: some View {
        NavigationStack {
            Form {
                if let community {
                    Section {
                        HStack(spacing: 8) {
                            ResearchArtwork(urls: [community.artwork].compactMap { $0 }, fallback: "person.2")
                                .frame(width: 25, height: 25)
                            Text(community.name).font(.subheadline.weight(.semibold))
                        }
                    }
                }
                Section {
                    Picker("Post type", selection: $kind) {
                        ForEach(Kind.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    TextEditor(text: $content)
                        .frame(minHeight: 110)
                        .accessibilityLabel("Post text")
                } footer: {
                    Text("\(content.utf16.count) / 500")
                }
                if kind == .poll {
                    Section("Poll options") {
                        ForEach(choices.indices, id: \.self) { index in
                            TextField("Option \(index + 1)", text: $choices[index])
                        }
                        if choices.count < 4 {
                            Button("Add option", systemImage: "plus") { choices.append("") }
                        }
                        Picker("Duration", selection: $duration) {
                            ForEach([1, 6, 24, 48, 72], id: \.self) { Text("\($0) hours").tag($0) }
                        }
                    }
                }
                if kind == .pick {
                    Section(legs.count > 1 ? "\(legs.count)-leg parlay" : "Tracked pick") {
                        ForEach(legs) { leg in
                            HStack {
                                ResearchArtwork(urls: LeagueArtwork.logo(leg.sport).map { [$0] } ?? [], fallback: "sportscourt")
                                    .frame(width: 25, height: 25)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(leg.player_name).font(.subheadline.bold())
                                    Text(leg.line).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                ResearchToolBook(book: Sportsbook.normalized(leg.book), price: leg.odds)
                            }
                        }
                        .onDelete { legs.remove(atOffsets: $0) }
                        Button(legs.isEmpty ? "Add a pick" : "Add a leg", systemImage: "plus.circle") { pickBuilder = true }
                            .disabled(legs.count >= 30)
                        TextField("Stake (optional)", text: $wager).keyboardType(.decimalPad)
                    }
                }
                Section {
                    NativePhotoPicker(title: "Add photo", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .posts, account: account, userID: userID)
                    }, url: $image, uploading: $uploading)
                    NativeGIFPickerButton(account: account, userID: userID, uploadKind: .posts) { image = $0 }
                        .disabled(uploading || posting)
                    if let image {
                        if NativeGIFSource.canPlay(image) {
                            NativeGIFPlayback(url: image, maxHeight: 170)
                        } else { ResearchArtwork(urls: [image], fallback: "photo").frame(maxHeight: 170) }
                        Button("Remove attachment", systemImage: "trash", role: .destructive) { self.image = nil }
                    }
                }
                Section {
                    if kind != .pick {
                        let sports = ["NFL", "NBA", "NHL", "Soccer", "MMA", "CFB", "CBB"]
                        ResearchArtworkPicker(title: "Sport", options: (allowMLB ? ["MLB"] + sports : sports).map {
                            .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt")
                        }, selection: $sport)
                    }
                    if community?.memberOnly == true { Label("Community members", systemImage: "person.2") }
                    else {
                        Picker("Audience", selection: $audience) {
                            ForEach(Audience.allCases.filter { $0 != .personal || personalAllowed }, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    Toggle("Contains a spoiler", isOn: $spoiler)
                }
                if let notice { Text(notice).foregroundStyle(.secondary) }
            }
            .disabled(posting)
            .navigationTitle("Compose")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                guard !initialized else { return }
                initialized = true
                if let preferred = community?.preferredSport, ["NFL", "NBA", "NHL", "Soccer", "MMA", "CFB", "CBB"].contains(preferred) || allowMLB && preferred == "MLB" {
                    sport = preferred
                }
                if startWithPick && !attempted && legs.isEmpty {
                    kind = .pick
                    if let initialPick { legs = [initialPick]; sport = initialPick.sport }
                }
            }
            .onChange(of: personalAllowed) { _, allowed in if !allowed, audience == .personal { audience = .everyone } }
            .onChange(of: kind) { _, _ in notice = nil }
            .sheet(isPresented: $pickBuilder) {
                PickBuilderView(api: TrackedPickAPI(account: account, userID: userID), existing: legs, preferredSport: sport, allowMLB: allowMLB) { legs.append($0) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(posting || uploading)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(posting ? "Posting…" : "Post") { Task { await submit() } }
                        .disabled(!canPost)
                }
            }
            .interactiveDismissDisabled(posting || uploading)
        }
    }

    private func submit() async {
        guard canPost else { return }
        posting = true
        notice = nil
        defer { posting = false }
        if kind == .pick, let sport = legs.first?.sport {
            let pick = TrackedPickAPI.Draft(draftId: draftID, sport: sport, content: content, legs: legs,
                visibility: finalAudience.rawValue, isSpoiler: spoiler, wager: parsedWager, imageUrl: image, groupId: destination)
            do {
                _ = try await TrackedPickAPI(account: account, userID: userID).post(pick)
                onPost()
                dismiss()
            } catch let response as SlipSurgeHTTP.Status where (400...429).contains(response.code) {
                struct Failure: Decodable { let error: String? }
                notice = (try? JSONDecoder().decode(Failure.self, from: response.data))?.error ?? "Check your pick and try again."
            } catch {
                notice = "The post couldn’t be confirmed. Retry this draft to keep it from posting twice."
            }
            return
        }
        let draft = Draft(
            id: draftID, content: content, kind: kind, sport: sport, visibility: finalAudience, spoiler: spoiler, image: image,
            poll: kind == .poll ? .init(options: pollChoices, duration: duration) : nil, groupId: destination
        )
        do {
            let token = try await account.accessToken(for: userID)
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/mobile/posts")
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(draft)
            attempted = true
            let response = try await SlipSurgeHTTP.send(request)
            struct Posted: Decodable { let id: UUID }
            guard try JSONDecoder().decode(Posted.self, from: response).id == draftID else {
                throw URLError(.cannotParseResponse)
            }
            onPost()
            dismiss()
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            notice = "This draft may already be posted. Check the feed before making a new post."
        } catch {
            notice = attempted ? "Couldn’t confirm the post. Retry this draft to avoid creating a duplicate." : "Your account could not be verified. Try again."
        }
    }
}
