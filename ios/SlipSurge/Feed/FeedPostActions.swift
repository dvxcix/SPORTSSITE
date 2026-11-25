import SwiftUI

struct FeedPostActions: View {
    let api: FeedAPI
    let post: FeedPost
    let changed: (_ removed: Bool) -> Void
    @State private var edit = false
    @State private var delete = false
    @State private var block = false
    @State private var report = false
    @State private var draft = ""
    @State private var busy = false
    @State private var failed = false

    private var mine: Bool { api.userID == post.authorId && api.userID != nil }

    var body: some View {
        Menu("Post actions", systemImage: "ellipsis") {
            if mine {
                if let date = SidelineBoard.timestamp(post.createdAt), date.addingTimeInterval(600) > .now {
                    Button("Edit post", systemImage: "pencil") { draft = post.content; edit = true }
                }
                Button("Delete post", systemImage: "trash", role: .destructive) { delete = true }
            } else {
                Button("Not interested", systemImage: "eye.slash") { Task { _ = await save(.init(kind: "post-hide"), removed: true) } }
                if let username = post.author?.username {
                    Button("Mute @\(username)", systemImage: "speaker.slash") { Task { _ = await save(.init(kind: "author-mute"), removed: true) } }
                    if post.authorId != nil { Button("Block @\(username)", systemImage: "hand.raised", role: .destructive) { block = true } }
                }
                Button("Report post", systemImage: "flag", role: .destructive) { report = true }
            }
        }
        .labelStyle(.iconOnly)
        .disabled(busy)
        .confirmationDialog("Delete post?", isPresented: $delete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { _ = await save(.init(kind: "post-delete"), removed: true) } }
        }
        .confirmationDialog("Block this account?", isPresented: $block, titleVisibility: .visible) {
            Button("Block account", role: .destructive) { Task { await blockAuthor() } }
        }
        .sheet(isPresented: $edit) {
            NavigationStack {
                Form {
                    TextEditor(text: $draft).frame(minHeight: 130).accessibilityLabel("Post text")
                    Text("\(draft.utf16.count) / 500").foregroundStyle(.secondary)
                }
                .navigationTitle("Edit post")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { edit = false }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            Task { if await save(.init(kind: "post-edit", text: draft), removed: false) { edit = false } }
                        }
                        .disabled(busy || draft.utf16.count > 500)
                    }
                }
            }
        }
        .sheet(isPresented: $report) {
            NativeReportView(title: "Report post") { reason, text in
                try await api.mutate(post.postID, action: .init(kind: "post-report", text: text, reason: reason))
            }
        }
        .alert("Post action couldn’t be confirmed", isPresented: $failed) { Button("OK", role: .cancel) {} }
    }

    @discardableResult
    private func save(_ action: FeedAPI.Mutation, removed: Bool) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        do {
            try await api.mutate(post.postID, action: action)
            changed(removed)
            return true
        } catch { failed = true; return false }
    }

    private func blockAuthor() async {
        struct Block: Encodable { let id: String; let action = "block"; let enabled = true }
        struct Confirmation: Decodable { let ok: Bool }
        guard !busy, let id = post.authorId else { return }
        busy = true
        defer { busy = false }
        do {
            let response = try await DiscoverAPI(account: api.account, userID: api.userID).write(Confirmation.self, path: "/api/mobile/profiles",
                body: Block(id: id.uuidString.lowercased()))
            guard response.ok else { throw URLError(.cannotParseResponse) }
            changed(true)
        } catch { failed = true }
    }
}

struct NativeReportView: View {
    let title: String
    let submit: (String, String) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var details = ""
    @State private var busy = false
    @State private var failed = false

    private static let reasons = ["Spam or misleading", "Harassment or bullying", "False pick / misleading record", "Inappropriate content", "Impersonation", "Other"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Reason") {
                    ForEach(Self.reasons, id: \.self) { option in
                        Button { reason = option } label: {
                            HStack {
                                Text(option)
                                Spacer()
                                if reason == option { Image(systemName: "checkmark") }
                            }
                        }
                        .accessibilityAddTraits(reason == option ? .isSelected : [])
                    }
                }
                TextField("Details (optional)", text: $details, axis: .vertical).lineLimit(3...6)
                if failed { Text("Couldn’t submit the report. Try again.").foregroundStyle(.secondary) }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { Task { await send() } }
                        .disabled(busy || reason.isEmpty || details.utf16.count > 2000)
                }
            }
        }
    }

    private func send() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await submit(reason, details); dismiss() }
        catch { failed = true }
    }
}
