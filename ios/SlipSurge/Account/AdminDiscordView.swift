import SwiftUI

struct AdminDiscordView: View {
    private enum Page: String, CaseIterable {
        case server = "Server", membership = "Membership", alerts = "Alert Delivery", commands = "Commands"
        var icon: String {
            switch self {
            case .server: "server.rack"
            case .membership: "person.2.badge.key"
            case .alerts: "bell.badge"
            case .commands: "terminal"
            }
        }
    }

    private enum Action: String {
        case save = "Save Discord settings"
        case register = "Register commands"
        case sync = "Sync all member roles"
        case retire = "Remove legacy /slate command"
        case hr = "Send home run delivery test"
        case nearHR = "Send near-home-run delivery test"

        var message: String {
            switch self {
            case .save: "Save the SlipSurge server, channel and tier-role mappings."
            case .register: "Register the current creator commands on the connected Discord application."
            case .sync: "Apply each linked member’s current tier role on the configured server."
            case .retire: "Remove the inspected /slate command and verify the remaining command list."
            case .hr, .nearHR: "The bot will post a labeled test in the configured alert channel."
            }
        }
    }

    let api: AdminDiscordAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var page = Page.server
    @State private var config: AdminDiscordAPI.Configuration?
    @State private var channels: [AdminDiscordAPI.Channel] = []
    @State private var environment: AdminDiscordAPI.Environment?
    @State private var health: AdminDiscordAPI.CreatorStatus?
    @State private var delivery: AdminDiscordAPI.AlertHealth?
    @State private var slate: AdminDiscordAPI.Slate?
    @State private var guild = ""
    @State private var enabled = false
    @State private var alerts: [String: String] = [:]
    @State private var roles: [String: String] = [:]
    @State private var problem: (any Error)?
    @State private var secondaryProblem = false
    @State private var pending: Action?
    @State private var running: Action?
    @State private var feedback: String?
    @State private var revision = 0
    @State private var missingDelivery = false
    @State private var missingCommands = false

    private let alertTypes = [("lineup_confirmed", "Lineup confirmed"), ("hr", "Home runs"), ("near_hr", "Near home runs"),
                              ("slate", "Daily slate"), ("pipeline_health", "Pipeline health")]
    private let tiers = [("free", "Free"), ("basic", "Basic"), ("advanced", "Advanced"), ("ultimate", "Ultimate")]

    private var changed: Bool {
        guard let config else { return false }
        return guild.trimmingCharacters(in: .whitespaces) != (config.guildId ?? "") ||
            enabled != config.enabled || compact(alerts) != (config.alertChannels ?? [:]) || compact(roles) != (config.tierRoles ?? [:])
    }
    private var valid: Bool {
        let id = guild.trimmingCharacters(in: .whitespaces)
        return (id.isEmpty || isSnowflake(id)) && compact(alerts).values.allSatisfy(isSnowflake) &&
            compact(roles).values.allSatisfy(isSnowflake)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ResearchToolRail(title: "Discord administration", choices: Page.allCases, selection: $page, label: \.rawValue, glyph: \.icon)
                if let feedback { Label(feedback, systemImage: "info.circle").font(.caption).foregroundStyle(.secondary) }
                if let running { ProgressView(running.rawValue).font(.caption) }
                if config != nil {
                    switch page {
                    case .server: server
                    case .membership: membership
                    case .alerts: alertDelivery
                    case .commands: commands
                    }
                } else {
                    ResearchToolMessage(title: "Discord setup couldn’t load", error: problem) { revision += 1 }
                }
            }
            .padding(16)
            .disabled(running != nil)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .navigationTitle("Discord Bot")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { AdminDiscordComposer(api: api) } label: {
                    Label("Post to Discord", systemImage: "square.and.pencil").labelStyle(.iconOnly)
                }.disabled(config == nil || running != nil)
            }
        }
        .task(id: revision) { await load() }
        .refreshable { if !changed { revision += 1 } }
        .confirmationDialog(pending?.rawValue ?? "Confirm Discord action",
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible, presenting: pending) { action in
                Button(action.rawValue, role: action == .retire ? .destructive : nil) { Task { await perform(action) } }
            } message: { action in Text(action.message) }
    }

    private var server: some View {
        VStack(alignment: .leading, spacing: 11) {
            ResearchToolCard(color: discord) {
                HStack(spacing: 7) {
                    Image("sign-in-discord").resizable().scaledToFit().frame(width: 22, height: 22).accessibilityHidden(true)
                    Text("SlipSurge server").font(.headline)
                }
            } content: {
                Toggle("Enable bot", isOn: $enabled)
                TextField("Discord server ID", text: $guild).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                if let environment {
                    LabeledContent("Bot token", value: environment.hasBotToken ? "Configured" : "Missing")
                    LabeledContent("Application ID", value: environment.hasApplicationId ? "Configured" : "Missing")
                    LabeledContent("Public key", value: environment.hasPublicKey ? "Configured" : "Missing")
                }
                if secondaryProblem {
                    Button("Retry Discord status", systemImage: "arrow.clockwise") { Task { await loadProviderStatus() } }
                        .buttonStyle(.bordered)
                }
                saveButton
            }
        }
    }

    private var membership: some View {
        VStack(alignment: .leading, spacing: 11) {
            ResearchToolCard(color: discord) {
                ResearchSectionTitle(title: "Tier roles")
            } content: {
                ForEach(tiers, id: \.0) { key, title in
                    TextField(title + " role ID", text: Binding(get: { roles[key] ?? "" }, set: { roles[key] = $0 }))
                        .keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                }
                saveButton
                Button(Action.sync.rawValue, systemImage: "person.badge.key") { pending = .sync }
                    .buttonStyle(.bordered).disabled(config?.enabled != true)
            }
            if let health {
                ResearchToolCard(color: discord) {
                    ResearchSectionTitle(title: health.name ?? "Creator delivery")
                } content: {
                    LabeledContent("Connection", value: health.connected ? "Connected" : health.configured ? "Unavailable" : "Setup needed")
                    LabeledContent("Installed servers", value: health.guildCount.map(String.init) ?? "—")
                    LabeledContent("Active role mappings", value: health.activeRoleMappings.map(String.init) ?? "—")
                    LabeledContent("Pending deliveries", value: health.pendingDeliveries.map(String.init) ?? "—")
                    if let publicBot = health.publicBot { LabeledContent("Public installation", value: publicBot ? "Enabled" : "Restricted") }
                    if let codeGrant = health.requiresCodeGrant { LabeledContent("OAuth code grant", value: codeGrant ? "Required" : "Optional") }
                }
            }
        }
    }

    private var alertDelivery: some View {
        VStack(alignment: .leading, spacing: 11) {
            ResearchToolCard(color: discord) {
                ResearchSectionTitle(title: "Alert channels")
            } content: {
                ForEach(alertTypes, id: \.0) { key, title in
                    let selected = alerts[key] ?? ""
                    Picker(title, selection: Binding(get: { selected }, set: { alerts[key] = $0 })) {
                        Text("Disabled").tag("")
                        ForEach(channels) { Text("#" + $0.name).tag($0.id) }
                        if !selected.isEmpty, !channels.contains(where: { $0.id == selected }) {
                            Text("Saved channel").tag(selected)
                        }
                    }
                }
                saveButton
            }
            if let delivery {
                ResearchToolCard(color: discord) {
                    ResearchSectionTitle(title: "Delivery history")
                } content: {
                    ResearchToolValues(items: [
                        .init(label: "Pending", text: String(delivery.queue.pending)),
                        .init(label: "Processing", text: String(delivery.queue.processing)),
                        .init(label: "Failed", text: String(delivery.queue.failed)),
                        .init(label: "Delivered", text: String(delivery.queue.succeeded)),
                    ])
                    if let latest = delivery.latestSuccessAt { LabeledContent("Last delivery", value: dateLabel(latest)) }
                    if let failed = delivery.latestFailureAt { LabeledContent("Last failure", value: dateLabel(failed)) }
                    ForEach(delivery.recent) { event in
                        DisclosureGroup(event.batterName ?? "Contact alert") {
                            LabeledContent("Status", value: event.status.capitalized)
                            LabeledContent("Attempts", value: "\(event.attempts)/\(event.maxAttempts)")
                            if let created = event.createdAt { LabeledContent("Created", value: dateLabel(created)) }
                            if let result = event.responseStatus { LabeledContent("Response", value: String(result)) }
                        }
                    }
                    Button(Action.hr.rawValue, systemImage: "bell.badge") { pending = .hr }
                        .disabled(!delivery.ready)
                    Button(Action.nearHR.rawValue, systemImage: "bell.badge") { pending = .nearHR }
                        .disabled(!delivery.ready)
                }
            } else if missingDelivery {
                Button("Retry delivery status", systemImage: "arrow.clockwise") { Task { await loadProviderStatus() } }
                    .buttonStyle(.bordered)
            }
        }
    }

    private var commands: some View {
        VStack(alignment: .leading, spacing: 11) {
            ResearchToolCard(color: discord) {
                ResearchSectionTitle(title: "Creator commands")
            } content: {
                if let health {
                    LabeledContent("Interactions endpoint", value: health.interactionsReady == true ? "Ready" : "Unverified")
                    ForEach(health.commands ?? [], id: \.self) { Label("/" + $0, systemImage: "checkmark.circle") }
                    ForEach(health.missingCommands ?? [], id: \.self) { Label("/" + $0, systemImage: "exclamationmark.circle") }
                }
                Button(Action.register.rawValue, systemImage: "terminal") { pending = .register }
                    .buttonStyle(.bordered).disabled(health?.configured != true)
            }
            ResearchToolCard(color: discord) {
                ResearchSectionTitle(title: "Legacy /slate")
            } content: {
                if let slate {
                    LabeledContent("Legacy command", value: slate.slateId == nil ? "Absent" : "Installed")
                    LabeledContent("Other commands", value: String(slate.otherCount))
                    if slate.slateId != nil {
                        Button(Action.retire.rawValue, systemImage: "trash", role: .destructive) { pending = .retire }
                    }
                } else if missingCommands {
                    Text("Command status couldn’t be verified.").foregroundStyle(.secondary)
                }
                Button("Inspect commands", systemImage: "arrow.clockwise") { Task { await inspect() } }.buttonStyle(.bordered)
            }
        }
    }

    private var discord: Color { Color(rgb: 0x5865F2) }

    private var saveButton: some View {
        Button("Save settings", systemImage: "checkmark") { pending = .save }
            .buttonStyle(.borderedProminent).disabled(!changed || !valid)
    }

    private func compact(_ values: [String: String]) -> [String: String] {
        values.mapValues { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.value.isEmpty }
    }

    private func isSnowflake(_ value: String) -> Bool {
        value.range(of: #"^[0-9]{17,20}$"#, options: .regularExpression) != nil
    }

    private func dateLabel(_ value: String) -> String {
        SidelineBoard.timestamp(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
    }

    private func apply(_ config: AdminDiscordAPI.Configuration) {
        self.config = config
        guild = config.guildId ?? ""
        enabled = config.enabled
        alerts = config.alertChannels ?? [:]
        roles = config.tierRoles ?? [:]
    }

    private func load() async {
        problem = nil
        do {
            let current = try await api.configuration()
            try Task.checkCancellation()
            apply(current)
            await loadProviderStatus()
        } catch { if !Task.isCancelled { problem = error } }
    }

    private func loadProviderStatus() async {
        async let routes = try? api.channels()
        async let keys = try? api.environment()
        async let creator = try? api.creatorStatus()
        async let alertHealth = try? api.alerts()
        let (currentRoutes, currentKeys, currentCreator, currentAlerts) = await (routes, keys, creator, alertHealth)
        guard !Task.isCancelled else { return }
        if let currentRoutes { channels = currentRoutes }
        environment = currentKeys
        health = currentCreator
        delivery = currentAlerts
        secondaryProblem = currentRoutes == nil || currentKeys == nil || currentCreator == nil
        missingDelivery = currentAlerts == nil
    }

    private func inspect() async {
        slate = try? await api.slate()
        missingCommands = slate == nil
    }

    private func perform(_ action: Action) async {
        guard running == nil else { return }
        running = action
        feedback = nil
        defer { running = nil }
        do {
            switch action {
            case .save:
                guard let config, changed, valid else { return }
                let updated = try await api.save(guild: guild, enabled: enabled, channels: compact(alerts), roles: compact(roles),
                    expected: config.updatedAt)
                apply(updated)
                await loadProviderStatus()
                feedback = "Discord settings saved."
            case .sync:
                let result = try await api.syncRoles()
                feedback = "\(result.synced) of \(result.total) members synced. \(result.failed) failed."
            case .register:
                let count = try await api.register()
                await loadProviderStatus()
                feedback = "\(count) commands registered."
            case .retire:
                guard let id = slate?.slateId else { return }
                let count = try await api.retireSlate(id)
                await inspect()
                feedback = "Legacy command removed. \(count) other commands verified."
            case .hr, .nearHR:
                try await api.sendCanary(kind: action == .hr ? "hr" : "near_hr")
                await loadProviderStatus()
                feedback = "Discord confirmed the delivery test."
            }
        } catch let error as SlipSurgeHTTP.Status {
            struct Detail: Decodable { let error: String }
            feedback = (try? JSONDecoder().decode(Detail.self, from: error.data))?.error ?? "The action couldn’t be confirmed."
        } catch {
            feedback = "The action couldn’t be confirmed. Refresh Discord status before retrying."
        }
    }
}
