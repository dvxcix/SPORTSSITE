import SwiftUI

private struct SettingsPayload: Decodable {
    struct Profile: Decodable {
        let username: String
        let displayName: String?
        let bio: String?
        let location: String?
        let website: String?
        let avatarUrl: URL?
        let bannerUrl: URL?
    }

    struct Privacy: Decodable {
        let isPrivate: Bool?
        let allowMessages: Bool?
        let hideWinRate: Bool?
    }

    struct Delivery: Codable {
        var quiet_hours_enabled: Bool?
        var quiet_start: String?
        var quiet_end: String?
        var timezone: String?
        var live_game_priority: Bool?

        var defaults: Self {
            .init(quiet_hours_enabled: quiet_hours_enabled ?? false, quiet_start: quiet_start ?? "22:00",
                quiet_end: quiet_end ?? "07:00", timezone: timezone ?? "America/New_York",
                live_game_priority: live_game_priority ?? true)
        }
    }

    struct Notifications: Codable {
        var settings: [String: Bool]
        var delivery: Delivery
    }

    let profile: Profile
    let privacy: Privacy
    let notifications: Notifications
}

struct NativeSettings: View {
    enum Section: String {
        case profile = "Edit profile", privacy = "Privacy", alerts = "Alert preferences"
    }

    private struct ProfileEdit: Encodable {
        let kind = "profile"
        var displayName = ""
        var bio = ""
        var location = ""
        var website = ""
    }

    private struct PrivacyEdit: Encodable {
        let kind = "privacy"
        var isPrivate = false
        var allowMessages = true
        var hideWinRate = false
    }

    private struct NotificationsEdit: Encodable {
        struct Baseline: Encodable {
            let notification_settings: [String: Bool]
            let notification_delivery_settings: SettingsPayload.Delivery
        }

        let kind = "notifications"
        let value: SettingsPayload.Notifications
        let expected: Baseline
    }

    private static let notificationKeys = [
        ("new_follower", "New followers"), ("post_reaction", "Reactions"), ("post_comment", "Comments"),
        ("repost", "Reposts"), ("mention", "Mentions"), ("new_pick", "New picks"),
        ("pick_result", "Pick results"), ("group_invite", "Community invites"), ("dm", "Messages"),
        ("subscription", "Subscriptions"), ("lineup_confirmed", "Lineup confirmations")
    ]

    let account: AccountStore
    let userID: UUID
    let section: Section
    @Environment(\.colorScheme) private var scheme
    @State private var source: SettingsPayload?
    @State private var profile = ProfileEdit()
    @State private var privacy = PrivacyEdit()
    @State private var delivery = SettingsPayload.Delivery()
    @State private var notifications: [String: Bool] = [:]
    @State private var baseline: NotificationsEdit.Baseline?
    @State private var error: (any Error)?
    @State private var feedback: String?
    @State private var retry = 0
    @State private var saving = false

    private static let path = "/api/mobile/account/settings"

    var body: some View {
        Form {
            if let source {
                switch section {
                case .profile:
                    profileFields(source.profile)
                case .privacy:
                    privacyFields
                case .alerts:
                    alertFields
                }
                if let feedback { Text(feedback).font(.subheadline) }
            } else {
                ResearchToolMessage(title: "Settings couldn’t load", error: error) { retry += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(section.rawValue)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if source != nil {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(saving)
                }
            }
        }
        .task(id: retry) { await load() }
        .refreshable { await load() }
    }

    private func profileFields(_ identity: SettingsPayload.Profile) -> some View {
        SwiftUI.Section {
            ResearchArtwork(urls: identity.avatarUrl.map { [$0] } ?? [], fallback: "person.crop.circle.fill")
                .frame(width: 58, height: 58).clipShape(.circle)
            LabeledContent("Username", value: "@\(identity.username)")
            TextField("Display name", text: $profile.displayName).textContentType(.name)
            TextField("Bio", text: $profile.bio, axis: .vertical).lineLimit(3...6)
            TextField("Location", text: $profile.location)
            TextField("Website", text: $profile.website).keyboardType(.URL).textContentType(.URL)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
        }.listRowBackground(Brand.surface(for: scheme))
    }

    private var privacyFields: some View {
        SwiftUI.Section {
            Toggle("Private account", isOn: $privacy.isPrivate)
            Toggle("Hide win rate", isOn: $privacy.hideWinRate)
            Toggle("Allow direct messages", isOn: $privacy.allowMessages)
        } footer: {
            Text("Private accounts limit posts and records to followers. Your username and bio remain visible.")
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    @ViewBuilder
    private var alertFields: some View {
        SwiftUI.Section("Delivery timing") {
            Toggle("Quiet hours", isOn: Binding(get: { delivery.quiet_hours_enabled ?? false }, set: { delivery.quiet_hours_enabled = $0 }))
            if delivery.quiet_hours_enabled == true {
                DatePicker("Start", selection: clock(start: true), displayedComponents: .hourAndMinute)
                DatePicker("End", selection: clock(start: false), displayedComponents: .hourAndMinute)
                Picker("Time zone", selection: Binding(get: { delivery.timezone ?? "America/New_York" }, set: { delivery.timezone = $0 })) {
                    let zones = Set(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix",
                        "America/Anchorage", "Pacific/Honolulu", TimeZone.current.identifier, delivery.timezone ?? "America/New_York"])
                    ForEach(zones.sorted(), id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ")).tag($0) }
                }
            }
            Toggle("Keep game alerts live", isOn: Binding(get: { delivery.live_game_priority ?? true }, set: { delivery.live_game_priority = $0 }))
        }
        .listRowBackground(Brand.surface(for: scheme))
        ForEach(Self.notificationKeys, id: \.0) { key, label in
            SwiftUI.Section(label) {
                Toggle("Push", isOn: channel(key, defaultValue: true))
                Toggle("Email", isOn: channel(key + "_email", defaultValue: false))
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func channel(_ key: String, defaultValue: Bool) -> Binding<Bool> {
        .init(get: { notifications[key] ?? defaultValue }, set: { notifications[key] = $0 })
    }

    private func clock(start: Bool) -> Binding<Date> {
        let calendar = Calendar.current
        return Binding(get: {
            let value = start ? delivery.quiet_start ?? "22:00" : delivery.quiet_end ?? "07:00"
            let parts = value.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2 else { return .now }
            return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: .now) ?? .now
        }, set: { date in
            let time = calendar.dateComponents([.hour, .minute], from: date)
            let value = String(format: "%02d:%02d", time.hour ?? 0, time.minute ?? 0)
            if start { delivery.quiet_start = value } else { delivery.quiet_end = value }
        })
    }

    private func load() async {
        do {
            let data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
            let value = try JSONDecoder().decode(SettingsPayload.self, from: data)
            guard !Task.isCancelled else { return }
            source = value
            profile = .init(displayName: value.profile.displayName ?? "", bio: value.profile.bio ?? "",
                location: value.profile.location ?? "", website: value.profile.website ?? "")
            privacy = .init(isPrivate: value.privacy.isPrivate ?? false, allowMessages: value.privacy.allowMessages ?? true,
                hideWinRate: value.privacy.hideWinRate ?? false)
            delivery = value.notifications.delivery.defaults
            let known = Set(Self.notificationKeys.flatMap { [$0.0, $0.0 + "_email"] })
            notifications = value.notifications.settings.filter { known.contains($0.key) }
            baseline = .init(notification_settings: notifications, notification_delivery_settings: value.notifications.delivery)
        } catch {
            if !Task.isCancelled { source = nil; self.error = error }
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        feedback = nil
        defer { saving = false }
        do {
            switch section {
            case .profile: try await patch(Self.path, body: profile)
            case .privacy: try await patch(Self.path, body: privacy)
            case .alerts:
                guard let baseline else { return }
                try await patch("/api/account/preferences", body: NotificationsEdit(value: .init(settings: notifications, delivery: delivery), expected: baseline))
                self.baseline = .init(notification_settings: notifications, notification_delivery_settings: delivery)
            }
            feedback = "Saved"
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            feedback = "Preferences changed on another device. Refresh to load the saved values."
        } catch {
            feedback = "Changes couldn’t be confirmed. Your edits are still here."
        }
    }

    private func patch<Body: Encodable>(_ path: String, body: Body) async throws {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await SlipSurgeHTTP.send(request)
    }
}
