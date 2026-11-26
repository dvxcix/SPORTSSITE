import SwiftUI

struct AdminPlatformSettingsView: View {
    enum Page: String, CaseIterable, Identifiable {
        case general, login, writing, code

        var id: String { rawValue }
        var title: String {
            switch self {
            case .general: "Platform settings"
            case .login: "Social login"
            case .writing: "Article generation"
            case .code: "Website custom code"
            }
        }

        var icon: String {
            switch self {
            case .general: "gearshape"
            case .login: "person.crop.circle.badge.checkmark"
            case .writing: "text.page.badge.magnifyingglass"
            case .code: "chevron.left.forwardslash.chevron.right"
            }
        }
    }

    fileprivate struct Setting: Decodable, Identifiable {
        enum Kind: String, Decodable { case text, email, toggle, number, code }
        let key: String
        let label: String
        let kind: Kind
        let fallback: String
        var present: Bool
        var stored: String?
        var id: String { key }
        var value: String { kind == .toggle && present ? (stored == "true" ? "true" : "false") : stored ?? fallback }
    }

    private struct Snapshot: Decodable {
        struct Login: Decodable { let handoffReady: Bool; let providers: [SignInProvider] }
        struct Writing: Decodable { let configured: Bool; let model: String; let defaultTone: String }
        var fields: [Setting]?
        let login: Login?
        let writing: Writing?
    }

    let api: DiscoverAPI
    let page: Page
    @Environment(\.slipPalette) private var slipPalette
    @State private var snapshot: Snapshot?
    @State private var issue: (any Error)?
    @State private var revision = 0
    @State private var editing: Setting?

    fileprivate static let path = "/api/mobile/admin/platform-settings"

    var body: some View {
        List {
            if let snapshot {
                sections(snapshot)
            } else {
                ResearchToolMessage(title: "Settings couldn’t load", error: issue) { revision += 1 }
            }
        }
        .navigationTitle(page.title)
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { setting in
            NavigationStack {
                PlatformSettingEditor(api: api, setting: setting) { updated in
                    guard let index = snapshot?.fields?.firstIndex(where: { $0.key == setting.key }) else { return }
                    snapshot?.fields?[index] = updated
                }
            }
            .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder private func sections(_ snapshot: Snapshot) -> some View {
        if let fields = snapshot.fields {
            Section(page == .code ? "Website code" : "General") {
                ForEach(fields) { field in
                    Button { editing = field } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(field.label).foregroundStyle(.primary)
                                if field.kind == .toggle {
                                    Label(field.value == "true" ? "On" : "Off", systemImage: field.value == "true" ? "checkmark.circle.fill" : "circle")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                } else {
                                    Text(field.kind == .code ? (field.value.isEmpty ? "Empty" : "\(field.value.count.formatted()) characters") :
                                        (field.value.isEmpty ? "Unset" : field.value))
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "pencil").foregroundStyle(.secondary).accessibilityHidden(true)
                        }
                        .frame(minHeight: 44).contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        if let login = snapshot.login {
            Section("Native sign-in") {
                StatusRow(label: "OAuth handoff", active: login.handoffReady)
                ForEach(login.providers) { provider in
                    Label {
                        Text(provider.title)
                    } icon: {
                        Image("sign-in-\(provider.rawValue)").resizable().scaledToFit().frame(width: 24, height: 24)
                            .accessibilityHidden(true)
                    }
                }
            }
        }
        if let writing = snapshot.writing {
            Section("Article generation service") {
                StatusRow(label: "Anthropic API", active: writing.configured)
                LabeledContent("Model") { Text(writing.model).monospaced().multilineTextAlignment(.trailing) }
                LabeledContent("Default tone", value: writing.defaultTone.capitalized)
            }
        }
    }

    private func load() async {
        do {
            let value = try await api.memberRead(Snapshot.self, path: Self.path, query: [.init(name: "page", value: page.rawValue)])
            try Task.checkCancellation()
            snapshot = value
            issue = nil
        } catch is CancellationError {
            return
        } catch {
            snapshot = nil
            issue = error
        }
    }

    private struct StatusRow: View {
        let label: String
        let active: Bool

        var body: some View {
            LabeledContent(label) {
                Label(active ? "Configured" : "Needs setup", systemImage: active ? "checkmark.circle.fill" : "exclamationmark.circle")
                    .foregroundStyle(active ? Color.green : Color.orange)
            }
        }
    }
}

private struct PlatformSettingEditor: View {
    private struct Change: Encodable {
        let key: String
        let present: Bool
        let stored: String?
        let value: String

        enum CodingKeys: String, CodingKey { case key, present, stored, value }
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(key, forKey: .key)
            try container.encode(present, forKey: .present)
            try container.encode(stored, forKey: .stored)
            try container.encode(value, forKey: .value)
        }
    }

    private struct Changed: Decodable { let stored: String }
    private struct ErrorBody: Decodable { let error: String }

    let api: DiscoverAPI
    let setting: AdminPlatformSettingsView.Setting
    let onSave: (AdminPlatformSettingsView.Setting) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var value: String
    @State private var confirmation = false
    @State private var saving = false
    @State private var conflict = false
    @State private var message: String?

    init(api: DiscoverAPI, setting: AdminPlatformSettingsView.Setting, onSave: @escaping (AdminPlatformSettingsView.Setting) -> Void) {
        self.api = api
        self.setting = setting
        self.onSave = onSave
        _value = State(initialValue: setting.value)
    }

    var body: some View {
        Form {
            Section {
                switch setting.kind {
                case .code:
                    TextEditor(text: $value).font(.body.monospaced()).frame(minHeight: 250)
                        .autocorrectionDisabled().textInputAutocapitalization(.never).accessibilityLabel(setting.label)
                case .toggle:
                    Toggle(setting.label, isOn: Binding(get: { value == "true" }, set: { value = String($0) }))
                case .text, .email, .number:
                    TextField(setting.label, text: $value)
                        .keyboardType(setting.kind == .email ? .emailAddress : setting.kind == .number ? .numberPad : .default)
                        .autocorrectionDisabled(setting.kind != .text)
                        .textInputAutocapitalization(setting.kind == .text ? .sentences : .never)
                }
            }
            .disabled(saving)
            if let message {
                Label(message, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.secondary)
            }
            if saving { ProgressView("Saving setting") }
        }
        .tint(slipPalette.accent)
        .navigationTitle(setting.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { confirmation = true }
                    .disabled(saving || conflict || value == setting.value)
            }
        }
        .interactiveDismissDisabled(saving)
        .confirmationDialog("Save \(setting.label.lowercased())?", isPresented: $confirmation, titleVisibility: .visible) {
            Button("Save setting") { Task { await save() } }
        } message: {
            Text(setting.kind == .code ? "This replaces the saved code for the website." : "This updates the shared SlipSurge setting.")
        }
    }

    private func save() async {
        guard !saving, !conflict else { return }
        saving = true
        defer { saving = false }
        do {
            let result = try await api.write(Changed.self, path: AdminPlatformSettingsView.path,
                body: Change(key: setting.key, present: setting.present, stored: setting.stored, value: value))
            var updated = setting
            updated.present = true
            updated.stored = result.stored
            onSave(updated)
            dismiss()
        } catch let error as SlipSurgeHTTP.Status {
            conflict = error.code == 409
            message = (try? JSONDecoder().decode(ErrorBody.self, from: error.data))?.error ?? "The setting change couldn’t be confirmed."
        } catch {
            message = "The setting change couldn’t be confirmed."
        }
    }
}
