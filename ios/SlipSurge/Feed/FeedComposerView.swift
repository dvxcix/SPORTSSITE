import SwiftUI

struct FeedComposerView: View {
    let account: AccountStore
    let userID: UUID
    let allowMLB: Bool
    let onPost: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draftID = UUID()
    @State private var content = ""
    @State private var kind = Kind.text
    @State private var sport = "NFL"
    @State private var audience = Audience.everyone
    @State private var spoiler = false
    @State private var choices = ["", ""]
    @State private var duration = 24
    @State private var posting = false
    @State private var notice: String?
    @State private var attempted = false

    private enum Kind: String, CaseIterable, Encodable {
        case text, analysis, poll
        var label: String { self == .text ? "Post" : rawValue.capitalized }
    }

    private enum Audience: String, CaseIterable, Encodable {
        case everyone = "public"
        case followers
        var label: String { self == .everyone ? "Public" : "Followers" }
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
        let poll: Poll?
    }

    private var pollChoices: [String] {
        choices.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private var canPost: Bool {
        !posting && content.utf16.count <= 500 &&
            (kind == .poll
                ? pollChoices.count >= 2 && pollChoices.allSatisfy { $0.utf16.count <= 80 }
                : !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
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
                Section {
                    Picker("Sport", selection: $sport) {
                        let sports = ["NFL", "NBA", "NHL", "Soccer", "MMA", "CFB", "CBB"]
                        ForEach(allowMLB ? ["MLB"] + sports : sports, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Audience", selection: $audience) {
                        ForEach(Audience.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Toggle("Contains a spoiler", isOn: $spoiler)
                }
                if let notice { Text(notice).foregroundStyle(.secondary) }
            }
            .disabled(posting)
            .navigationTitle("Compose")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(posting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(posting ? "Posting…" : "Post") { Task { await submit() } }
                        .disabled(!canPost)
                }
            }
            .interactiveDismissDisabled(posting)
        }
    }

    private func submit() async {
        guard canPost else { return }
        posting = true
        notice = nil
        defer { posting = false }
        let draft = Draft(
            id: draftID, content: content, kind: kind, sport: sport, visibility: audience, spoiler: spoiler,
            poll: kind == .poll ? .init(options: pollChoices, duration: duration) : nil
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
        } catch let error as SlipSurgeHTTP.Status where error.code == 404 {
            notice = "Posting isn’t available from this build yet."
        } catch {
            notice = attempted ? "Couldn’t confirm the post. Retry this draft to avoid creating a duplicate." : "Your account could not be verified. Try again."
        }
    }
}
