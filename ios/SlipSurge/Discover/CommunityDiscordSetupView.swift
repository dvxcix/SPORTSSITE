import AuthenticationServices
import SwiftUI

struct CommunityDiscordSetupView: View {
    private enum Confirmation: String, Identifiable {
        case disconnect, publish
        var id: Self { self }
    }

    let api: CommunityDiscordAPI
    private var browser = CommunityDiscordBrowser()
    @Environment(\.openURL) private var openURL
    @Environment(\.slipPalette) private var slipPalette
    @State private var setup: CommunityDiscordAPI.Setup?
    @State private var servers: [CommunityDiscordAPI.Server] = []
    @State private var guildID = ""
    @State private var inspection: CommunityDiscordAPI.Inspection?
    @State private var selectedRoles: Set<String> = []
    @State private var invite = ""
    @State private var roleName = ""
    @State private var channels: [CommunityDiscordAPI.Channel] = []
    @State private var channelID = ""
    @State private var receipt: URL?
    @State private var busy = false
    @State private var notice: String?
    @State private var failed = false
    @State private var confirmation: Confirmation?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let setup {
                    connectionCard(setup)
                    if setup.configured {
                        if let inspection { roleCard(inspection) }
                        if let integration = setup.integrations.first { panelCard(integration) }
                    }
                } else if !failed {
                    ProgressView("Loading Discord setup").frame(maxWidth: .infinity).padding(24)
                } else {
                    Button("Retry", systemImage: "arrow.clockwise") { run { try await load() } }.buttonStyle(.bordered)
                }
                if let notice {
                    Label(notice, systemImage: failed ? "exclamationmark.circle" : "checkmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(failed ? .secondary : slipPalette.accent)
                }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Discord setup")
        .navigationBarTitleDisplayMode(.inline)
        .task { await perform { try await load() } }
        .refreshable { await perform { try await load() } }
        .confirmationDialog(confirmation == .disconnect ? "Disconnect Discord roles?" : "Publish the access panel?",
            isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }),
            titleVisibility: .visible, presenting: confirmation) { action in
                switch action {
                case .disconnect:
                    Button("Disconnect roles", role: .destructive) {
                        run {
                            try await api.disconnect()
                            selectedRoles = []
                            channels = []
                            channelID = ""
                            receipt = nil
                            try await load()
                            notice = "Discord roles disconnected."
                        }
                    }
                case .publish:
                    Button("Publish to Discord") {
                        guard let guild = setup?.integrations.first?.guildId else { return }
                        run {
                            receipt = try await api.publish(guildID: guild, channelID: channelID)
                            notice = "Access panel published."
                        }
                    }
                }
            }
    }

    private func connectionCard(_ setup: CommunityDiscordAPI.Setup) -> some View {
        ResearchToolCard(color: discordColor) {
            CommunityDiscordIdentity(title: "Discord", detail: setup.accountHandle ?? (setup.connected ? "Connected" : nil))
        } content: {
            if setup.configured {
                if let integration = setup.integrations.first {
                    Label(integration.guildName, systemImage: "checkmark.seal.fill").font(.subheadline.weight(.medium))
                    Text(setup.integrations.map(\.roleName).joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                }
                Button(setup.connected ? "Choose your servers" : "Connect Discord", systemImage: "server.rack") {
                    run {
                        let proof = try await api.authorize(.setup, authenticate: browser.authenticate)
                        servers = try await api.servers(providerToken: proof)
                        try await load()
                        if servers.isEmpty { notice = "Discord returned no servers you can manage." }
                    }
                }
                .buttonStyle(DiscordCommunityButtonStyle())
                .disabled(busy)
                if !servers.isEmpty {
                    ScrollView(.horizontal) {
                        ResearchArtworkPicker(title: "Discord server", options: servers.map {
                            .init(id: $0.id, title: $0.name, url: $0.icon, icon: "server.rack")
                        }, selection: $guildID)
                    }.scrollIndicators(.hidden)
                }
                if !guildID.isEmpty {
                    Button("Check server permissions", systemImage: "lock.shield") {
                        run { try await inspect(guildID) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                }
                if let url = setup.installUrl, CommunityDiscordAPI.trusted(url, pathPrefix: "/oauth2/authorize") {
                    Button("Add SlipSurge to Discord", systemImage: "arrow.up.right") { openURL(url) }
                        .buttonStyle(.bordered)
                }
            } else {
                Text("Discord setup is currently unavailable.").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .onChange(of: guildID) {
            if inspection?.guildId != guildID { inspection = nil }
        }
    }

    private func roleCard(_ inspection: CommunityDiscordAPI.Inspection) -> some View {
        ResearchToolCard(color: discordColor) {
            ResearchSectionTitle(title: "Member roles")
        } content: {
            Text(inspection.guildName).font(.subheadline).foregroundStyle(.secondary)
            ForEach(inspection.roles) { role in
                let selected = selectedRoles.contains(role.id)
                Button {
                    if selected { selectedRoles.remove(role.id) } else { selectedRoles.insert(role.id) }
                } label: {
                    HStack {
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(selected ? slipPalette.accent : .secondary)
                        Text(role.name)
                        Spacer()
                    }
                    .frame(minHeight: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityAddTraits(selected ? .isSelected : [])
                .disabled(busy || !selected && selectedRoles.count >= 5)
            }
            if inspection.canCreateRoles {
                TextField("New Discord role", text: $roleName).textFieldStyle(.roundedBorder)
                Button("Create role", systemImage: "plus") {
                    let name = roleName.trimmingCharacters(in: .whitespacesAndNewlines)
                    run {
                        let role = try await api.newRole(guildID: inspection.guildId, name: name)
                        let previous = selectedRoles
                        try await inspect(inspection.guildId)
                        selectedRoles = previous.intersection(Set(self.inspection?.roles.map(\.id) ?? []))
                        if selectedRoles.count < 5, self.inspection?.roles.contains(where: { $0.id == role.id }) == true {
                            selectedRoles.insert(role.id)
                        }
                        roleName = ""
                    }
                }
                .buttonStyle(.bordered)
                .disabled(busy || roleName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || roleName.utf16.count > 100)
            }
            TextField("Discord invite link (optional)", text: $invite)
                .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never)
                .autocorrectionDisabled().textFieldStyle(.roundedBorder)
            Button("Save member roles", systemImage: "checkmark") {
                run {
                    try await api.save(guildID: inspection.guildId, roles: selectedRoles, invite: invite.trimmingCharacters(in: .whitespacesAndNewlines))
                    channels = []
                    channelID = ""
                    receipt = nil
                    try await load()
                    notice = "Member roles saved."
                }
            }
            .buttonStyle(DiscordCommunityButtonStyle())
            .disabled(busy || selectedRoles.isEmpty)
        }
    }

    private func panelCard(_ integration: CommunityDiscordAPI.Setup.Integration) -> some View {
        ResearchToolCard(color: discordColor) {
            ResearchSectionTitle(title: "Discord access panel")
        } content: {
            Button("Load text channels", systemImage: "number") {
                run {
                    channels = try await api.channels(guildID: integration.guildId)
                    if !channels.contains(where: { $0.id == channelID }) { channelID = channels.first?.id ?? "" }
                    if channels.isEmpty { notice = "No text channels are available." }
                }
            }
            .buttonStyle(.bordered)
            .disabled(busy)
            if !channels.isEmpty {
                ResearchArtworkPicker(title: "Text channel", options: channels.map {
                    .init(id: $0.id, title: $0.name, icon: "number")
                }, selection: $channelID)
                Button("Publish access panel", systemImage: "paperplane") { confirmation = .publish }
                    .buttonStyle(DiscordCommunityButtonStyle())
                    .disabled(busy || channelID.isEmpty)
            }
            if let receipt { Link("Open published panel", destination: receipt).font(.subheadline) }
            Button("Disconnect member roles", systemImage: "link.badge.minus", role: .destructive) { confirmation = .disconnect }
                .buttonStyle(.bordered)
                .disabled(busy)
        }
    }

    private func inspect(_ id: String) async throws {
        let value = try await api.inspect(guildID: id)
        guard value.guildId == id, id == guildID else { throw URLError(.cannotParseResponse) }
        inspection = value
        let existing = setup?.integrations.filter { $0.guildId == id } ?? []
        selectedRoles = Set(existing.map(\.roleId)).intersection(Set(value.roles.map(\.id)))
        invite = existing.first?.inviteUrl?.absoluteString ?? ""
    }

    private func load() async throws {
        let value = try await api.setup()
        setup = value
        if guildID.isEmpty, let first = value.integrations.first {
            guildID = first.guildId
            if !servers.contains(where: { $0.id == first.guildId }) {
                servers.append(.init(id: first.guildId, name: first.guildName, icon: nil))
            }
        }
    }

    private func run(_ operation: @escaping () async throws -> Void) {
        Task { await perform(operation) }
    }

    private func perform(_ operation: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        notice = nil
        failed = false
        defer { busy = false }
        do { try await operation() }
        catch let cause as ASWebAuthenticationSessionError where cause.code == .canceledLogin { return }
        catch {
            guard !Task.isCancelled else { return }
            failed = true
            notice = (error as? CommunityDiscordAPI.Problem)?.error ?? "Discord couldn’t complete that request."
        }
    }
}
