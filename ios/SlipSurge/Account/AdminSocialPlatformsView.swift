import SwiftUI

struct AdminSocialPlatformsView: View {
    private struct Platform: Decodable, Identifiable {
        let id: UUID
        let key: String
        let name: String
        let icon: String
        let template: String?

        private enum CodingKeys: String, CodingKey {
            case id, key, name
            case icon = "icon_url", template = "url_template"
        }

        var imageURL: URL? { URL(string: icon) }
        var expected: Change.Existing { .init(name: name, icon: icon, template: template) }
    }

    private struct Index: Decodable { let platforms: [Platform] }
    private struct Confirmation: Decodable { let ok: Bool }
    private struct Failure: Decodable { let error: String }

    private struct Change: Encodable {
        struct Existing: Encodable { let name: String; let icon: String; let template: String? }
        let action: String
        var id: UUID?
        var key: String?
        var name: String?
        var template: String?
        var icon: URL?
        var expected: Existing?
    }

    private struct Editor: Identifiable {
        let id = UUID()
        let platform: Platform?
        var key: String
        var name: String
        var template: String
        var icon: URL?

        init(platform: Platform? = nil) {
            self.platform = platform
            key = platform?.key ?? ""
            name = platform?.name ?? ""
            template = platform?.template ?? ""
        }

        var ready: Bool {
            let normalized = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                (platform != nil || normalized.wholeMatch(of: /[a-z0-9_]{2,30}/) != nil && icon != nil)
        }

        var change: Change {
            .init(action: platform == nil ? "create" : "edit", id: platform?.id, key: platform == nil ? key : nil,
                name: name, template: template, icon: icon, expected: platform?.expected)
        }
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var platforms: [Platform]?
    @State private var editor: Editor?
    @State private var deletion: Platform?
    @State private var issue: (any Error)?
    @State private var feedback: String?
    @State private var saving = false
    @State private var uploading = false
    @State private var revision = 0
    private static let path = "/api/mobile/admin/social-platforms"

    var body: some View {
        List {
            if let platforms {
                if let feedback { Text(feedback).font(.subheadline).foregroundStyle(.orange) }
                if platforms.isEmpty { ContentUnavailableView("No platforms yet", systemImage: "at") }
                ForEach(platforms) { platform in
                    Button { feedback = nil; editor = Editor(platform: platform) } label: {
                        HStack(spacing: 10) {
                            artwork(platform.imageURL)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(platform.name).font(.subheadline.weight(.semibold))
                                Text(platform.template ?? "Badge only").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        }.contentShape(.rect)
                    }.buttonStyle(.plain)
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) { feedback = nil; deletion = platform }
                    }
                }
            } else {
                ResearchToolMessage(title: "Social platforms couldn’t load", error: issue) { revision += 1 }
            }
        }
        .navigationTitle("Social platforms")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .toolbar {
            if platforms != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New platform", systemImage: "plus") { feedback = nil; editor = Editor() }.labelStyle(.iconOnly)
                }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $editor) { initial in
            NavigationStack { editorForm(initial) }.presentationDragIndicator(.visible).interactiveDismissDisabled(saving || uploading)
        }
        .confirmationDialog("Delete social platform?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }),
            titleVisibility: .visible, presenting: deletion) { platform in
            Button("Delete \(platform.name)", role: .destructive) {
                Task { await apply(.init(action: "delete", id: platform.id, expected: platform.expected)) }
            }
        } message: { _ in Text("Member handles stay saved. This platform’s badge will disappear from profiles.") }
        .disabled(saving && editor == nil)
    }

    private func editorForm(_ initial: Editor) -> some View {
        Form {
            Section {
                if initial.platform == nil {
                    TextField("Key", text: field(\.key)).textInputAutocapitalization(.never).autocorrectionDisabled()
                } else {
                    LabeledContent("Key", value: initial.key)
                }
                TextField("Display name", text: field(\.name))
                TextField("Profile URL template", text: field(\.template))
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            } footer: {
                Text("Use {handle} where the public profile URL needs the member’s handle. Leave the URL blank for a badge.")
            }
            Section("Icon") {
                HStack {
                    artwork(editor?.icon ?? initial.platform?.imageURL)
                    if let userID = api.userID {
                        NativePhotoPicker(title: initial.platform == nil ? "Choose icon" : "Replace icon", upload: {
                            try await NativeMediaUpload.upload($0, kind: .socialPlatforms, account: api.account, userID: userID)
                        }, url: Binding(get: { editor?.icon }, set: { editor?.icon = $0 }), uploading: $uploading)
                    }
                }
            }
            if let feedback { Text(feedback).font(.subheadline).foregroundStyle(.orange) }
        }
        .navigationTitle(initial.platform == nil ? "New platform" : "Edit platform")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { editor = nil; feedback = nil }.disabled(saving || uploading)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { if let editor { Task { await apply(editor.change) } } }
                    .disabled(editor?.ready != true || saving || uploading)
            }
        }
    }

    private func field(_ key: WritableKeyPath<Editor, String>) -> Binding<String> {
        Binding(get: { editor?[keyPath: key] ?? "" }, set: { editor?[keyPath: key] = $0 })
    }

    private func artwork(_ url: URL?) -> some View {
        ResearchArtwork(urls: url.map { [$0] } ?? [], fallback: "at").frame(width: 35, height: 35).accessibilityHidden(true)
    }

    private func load() async {
        do {
            let snapshot = try await api.memberRead(Index.self, path: Self.path)
            try Task.checkCancellation()
            platforms = snapshot.platforms
            issue = nil
        } catch {
            if !Task.isCancelled { self.issue = error }
        }
    }

    private func apply(_ change: Change) async {
        guard !saving else { return }
        saving = true
        feedback = nil
        defer { saving = false }
        do {
            let result = try await api.write(Confirmation.self, path: Self.path, body: change)
            guard result.ok else { throw URLError(.badServerResponse) }
            editor = nil
            await load()
        } catch let error as SlipSurgeHTTP.Status {
            feedback = (try? JSONDecoder().decode(Failure.self, from: error.data))?.error ?? "The platform change couldn’t be confirmed."
            if error.code == 409 { await load() }
        } catch {
            feedback = "The platform change couldn’t be confirmed."
        }
    }
}
