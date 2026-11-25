import SwiftUI
import UIKit

private struct AnnouncementsAdminAPI {
    struct Data: Decodable {
        struct Preset: Decodable, Identifiable {
            let label: String
            let bg: String
            let text: String
            var id: String { label }
        }
        let banner: SiteAnnouncements.Banner?
        let entries: [SiteAnnouncements.Release]
        let presets: [Preset]
    }

    let account: AccountStore
    let userID: UUID
    private static let path = "/api/mobile/admin/announcements"

    func read() async throws -> Data {
        try await DiscoverAPI(account: account, userID: userID).readPublic(Data.self, path: Self.path)
    }

    func write<Body: Encodable>(_ body: Body) async throws {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path, timeout: 40)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await SlipSurgeHTTP.send(request)
        guard await account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
    }

    static func message(_ error: any Error) -> String {
        struct Problem: Decodable { let error: String }
        if let response = error as? SlipSurgeHTTP.Status, let text = try? JSONDecoder().decode(Problem.self, from: response.data) {
            return text.error
        }
        return "The change couldn’t be confirmed. Try again."
    }
}

struct AdminAnnouncementsView: View {
    private enum Page: String, CaseIterable { case banner = "Site Banner", changelog = "Changelog" }
    private struct Editor: Identifiable {
        let id = UUID()
        let release: SiteAnnouncements.Release?
    }

    let account: AccountStore
    let userID: UUID
    @State private var page = Page.banner
    @State private var data: AnnouncementsAdminAPI.Data?
    @State private var edit: Editor?
    @State private var pendingDelete: SiteAnnouncements.Release?
    @State private var loadingError: (any Error)?
    @State private var message: String?
    @State private var revision = 0

    private var api: AnnouncementsAdminAPI { .init(account: account, userID: userID) }

    var body: some View {
        Group {
            if let data {
                Form {
                    Picker("Announcement type", selection: $page) {
                        ForEach(Page.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    switch page {
                    case .banner:
                        if let banner = data.banner {
                            AdminBannerEditor(banner: banner, presets: data.presets, api: api) { revision += 1 }
                                .id(banner.updatedAt)
                        } else {
                            ContentUnavailableView("No banner configuration", systemImage: "megaphone")
                        }
                    case .changelog:
                        changelog(data.entries)
                    }
                }
            } else {
                ResearchToolMessage(title: "Announcements couldn’t load", error: loadingError) { revision += 1 }
            }
        }
        .navigationTitle("Announcements")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $edit) { editor in
            NavigationStack {
                AdminReleaseEditor(entry: editor.release, api: api) { revision += 1 }
            }
        }
        .confirmationDialog("Delete changelog entry?", isPresented: Binding(get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible, presenting: pendingDelete) { entry in
                Button("Delete entry", role: .destructive) { Task { await remove(entry) } }
            } message: { entry in
                Text("Delete “\(entry.title)” and its member dismissal records?")
            }
        .alert("Announcement update", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) { message = nil }
        } message: { Text(message ?? "") }
    }

    @ViewBuilder
    private func changelog(_ entries: [SiteAnnouncements.Release]) -> some View {
        Button("New entry", systemImage: "plus") { edit = .init(release: nil) }
        Section("Updates") {
            if entries.isEmpty {
                ContentUnavailableView("No changelog entries", systemImage: "doc.text")
            }
            ForEach(entries) { entry in
                Button {
                    edit = .init(release: entry)
                } label: {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                            Text(entry.audienceTier == "ultimate" ? "Ultimate" : "All members")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(entry.isActive == true ? "Active" : "Draft")
                            .font(.caption.weight(.semibold)).foregroundStyle(entry.isActive == true ? .green : .secondary)
                    }
                    .frame(minHeight: 44)
                }
                .swipeActions { Button("Delete", role: .destructive) { pendingDelete = entry } }
                .contextMenu {
                    Button("Edit", systemImage: "pencil") { edit = .init(release: entry) }
                    Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = entry }
                }
            }
        }
    }

    private func load() async {
        do {
            let snapshot = try await api.read()
            try Task.checkCancellation()
            data = snapshot
            loadingError = nil
        } catch { if !Task.isCancelled { loadingError = error } }
    }

    private func remove(_ entry: SiteAnnouncements.Release) async {
        struct Removal: Encodable {
            let kind = "remove"
            let id: String
            let expectedUpdatedAt: String
            let expectedActive: Bool
        }
        do {
            try await api.write(Removal(id: entry.id.uuidString.lowercased(), expectedUpdatedAt: entry.updatedAt,
                expectedActive: entry.isActive == true))
            revision += 1
        } catch { message = AnnouncementsAdminAPI.message(error) }
    }
}

private struct AdminBannerEditor: View {
    let banner: SiteAnnouncements.Banner
    let presets: [AnnouncementsAdminAPI.Data.Preset]
    let api: AnnouncementsAdminAPI
    let refresh: () -> Void
    @State private var message: String
    @State private var background: String
    @State private var foreground: String
    @State private var active: Bool
    @State private var dismissible: Bool
    @State private var linkURL: String
    @State private var linkLabel: String
    @State private var saving = false
    @State private var confirm = false
    @State private var problem: String?

    init(banner: SiteAnnouncements.Banner, presets: [AnnouncementsAdminAPI.Data.Preset], api: AnnouncementsAdminAPI,
        refresh: @escaping () -> Void) {
        self.banner = banner
        self.presets = presets
        self.api = api
        self.refresh = refresh
        _message = State(initialValue: banner.message)
        _background = State(initialValue: banner.bgColor)
        _foreground = State(initialValue: banner.textColor)
        _active = State(initialValue: banner.isActive)
        _dismissible = State(initialValue: banner.dismissible)
        _linkURL = State(initialValue: banner.linkUrl ?? "")
        _linkLabel = State(initialValue: banner.linkLabel ?? "")
    }

    var body: some View {
        Section("Preview") {
            if message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("Add a message to see the preview").foregroundStyle(.secondary)
            } else {
                let preview = SiteAnnouncements.Banner(message: message, bgColor: background, textColor: foreground,
                    isActive: active, dismissible: dismissible, linkUrl: linkURL, linkLabel: linkLabel, updatedAt: banner.updatedAt)
                SiteAnnouncementBanner(banner: preview, onClose: {}).clipShape(.rect(cornerRadius: 9)).allowsHitTesting(false)
            }
        }
        Section("Message") {
            TextEditor(text: $message).frame(minHeight: 74).accessibilityLabel("Banner message")
            Text("\(message.utf16.count) / 280").font(.caption).foregroundStyle(.secondary)
            TextField("Link URL", text: $linkURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Link label", text: $linkLabel)
        }
        Section("Colors") {
            ColorPicker("Background", selection: color($background), supportsOpacity: false)
            ColorPicker("Text", selection: color($foreground), supportsOpacity: false)
            Menu {
                ForEach(presets) { preset in
                    Button(preset.label) { background = preset.bg; foreground = preset.text }
                }
            } label: { Label("Color presets", systemImage: "paintpalette") }
        }
        Section {
            Toggle("Active", isOn: $active)
            Toggle("Dismissible", isOn: $dismissible)
        }
        Section {
            if let problem { Text(problem).font(.caption).foregroundStyle(.red) }
            Button("Save banner") { confirm = true }
                .disabled(saving || message.utf16.count > 280 || (!linkURL.isEmpty && SiteAnnouncements.link(linkURL) == nil))
        }
        .confirmationDialog("Save site banner?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Save banner") { Task { await save() } }
        } message: { Text(active ? "The banner will appear on SlipSurge for all visitors." : "The banner will stay inactive.") }
    }

    private func color(_ value: Binding<String>) -> Binding<Color> {
        Binding(get: { Color(hex: value.wrappedValue) ?? .clear }, set: { newColor in
            var red = CGFloat(0)
            var green = CGFloat(0)
            var blue = CGFloat(0)
            var alpha = CGFloat(0)
            guard UIColor(newColor).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return }
            func channel(_ value: CGFloat) -> Int { Int((min(1, max(0, value)) * 255).rounded()) }
            value.wrappedValue = String(format: "#%02x%02x%02x", channel(red), channel(green), channel(blue))
        })
    }

    private func save() async {
        struct Change: Encodable {
            let kind = "banner"
            let expectedUpdatedAt: String
            let message: String
            let background: String
            let foreground: String
            let active: Bool
            let dismissible: Bool
            let linkUrl: String
            let linkLabel: String
        }
        guard !saving else { return }
        saving = true
        problem = nil
        defer { saving = false }
        do {
            try await api.write(Change(expectedUpdatedAt: banner.updatedAt, message: message, background: background,
                foreground: foreground, active: active, dismissible: dismissible, linkUrl: linkURL, linkLabel: linkLabel))
            refresh()
        } catch { problem = AnnouncementsAdminAPI.message(error) }
    }
}

private struct AdminReleaseEditor: View {
    let entry: SiteAnnouncements.Release?
    let api: AnnouncementsAdminAPI
    let refresh: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var id: UUID
    @State private var title: String
    @State private var description: String
    @State private var instructions: String
    @State private var audience: String
    @State private var active: Bool
    @State private var screenshots: [URL]
    @State private var newScreenshot: URL?
    @State private var uploading = false
    @State private var saving = false
    @State private var preview = false
    @State private var confirm = false
    @State private var problem: String?

    init(entry: SiteAnnouncements.Release?, api: AnnouncementsAdminAPI, refresh: @escaping () -> Void) {
        self.entry = entry
        self.api = api
        self.refresh = refresh
        _id = State(initialValue: entry?.id ?? UUID())
        _title = State(initialValue: entry?.title ?? "")
        _description = State(initialValue: entry?.description ?? "")
        _instructions = State(initialValue: entry?.howToUse ?? "")
        _audience = State(initialValue: entry?.audienceTier ?? "all")
        _active = State(initialValue: entry?.isActive == true)
        _screenshots = State(initialValue: entry?.screenshotUrls ?? [])
    }

    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            title.utf16.count <= 220 && description.utf16.count <= 20_000 && instructions.utf16.count <= 20_000
    }

    var body: some View {
        Form {
            Section("What changed") {
                TextField("Title", text: $title)
                TextEditor(text: $description).frame(minHeight: 100).accessibilityLabel("Description")
            }
            Section("How to use it") {
                TextEditor(text: $instructions).frame(minHeight: 76).accessibilityLabel("Optional instructions")
            }
            Section("Screenshots") {
                ForEach(Array(screenshots.enumerated()), id: \.offset) { index, screenshot in
                    HStack {
                        ResearchArtwork(urls: [screenshot], fallback: "photo").frame(width: 64, height: 46)
                        Text("Screenshot \(index + 1)").font(.subheadline)
                        Spacer()
                        Button("Remove screenshot \(index + 1)", systemImage: "xmark.circle", role: .destructive) {
                            screenshots.remove(at: index)
                        }.labelStyle(.iconOnly)
                    }
                }
                if screenshots.count < 30 {
                    NativePhotoPicker(title: "Attach screenshot", upload: { photo in
                        try await NativeMediaUpload.upload(photo, kind: .changelog, account: api.account, userID: api.userID)
                    }, url: $newScreenshot, uploading: $uploading)
                }
            }
            Section {
                Picker("Audience", selection: $audience) {
                    Text("All members").tag("all")
                    Text("Ultimate").tag("ultimate")
                }
                Toggle("Active", isOn: $active)
                Button("Preview popup", systemImage: "rectangle.on.rectangle") { preview = true }.disabled(!valid)
            }
            if let problem { Section { Text(problem).font(.caption).foregroundStyle(.red) } }
        }
        .navigationTitle(entry == nil ? "New Changelog Entry" : "Edit Changelog Entry")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { confirm = true }.disabled(!valid || saving || uploading)
            }
        }
        .onChange(of: newScreenshot) { _, new in
            if let new, !screenshots.contains(new) { screenshots.append(new) }
            newScreenshot = nil
        }
        .sheet(isPresented: $preview) {
            let draft = SiteAnnouncements.Release(id: id, title: title, description: description, howToUse: instructions,
                screenshotUrls: screenshots, audienceTier: audience, createdAt: "", updatedAt: "", isActive: active)
            NavigationStack {
                ReleaseAnnouncementView(release: draft, actionTitle: "Close preview", action: { preview = false })
                    .navigationTitle("What’s New")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .confirmationDialog(active ? "Publish this update?" : "Save this draft?", isPresented: $confirm, titleVisibility: .visible) {
            Button(active ? "Publish update" : "Save draft") { Task { await save() } }
        } message: { Text(active ? "Eligible members will see this update on their next visit." : "Members will only see the update when it’s active.") }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        problem = nil
        defer { saving = false }
        do {
            let change = Change(id: id.uuidString.lowercased(), expectedUpdatedAt: entry?.updatedAt,
                expectedActive: entry?.isActive ?? false, title: title, description: description, instructions: instructions,
                screenshots: screenshots.map(\.absoluteString), audience: audience, active: active)
            try await api.write(change)
            refresh()
            dismiss()
        } catch { problem = AnnouncementsAdminAPI.message(error) }
    }

    private struct Change: Encodable {
        let id: String
        let expectedUpdatedAt: String?
        let expectedActive: Bool
        let title: String
        let description: String
        let instructions: String
        let screenshots: [String]
        let audience: String
        let active: Bool

        enum CodingKeys: String, CodingKey {
            case kind, id, expectedUpdatedAt, expectedActive, title, description, instructions, screenshots, audience, active
        }

        func encode(to encoder: any Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode("release", forKey: .kind)
            try values.encode(id, forKey: .id)
            try values.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
            try values.encode(expectedActive, forKey: .expectedActive)
            try values.encode(title, forKey: .title)
            try values.encode(description, forKey: .description)
            try values.encode(instructions, forKey: .instructions)
            try values.encode(screenshots, forKey: .screenshots)
            try values.encode(audience, forKey: .audience)
            try values.encode(active, forKey: .active)
        }
    }
}
