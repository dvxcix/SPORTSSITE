import SwiftUI

struct CreatorScheduledPost: Decodable, Identifiable {
    let id: UUID
    let groupId: UUID?
    let content: String?
    let postType: String?
    let visibility: String?
    let scheduledFor: String?
    let status: String
    let sport: String?
    let updatedAt: String?
}

struct CreatorScheduleAPI {
    struct Change: Encodable {
        let id: UUID
        let action: String?
        let expectedUpdatedAt: String?
        var content: String? = nil
        var postType: String? = nil
        var sport: String? = nil
        var visibility: String? = nil
        var groupId: UUID? = nil
        var draft: Bool? = nil
        var scheduledFor: String? = nil
    }

    private static let path = "/api/creator/scheduled-posts"
    let account: AccountStore
    let userID: UUID

    @MainActor
    func save(_ change: Change) async throws {
        let method = change.action == nil ? "POST" : "PATCH"
        _ = try await AccountPrivacyRequest.send(Self.path, method: method, account: account, userID: userID,
            body: JSONEncoder().encode(change))
    }

    @MainActor
    func delete(_ post: CreatorScheduledPost) async throws {
        guard let updated = post.updatedAt else { throw URLError(.cannotParseResponse) }
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path, query: [
            .init(name: "id", value: post.id.uuidString.lowercased()), .init(name: "expectedUpdatedAt", value: updated),
        ])
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        _ = try await SlipSurgeHTTP.send(request)
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
    }
}

struct CreatorScheduleEditor: View {
    struct Target: Identifiable {
        let id: UUID
        let name: String
        let avatar: URL?
    }

    let api: CreatorScheduleAPI
    let existing: CreatorScheduledPost?
    let targets: [Target]
    let allowMLB: Bool
    let didSave: () async -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var identifier = UUID()
    @State private var content = ""
    @State private var kind = "text"
    @State private var league = ""
    @State private var audience = "public"
    @State private var target = ""
    @State private var isDraft = true
    @State private var schedule = Date.now.addingTimeInterval(3600)
    @State private var busy = false
    @State private var problem: String?

    private static let limit = 500
    private var ready: Bool {
        !busy && !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content.utf16.count <= Self.limit &&
            (isDraft || schedule >= .now.addingTimeInterval(65))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Write your post", text: $content, axis: .vertical).lineLimit(5...14)
                    Text("\(content.utf16.count) / \(Self.limit)").font(.caption.monospacedDigit())
                        .foregroundStyle(content.utf16.count > Self.limit ? .red : .secondary)
                }.listRowBackground(Brand.surface(for: scheme))
                Section("Publishing") {
                    Picker("Post type", selection: $kind) { Text("Post").tag("text"); Text("Analysis").tag("analysis") }
                    ResearchArtworkPicker(title: "Sport", options: leagueOptions, selection: $league)
                    ResearchArtworkPicker(title: "Destination", options: targetOptions, selection: $target)
                    if target.isEmpty {
                        Picker("Audience", selection: $audience) { Text("Public").tag("public"); Text("Followers").tag("followers") }
                    }
                    Toggle("Save as draft", isOn: $isDraft)
                    if !isDraft {
                        DatePicker("Publish at", selection: $schedule, in: Date.now...Date.now.addingTimeInterval(365 * 86_400))
                            .datePickerStyle(.compact)
                    }
                }.listRowBackground(Brand.surface(for: scheme))
                if let problem { Label(problem, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .navigationTitle(existing == nil ? "New scheduled post" : "Edit scheduled post")
            .navigationBarTitleDisplayMode(.inline)
            .disabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isDraft ? "Save draft" : "Schedule") { Task { await save() } }.disabled(!ready)
                }
            }
        }
        .onAppear { restore() }
        .interactiveDismissDisabled(busy)
    }

    private var leagueOptions: [ResearchArtworkPicker.Option] {
        let sports = ["NFL", "NBA", "NHL", "NCAAF", "NCAAB"] + (allowMLB ? ["MLB"] : [])
        return [.init(id: "", title: "Any sport", icon: "sportscourt")] + sports.map {
            .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt")
        }
    }

    private var targetOptions: [ResearchArtworkPicker.Option] {
        [.init(id: "", title: "Feed", icon: "bubble.left.and.bubble.right")] + targets.map {
            .init(id: $0.id.uuidString, title: $0.name, url: $0.avatar, icon: "person.2")
        }
    }

    private func restore() {
        guard let existing else { return }
        content = existing.content ?? ""
        kind = existing.postType ?? "text"
        league = existing.sport ?? ""
        target = existing.groupId?.uuidString ?? ""
        audience = existing.visibility ?? "public"
        isDraft = existing.status == "draft"
        if !isDraft, let time = existing.scheduledFor.flatMap(SidelineBoard.timestamp), time >= .now.addingTimeInterval(65) {
            schedule = time
        }
    }

    private func save() async {
        guard ready else { return }
        busy = true
        problem = nil
        defer { busy = false }
        let payload = CreatorScheduleAPI.Change(id: existing?.id ?? identifier, action: existing == nil ? nil : "edit",
            expectedUpdatedAt: existing?.updatedAt, content: content, postType: kind, sport: league, visibility: audience,
            groupId: UUID(uuidString: target), draft: isDraft, scheduledFor: isDraft ? nil : schedule.ISO8601Format())
        do {
            try await api.save(payload)
            await didSave()
            dismiss()
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            problem = "This post changed. Close the editor and refresh before editing again."
        } catch { problem = "The post couldn’t be saved. Your text is still here." }
    }
}
