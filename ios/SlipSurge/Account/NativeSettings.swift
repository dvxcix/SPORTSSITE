import SwiftUI

private struct SettingsPayload: Decodable {
    struct Profile: Decodable {
        struct Platform: Decodable, Identifiable {
            let id: UUID
            let key: String
            let name: String
            let iconURL: URL?

            private enum CodingKeys: String, CodingKey { case id, key, name; case iconURL = "icon_url" }
        }

        let username: String
        let displayName: String?
        let bio: String?
        let location: String?
        let website: String?
        let avatarUrl: URL?
        let bannerUrl: URL?
        let avatarRingStyle: String?
        let avatarRingColor: String?
        let sportsbooks: [String]?
        let sportsbookChoices: [String]?
        let socialPlatforms: [Platform]?
        let socialLinks: [String: String]?
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
        struct LinkChange: Encodable { let before: String; let handle: String }
        struct Change<Value: Encodable>: Encodable { let before: Value; let value: Value }

        let kind = "profile"
        var username = ""
        var displayName = ""
        var bio = ""
        var location = ""
        var website = ""

        var avatarUrl: URL?
        var bannerUrl: URL?
        var changedAvatar = false
        var changedBanner = false
        var links: [String: String] = [:]
        var socialChanges: [String: LinkChange] = [:]
        var ringStyle = AvatarArtwork.Ring.surge.rawValue
        var ringColor = AvatarArtwork.defaultColor
        var books: [String] = []
        var styleChange: Change<String>?
        var colorChange: Change<String>?
        var bookChange: Change<[String]>?

        private enum CodingKeys: String, CodingKey {
            case kind, username, displayName, bio, location, website, avatarUrl, bannerUrl, socialLinks, avatarRingStyle, avatarRingColor, sportsbooks
        }

        func encode(to encoder: any Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(kind, forKey: .kind)
            try values.encodeIfPresent(username.isEmpty ? nil : username, forKey: .username)
            try values.encode(displayName, forKey: .displayName)
            try values.encode(bio, forKey: .bio)
            try values.encode(location, forKey: .location)
            try values.encode(website, forKey: .website)
            if changedAvatar { try values.encode(avatarUrl, forKey: .avatarUrl) }
            if changedBanner { try values.encode(bannerUrl, forKey: .bannerUrl) }
            if !socialChanges.isEmpty { try values.encode(socialChanges, forKey: .socialLinks) }
            try values.encodeIfPresent(styleChange, forKey: .avatarRingStyle)
            try values.encodeIfPresent(colorChange, forKey: .avatarRingColor)
            try values.encodeIfPresent(bookChange, forKey: .sportsbooks)
        }
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
    @State private var uploadingAvatar = false
    @State private var uploadingBanner = false
    @State private var choosingAvatarStyle = false

    private static let path = "/api/mobile/account/settings"

    var body: some View {
        Form {
            if source != nil {
                switch section {
                case .profile:
                    profileFields
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
                    Button("Save") { Task { await save() } }
                        .disabled(saving || uploadingAvatar || uploadingBanner || (section == .profile && profile.username.count < 2))
                }
            }
        }
        .task(id: retry) { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $choosingAvatarStyle) {
            NavigationStack {
                AvatarAppearancePicker(url: profile.avatarUrl, name: profileName, style: profile.ringStyle, color: profile.ringColor) {
                    profile.ringStyle = $0
                }
            }.presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private var profileFields: some View {
        SwiftUI.Section {
            profileArtwork
                .listRowInsets(EdgeInsets())
            HStack {
                NativePhotoPicker(title: "Profile photo", upload: {
                    try await NativeMediaUpload.upload($0, kind: .avatars, account: account, userID: userID)
                }, url: Binding(get: { profile.avatarUrl }, set: { profile.avatarUrl = $0; profile.changedAvatar = true }), uploading: $uploadingAvatar)
                Spacer()
                if profile.avatarUrl != nil && !uploadingAvatar {
                    Button("Remove profile photo", systemImage: "xmark.circle", role: .destructive) {
                        profile.avatarUrl = nil
                        profile.changedAvatar = true
                    }.labelStyle(.iconOnly).buttonStyle(.borderless)
                }
            }.disabled(uploadingBanner)
            HStack {
                NativePhotoPicker(title: "Cover photo", upload: {
                    try await NativeMediaUpload.upload($0, kind: .banners, account: account, userID: userID)
                }, url: Binding(get: { profile.bannerUrl }, set: { profile.bannerUrl = $0; profile.changedBanner = true }), uploading: $uploadingBanner)
                Spacer()
                if profile.bannerUrl != nil && !uploadingBanner {
                    Button("Remove cover photo", systemImage: "xmark.circle", role: .destructive) {
                        profile.bannerUrl = nil
                        profile.changedBanner = true
                    }.labelStyle(.iconOnly).buttonStyle(.borderless)
                }
            }.disabled(uploadingAvatar)
        }.listRowBackground(Brand.surface(for: scheme))
        if source?.profile.avatarRingStyle != nil { avatarAppearance }
        SwiftUI.Section {
            TextField("Username", text: $profile.username).textContentType(.username)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Display name", text: $profile.displayName).textContentType(.name)
            TextField("Bio", text: $profile.bio, axis: .vertical).lineLimit(3...6)
            TextField("Location", text: $profile.location)
            TextField("Website", text: $profile.website).keyboardType(.URL).textContentType(.URL)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
        }.listRowBackground(Brand.surface(for: scheme))
        if let books = source?.profile.sportsbookChoices, !books.isEmpty { sportsbookChoices(books) }
        if let platforms = source?.profile.socialPlatforms, !platforms.isEmpty {
            SwiftUI.Section("Public social links") {
                ForEach(platforms) { platform in
                    LabeledContent {
                        TextField(platform.name + " handle", text: Binding(get: { profile.links[platform.key, default: ""] }, set: {
                            profile.links[platform.key] = String($0.prefix(100))
                        }))
                        .multilineTextAlignment(.trailing).textInputAutocapitalization(.never).autocorrectionDisabled()
                    } label: {
                        Label {
                            Text(platform.name)
                        } icon: {
                            ResearchArtwork(urls: platform.iconURL.map { [$0] } ?? [], fallback: "at")
                                .frame(width: 23, height: 23).accessibilityHidden(true)
                        }
                    }
                }
            }.listRowBackground(Brand.surface(for: scheme))
        }
        NavigationLink {
            AccountConnectionsView(api: .init(account: account, userID: userID))
        } label: { Label("Connected accounts", systemImage: "person.badge.shield.checkmark") }
            .listRowBackground(Brand.surface(for: scheme))
    }

    private var profileName: String { profile.displayName.isEmpty ? profile.username : profile.displayName }

    private var avatarAppearance: some View {
        SwiftUI.Section("Avatar style") {
            Button { choosingAvatarStyle = true } label: {
                HStack(spacing: 12) {
                    NativeMemberAvatar(url: profile.avatarUrl, name: profileName, size: 42, style: profile.ringStyle, color: profile.ringColor)
                    Text(AvatarArtwork.title(profile.ringStyle)).foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.secondary)
                }
                .frame(minHeight: 49)
            }
            .accessibilityLabel("Change avatar style")
            .accessibilityValue(AvatarArtwork.title(profile.ringStyle))
            if AvatarArtwork.decoration(profile.ringStyle) == nil && profile.ringStyle != "none" {
                ColorPicker("Ring color", selection: Binding(get: { Color(hex: profile.ringColor) ?? Brand.accent(for: scheme) }, set: { color in
                    var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 1
                    guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return }
                    let values = [red, green, blue].map { Int((min(max(0, $0), 1) * 255).rounded()) }
                    profile.ringColor = String(format: "#%02x%02x%02x", values[0], values[1], values[2])
                }), supportsOpacity: false)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 6)]) {
                    ForEach(AvatarArtwork.colors, id: \.self) { hex in
                        let selected = profile.ringColor.caseInsensitiveCompare(hex) == .orderedSame
                        Button { profile.ringColor = hex } label: {
                            Circle().fill(Color(hex: hex) ?? .white)
                                .frame(width: 29, height: 29)
                                .overlay { Circle().strokeBorder(.secondary.opacity(0.45)) }
                                .overlay {
                                    if selected { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.black) }
                                }
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Use \(hex) ring color")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
        }.listRowBackground(Brand.surface(for: scheme))
    }

    private func sportsbookChoices(_ choices: [String]) -> some View {
        SwiftUI.Section("Sportsbooks") {
            ForEach(choices, id: \.self) { book in
                Toggle(isOn: Binding(get: { profile.books.contains(book) }, set: { enabled in
                    if enabled { profile.books.append(book) } else { profile.books.removeAll { $0 == book } }
                })) {
                    Label {
                        Text(Sportsbook.name(book))
                    } icon: {
                        ProfileSportsbookLogo(key: book)
                    }
                }
            }
        }.listRowBackground(Brand.surface(for: scheme))
    }

    private var profileArtwork: some View {
        ZStack(alignment: .bottomLeading) {
            Rectangle().fill(Brand.accent(for: scheme).opacity(0.18))
            GeometryReader { geometry in
                AsyncImage(url: profile.bannerUrl) { image in
                    image.resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                } placeholder: { Color.clear }
            }.frame(height: 128)
            NativeMemberAvatar(url: profile.avatarUrl, name: profileName, size: 56, style: profile.ringStyle, color: profile.ringColor)
                .padding(15)
        }.accessibilityHidden(true).frame(height: 128)
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
            profile = .init(username: value.profile.username, displayName: value.profile.displayName ?? "", bio: value.profile.bio ?? "",
                location: value.profile.location ?? "", website: value.profile.website ?? "", avatarUrl: value.profile.avatarUrl,
                bannerUrl: value.profile.bannerUrl, links: value.profile.socialLinks ?? [:],
                ringStyle: value.profile.avatarRingStyle ?? "surge", ringColor: value.profile.avatarRingColor ?? AvatarArtwork.defaultColor,
                books: value.profile.sportsbooks ?? [])
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
            case .profile:
                var edit = profile
                if edit.username == source?.profile.username { edit.username = "" }
                if let before = source?.profile.avatarRingStyle, before != edit.ringStyle { edit.styleChange = .init(before: before, value: edit.ringStyle) }
                if let before = source?.profile.avatarRingColor, before != edit.ringColor { edit.colorChange = .init(before: before, value: edit.ringColor) }
                if let before = source?.profile.sportsbooks, before != edit.books { edit.bookChange = .init(before: before, value: edit.books) }
                for platform in source?.profile.socialPlatforms ?? [] {
                    let before = source?.profile.socialLinks?[platform.key] ?? ""
                    let handle = edit.links[platform.key, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
                    if before != handle { edit.socialChanges[platform.key] = .init(before: before, handle: handle) }
                }
                try await patch(Self.path, body: edit)
                await load()
            case .privacy: try await patch(Self.path, body: privacy)
            case .alerts:
                guard let baseline else { return }
                try await patch("/api/account/preferences", body: NotificationsEdit(value: .init(settings: notifications, delivery: delivery), expected: baseline))
                self.baseline = .init(notification_settings: notifications, notification_delivery_settings: delivery)
            }
            feedback = "Saved"
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            if section == .profile, let body = try? JSONDecoder().decode(SettingsError.self, from: error.data) {
                feedback = body.error
            } else {
                feedback = "Preferences changed on another device. Refresh to load the saved values."
            }
        } catch {
            feedback = "Changes couldn’t be confirmed. Your edits are still here."
        }
    }

    private struct SettingsError: Decodable { let error: String }

    private func patch<Body: Encodable>(_ path: String, body: Body) async throws {
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: path)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(try await account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await SlipSurgeHTTP.send(request)
    }
}
