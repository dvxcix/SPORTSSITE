import SwiftUI

struct CommunitySettingsView: View {
    let api: CommunitySettingsAPI

    @Environment(\.colorScheme) private var scheme
    @State private var settings: CommunitySettingsState?
    @State private var problem: (any Error)?
    @State private var revision = 0

    var body: some View {
        List {
            if let settings {
                if settings.owner {
                    NavigationLink {
                        CommunityOverviewEditor(api: api, initial: settings) { await load() }
                    } label: { Label("Overview and rules", systemImage: "square.and.pencil") }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                if settings.channelManagement {
                    NavigationLink {
                        CommunityChannelManager(api: api, initial: settings)
                    } label: { Label("Manage channels", systemImage: "number") }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                if settings.roleManagement {
                    NavigationLink {
                        CommunityRoleList(api: api, initial: settings)
                    } label: { Label("Roles and permissions", systemImage: "checkmark.shield") }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                if settings.memberManagement || settings.invite {
                    NavigationLink {
                        CommunityMembersManager(api: api, initial: settings)
                    } label: { Label("Members and invitations", systemImage: "person.2") }
                    .listRowBackground(Brand.surface(for: scheme))
                }
            } else {
                ResearchToolMessage(title: "Community settings couldn’t load", error: problem) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Community settings")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            settings = try await api.load()
            problem = nil
        } catch { if !Task.isCancelled { settings = nil; problem = error } }
    }
}

private struct CommunityOverviewEditor: View {
    let api: CommunitySettingsAPI
    let initial: CommunitySettingsState
    let didSave: () async -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var name = ""
    @State private var description = ""
    @State private var rules = ""
    @State private var sport = ""
    @State private var shared = true
    @State private var avatar: URL?
    @State private var banner: URL?
    @State private var saving = false
    @State private var avatarBusy = false
    @State private var bannerBusy = false
    @State private var feedback: String?
    @State private var failure = false
    @State private var configured = false

    private var paid: Bool { initial.group.accessType == "paid" }
    private var busy: Bool { saving || avatarBusy || bannerBusy }

    var body: some View {
        Form {
            Section {
                HStack {
                    ResearchArtwork(urls: avatar.map { [$0] } ?? [], fallback: "person.2.fill").frame(width: 38, height: 38)
                    NativePhotoPicker(title: "Community photo", upload: { try await upload($0, kind: .avatars) }, url: $avatar, uploading: $avatarBusy)
                }.disabled(bannerBusy)
                HStack {
                    ResearchArtwork(urls: banner.map { [$0] } ?? [], fallback: "photo").frame(width: 38, height: 27)
                    NativePhotoPicker(title: "Cover photo", upload: { try await upload($0, kind: .banners) }, url: $banner, uploading: $bannerBusy)
                }.disabled(avatarBusy)
                TextField("Community name", text: $name)
                TextField("Description", text: $description, axis: .vertical).lineLimit(2...4)
                ResearchArtworkPicker(title: "Sport", options: sportChoices, selection: $sport)
                Toggle("Public community", isOn: $shared).disabled(paid)
                Button("Save overview") {
                    Task { await save(.init(action: "overview", name: name, description: description, sport: sport,
                        avatar: avatar, banner: banner, public: shared)) }
                }.disabled(busy || !(2...60).contains(name.utf16.count) || description.utf16.count > 280)
            }.listRowBackground(Brand.surface(for: scheme))
            Section("Community rules") {
                TextField("Rules for members", text: $rules, axis: .vertical).lineLimit(5...12)
                Button("Save rules") { Task { await save(.init(action: "rules", rules: rules)) } }
                    .disabled(busy || rules.utf16.count > 4000)
            }.listRowBackground(Brand.surface(for: scheme))
            if let feedback { Text(feedback).foregroundStyle(failure ? .red : Brand.accent(for: scheme)) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Overview and rules")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !configured else { return }
            configured = true
            name = initial.group.name
            description = initial.group.description ?? ""
            rules = initial.group.rules ?? ""
            sport = initial.group.sport ?? ""
            shared = initial.group.isPublic ?? true
            avatar = initial.group.avatarUrl
            banner = initial.group.bannerUrl
        }
    }

    private var sportChoices: [ResearchArtworkPicker.Option] {
        let sports = ["NBA", "NFL", "NHL", "Soccer"] + (initial.allowMlb ? ["MLB"] : [])
        return [.init(id: "", title: "Any sport", icon: "sportscourt")] + sports.map {
            .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: "sportscourt")
        }
    }

    private func upload(_ photo: NativeMediaUpload.Photo, kind: NativeMediaUpload.Kind) async throws -> URL {
        try await NativeMediaUpload.upload(photo, kind: kind, account: api.account, userID: api.userID)
    }

    private func save(_ change: CommunitySettingsAPI.Change) async {
        guard !busy else { return }
        saving = true
        defer { saving = false }
        do {
            try await api.save(change)
            await didSave()
            failure = false
            feedback = "Saved"
        } catch {
            failure = true
            feedback = "Changes couldn’t be confirmed. Your edits are still here."
        }
    }
}
