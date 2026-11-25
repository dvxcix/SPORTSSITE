import SwiftUI

struct CommunityMemberPreferences: View {
    private enum Alerts: String, CaseIterable, Encodable {
        case all, highlights, mentions, muted

        var title: String {
            switch self {
            case .all: "All activity"
            case .highlights: "Highlights"
            case .mentions: "Mentions only"
            case .muted: "Muted"
            }
        }
    }

    private struct Page: Decodable {
        struct Settings: Decodable {
            let notificationLevel: String
            let flair: String?
            let onboardingCompletedAt: String?
            let rulesAcceptedAt: String?
        }

        let rules: String?
        let preferences: Settings?
        let channels: [MessagesAPI.Channel]
        let selected: [UUID]
    }

    let api: DiscoverAPI
    let group: DiscoverAPI.Communities.Community
    let saved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var page: Page?
    @State private var error: (any Error)?
    @State private var accept = false
    @State private var channels = Set<UUID>()
    @State private var alerts = Alerts.highlights
    @State private var flair = ""
    @State private var busy = false
    @State private var message: String?
    @State private var retry = 0

    private var path: String { "/api/mobile/communities/\(group.id.uuidString.lowercased())/preferences" }

    var body: some View {
        NavigationStack {
            Form {
                if let page {
                    Section("Community rules") {
                        Text(page.rules?.isEmpty == false ? page.rules ?? "" : "SlipSurge community standards apply.")
                            .font(.subheadline)
                        Toggle("I agree to the community rules", isOn: $accept)
                    }.listRowBackground(Brand.surface(for: scheme))
                    if !page.channels.isEmpty {
                        Section("Favorite channels") {
                            ForEach(page.channels) { channel in
                                Toggle(isOn: included(channel.id)) {
                                    HStack(spacing: 8) {
                                        if let icon = channel.icon, icon != "#" { Text(icon).accessibilityHidden(true) }
                                        else { Image(systemName: "number").accessibilityHidden(true) }
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(channel.name).font(.subheadline.weight(.semibold))
                                            if let detail = channel.description { Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                                        }
                                    }
                                }
                            }
                        }.listRowBackground(Brand.surface(for: scheme))
                    }
                    Section("Membership preferences") {
                        TextField("Community flair", text: $flair, prompt: Text("Optional"))
                        Picker("Notifications", selection: $alerts) {
                            ForEach(Alerts.allCases, id: \.self) { Text($0.title).tag($0) }
                        }
                    }.listRowBackground(Brand.surface(for: scheme))
                    if let message { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                } else {
                    ResearchToolMessage(title: "Preferences couldn’t load", error: error) { retry += 1 }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .navigationTitle(group.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close", role: .cancel) { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() }
                    else { Button("Save") { Task { await save() } }.disabled(page == nil || !accept || flair.count > 32) }
                }
            }
            .disabled(busy)
            .task(id: retry) { await load() }
        }
        .interactiveDismissDisabled(busy)
    }

    private func included(_ id: UUID) -> Binding<Bool> {
        Binding(get: { channels.contains(id) }, set: { selected in
            if selected { channels.insert(id) }
            else { channels.remove(id) }
        })
    }

    private func load() async {
        error = nil
        do {
            let data = try await api.memberRead(Page.self, path: path)
            guard !Task.isCancelled else { return }
            page = data
            accept = data.preferences?.rulesAcceptedAt != nil
            channels = Set(data.preferences?.onboardingCompletedAt == nil ? data.channels.map(\.id) : data.selected)
            flair = data.preferences?.flair ?? ""
            alerts = Alerts(rawValue: data.preferences?.notificationLevel ?? "") ?? .highlights
        } catch { if !Task.isCancelled { self.error = error } }
    }

    private func save() async {
        guard !busy, accept, flair.count <= 32 else { return }
        struct Draft: Encodable { let accept: Bool; let notification: Alerts; let flair: String; let channels: [String] }
        struct Result: Decodable { let ok: Bool }
        busy = true
        defer { busy = false }
        do {
            let result = try await api.write(Result.self, path: path, body: Draft(accept: accept, notification: alerts,
                flair: flair, channels: channels.map { $0.uuidString.lowercased() }.sorted()))
            guard result.ok else { throw URLError(.cannotParseResponse) }
            saved()
            dismiss()
        } catch { message = "Preferences couldn’t be saved. Please try again." }
    }
}
