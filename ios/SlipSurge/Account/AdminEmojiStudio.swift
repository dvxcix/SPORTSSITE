import SwiftUI

struct AdminEmojiStudio: View {
    struct Category: Decodable, Identifiable { let id: UUID; let name: String }
    struct Emoji: Decodable, Identifiable {
        struct Group: Decodable { let name: String }
        let id: UUID
        let code: String
        let imageUrl: String
        let categoryId: UUID?
        let category: Group?
        var artwork: URL? { URL(string: imageUrl).flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil } }
    }

    private struct Index: Decodable { let emojis: [Emoji]; let categories: [Category]; let next: String? }
    private struct Editor: Identifiable { let id = UUID(); var emoji: Emoji? }
    private struct Removal: Identifiable { let id: UUID; let title: String; let action: String }
    private struct Receipt: Decodable { let id: UUID }

    let viewer: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @Environment(\.nativeEmojiLibrary) private var library
    @State private var entries: [Emoji]?
    @State private var categories: [Category] = []
    @State private var after: String?
    @State private var issue: (any Error)?
    @State private var error = false
    @State private var working = false
    @State private var editing: Editor?
    @State private var removing: Removal?
    @State private var addCategory = false
    @State private var name = ""
    @State private var categoryDraftID = UUID()
    @State private var revision = 0

    private static let path = "/api/mobile/admin/emojis"

    var body: some View {
        List {
            if let entries {
                Section("Categories") {
                    ForEach(categories) { category in
                        HStack {
                            Text(category.name)
                            Spacer()
                            Button("Delete category", systemImage: "trash", role: .destructive) {
                                removing = .init(id: category.id, title: "Delete \(category.name)?", action: "deleteCategory")
                            }.labelStyle(.iconOnly).buttonStyle(.borderless).disabled(working)
                        }
                    }
                    Button("Add category", systemImage: "folder.badge.plus") { name = ""; categoryDraftID = UUID(); addCategory = true }
                }
                Section("Custom emoji") {
                    if entries.isEmpty { Text("No custom emoji yet").foregroundStyle(.secondary) }
                    ForEach(entries) { emoji in
                        HStack(spacing: 10) {
                            ResearchArtwork(urls: [emoji.artwork].compactMap { $0 }, fallback: "face.smiling").frame(width: 32, height: 32)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(":\(emoji.code):").font(.subheadline.monospaced())
                                Text(emoji.category?.name ?? "Other").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Menu("Emoji actions", systemImage: "ellipsis") {
                                Button("Edit emoji", systemImage: "pencil") { editing = .init(emoji: emoji) }
                                Button("Delete emoji", systemImage: "trash", role: .destructive) {
                                    removing = .init(id: emoji.id, title: "Delete :\(emoji.code):?", action: "deleteEmoji")
                                }
                            }.labelStyle(.iconOnly).disabled(working)
                        }
                    }
                    if let after { Button("More emoji") { Task { await load(after: after) } }.disabled(working) }
                }
            } else {
                ResearchToolMessage(title: "Custom emoji couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .navigationTitle("Custom emoji")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if entries != nil {
                ToolbarItem(placement: .topBarTrailing) { Button("Add emoji", systemImage: "plus") { editing = .init() } }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { value in
            NavigationStack {
                AdminEmojiEditor(viewer: viewer, categories: categories, emoji: value.emoji) { await refreshCatalog() }
            }
        }
        .alert("New emoji category", isPresented: $addCategory) {
            TextField("Category name", text: $name)
            Button("Add") { Task { await change(categoryDraftID, action: "createCategory", name: name) } }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(removing?.title ?? "Delete emoji item?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible, presenting: removing) { value in
                Button("Delete", role: .destructive) { Task { await change(value.id, action: value.action) } }
            } message: { value in
                Text(value.action == "deleteCategory" ? "Its emoji will remain under Other." : "Posts that use this code will display the shortcode.")
            }
        .alert("Change couldn’t be confirmed", isPresented: $error) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
    }

    private func load(after expected: String? = nil) async {
        do {
            var query: [URLQueryItem] = []
            if let expected { query.append(.init(name: "after", value: expected)) }
            let result = try await viewer.readPublic(Index.self, path: Self.path, query: query)
            guard !Task.isCancelled, expected == nil || expected == after else { return }
            let existing = expected == nil ? [] : entries ?? []
            let ids = Set(existing.map(\.id))
            entries = existing + result.emojis.filter { !ids.contains($0.id) }
            categories = result.categories
            after = result.next
            issue = nil
        } catch { if !Task.isCancelled { issue = error } }
    }

    private func change(_ id: UUID, action: String, name: String? = nil) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            var values = ["id": id.uuidString.lowercased(), "action": action]
            if let name { values["name"] = name }
            let receipt = try await viewer.write(Receipt.self, path: Self.path, body: values)
            guard receipt.id == id else { throw URLError(.badServerResponse) }
            await refreshCatalog()
        } catch { self.error = true }
    }

    private func refreshCatalog() async {
        await load()
        await library?.refresh(force: true)
    }
}

private struct AdminEmojiEditor: View {
    typealias Emoji = AdminEmojiStudio.Emoji
    typealias Category = AdminEmojiStudio.Category
    let viewer: DiscoverAPI
    let categories: [Category]
    let emoji: Emoji?
    let saved: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var identifier = UUID()
    @State private var code = ""
    @State private var category = ""
    @State private var image: URL?
    @State private var uploading = false
    @State private var saving = false
    @State private var problem: String?

    private struct Write: Encodable {
        struct Existing: Encodable {
            let code: String; let image: String; let category: String?
            enum CodingKeys: CodingKey { case code, image, category }
            func encode(to encoder: any Encoder) throws {
                var fields = encoder.container(keyedBy: CodingKeys.self)
                try fields.encode(code, forKey: .code)
                try fields.encode(image, forKey: .image)
                try fields.encode(category, forKey: .category)
            }
        }
        let id: String; let action: String; let code: String; let category: String?; let image: URL?; let expected: Existing?
    }

    var body: some View {
        Form {
            Section {
                TextField("Shortcode", text: $code).autocorrectionDisabled().textInputAutocapitalization(.never)
                ResearchArtworkPicker(title: "Category", options: [.init(id: "", title: "Other", icon: "folder")]
                    + categories.map { .init(id: $0.id.uuidString, title: $0.name, icon: "folder") }, selection: $category)
                if let viewerID = viewer.userID {
                    NativePhotoPicker(title: emoji == nil ? "Choose emoji image" : "Replace image", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .emojis, account: viewer.account, userID: viewerID)
                    }, url: $image, uploading: $uploading)
                }
                if let url = image ?? emoji?.artwork { ResearchArtwork(urls: [url], fallback: "face.smiling").frame(height: 74) }
            } footer: { Text("Use 2–30 letters, numbers or underscores.") }
            if let problem { Text(problem).foregroundStyle(.secondary) }
        }
        .navigationTitle(emoji == nil ? "Add custom emoji" : "Edit emoji")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(saving || uploading || code.isEmpty || emoji == nil && image == nil)
            }
        }
        .interactiveDismissDisabled(saving)
        .onAppear {
            if let emoji, code.isEmpty { code = emoji.code; category = emoji.categoryId?.uuidString ?? "" }
        }
    }

    private func save() async {
        struct Receipt: Decodable { let id: UUID }
        saving = true
        defer { saving = false }
        let id = emoji?.id ?? identifier
        let payload = Write(id: id.uuidString.lowercased(), action: emoji == nil ? "createEmoji" : "editEmoji", code: code,
            category: UUID(uuidString: category)?.uuidString.lowercased(), image: image,
            expected: emoji.map { .init(code: $0.code, image: $0.imageUrl, category: $0.categoryId?.uuidString.lowercased()) })
        do {
            let receipt = try await viewer.write(Receipt.self, path: "/api/mobile/admin/emojis", body: payload)
            guard receipt.id == id else { throw URLError(.badServerResponse) }
            await saved()
            dismiss()
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            problem = "This code is in use or the emoji changed. Reload before editing again."
        } catch { problem = "This emoji couldn’t be saved. Check the code and image." }
    }
}
