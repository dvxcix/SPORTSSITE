import SwiftUI

struct NativeOnboarding: View {
    struct Team: Decodable, Identifiable {
        let key: String
        let sport: String
        let abbr: String
        let name: String
        let logo: URL?
        var id: String { key }
    }

    struct Player: Codable {
        let mlb_id: Int?
        let player_id: String?
        let name: String
        let team: String
        let sport: String?
        let headshot: String?
        let team_logo: String?
    }

    struct Initial: Decodable {
        let complete: Bool
        let allowMlb: Bool
        let username: String?
        let displayName: String
        let bio: String
        let avatarUrl: URL?
        let bannerUrl: URL?
        let sports: [String]
        let teams: [String]
        let favoritePlayers: [Player]
        let catalog: [Team]
        let isPrivate: Bool
        let hideWinRate: Bool
        let alerts: [String: Bool]
        let contentMix: [String]
        let marketFocus: [String]
    }

    struct Draft: Encodable {
        var displayName: String
        var bio: String
        var avatarUrl: URL?
        var bannerUrl: URL?
        var sports: [String]
        var teams: [String]
        var favoritePlayers: [Player]
        var isPrivate: Bool
        var hideWinRate: Bool
        var alerts: [String: Bool]
        var contentMix: [String]
        var marketFocus: [String]

        init(_ source: Initial) {
            displayName = source.displayName
            bio = source.bio
            avatarUrl = source.avatarUrl
            bannerUrl = source.bannerUrl
            sports = source.sports
            teams = source.teams
            favoritePlayers = source.favoritePlayers
            isPrivate = source.isPrivate
            hideWinRate = source.hideWinRate
            alerts = source.alerts
            contentMix = source.contentMix
            marketFocus = source.marketFocus
        }
    }

    private enum Step: String, CaseIterable {
        case profile = "Profile", teams = "Your sports", privacy = "Privacy", alerts = "Notifications"
    }

    let account: AccountStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var initial: Initial?
    @State private var draft: Draft?
    @State private var step = Step.profile
    @State private var teamSearch = ""
    @State private var uploadingAvatar = false
    @State private var uploadingBanner = false
    @State private var error: (any Error)?
    @State private var failed = false
    @State private var retry = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let initial, let draft = Binding($draft) {
                    ResearchToolRail(title: "Account setup", choices: Step.allCases, selection: $step, label: \.rawValue) {
                        switch $0 {
                        case .profile: "person.crop.circle"
                        case .teams: "sportscourt"
                        case .privacy: "lock"
                        case .alerts: "bell"
                        }
                    }
                    stage(initial, draft: draft)
                        .id(step)
                        .transition(.opacity)
                    if failed {
                        Text("Setup couldn’t save. Your selections are still here.")
                            .font(.footnote).foregroundStyle(Brand.signal(-1, for: scheme))
                    }
                    Button(step == .alerts ? "Finish setup" : "Continue") {
                        if let index = Step.allCases.firstIndex(of: step), index + 1 < Step.allCases.count {
                            withAnimation(reduceMotion ? nil : .smooth(duration: 0.22)) { step = Step.allCases[index + 1] }
                        } else {
                            Task { await apply(draft.wrappedValue) }
                        }
                    }
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                    .buttonStyle(.borderedProminent).disabled(account.isBusy || uploadingAvatar || uploadingBanner)
                } else {
                    ResearchToolMessage(title: "Setup couldn’t load", error: error) { retry += 1 }
                }
            }
            .padding(16)
        }
        .task(id: retry) { await load() }
        .navigationTitle("Set up your account")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }

    @ViewBuilder
    private func stage(_ initial: Initial, draft: Binding<Draft>) -> some View {
        switch step {
        case .profile:
            VStack(alignment: .leading, spacing: 12) {
                ZStack(alignment: .bottomLeading) {
                    if let banner = draft.bannerUrl.wrappedValue, FeedPostCard.allowedMedia(banner) {
                        ResearchArtwork(urls: [banner], fallback: "photo").frame(maxWidth: .infinity, maxHeight: 130)
                    }
                    let avatar = draft.avatarUrl.wrappedValue.flatMap { FeedPostCard.allowedMedia($0) ? [$0] : nil } ?? []
                    ResearchArtwork(urls: avatar, fallback: "person.crop.circle.fill")
                        .frame(width: 64, height: 64).clipShape(.circle).padding(5)
                }
                HStack {
                    NativePhotoPicker(title: "Profile photo", upload: { try await account.uploadSetupPhoto($0, kind: .avatars) },
                        url: draft.avatarUrl, uploading: $uploadingAvatar)
                        .disabled(uploadingBanner)
                    Spacer()
                    NativePhotoPicker(title: "Cover photo", upload: { try await account.uploadSetupPhoto($0, kind: .banners) },
                        url: draft.bannerUrl, uploading: $uploadingBanner)
                        .disabled(uploadingAvatar)
                }
                if let username = initial.username { Text("@\(username)").font(.subheadline).foregroundStyle(.secondary) }
                TextField("Display name", text: draft.displayName).textContentType(.name).textFieldStyle(.roundedBorder)
                TextField("Bio", text: draft.bio, axis: .vertical).lineLimit(3...5).textFieldStyle(.roundedBorder)
            }
        case .teams:
            teamPreferences(initial, draft: draft)
        case .privacy:
            Toggle("Private account", isOn: draft.isPrivate)
            Toggle("Hide win rate", isOn: draft.hideWinRate)
        case .alerts:
            ForEach([("lineup_confirmed", "Confirmed lineups"), ("new_pick", "New picks"), ("pick_result", "Pick results"),
                ("dm", "Messages")], id: \.0) { key, label in
                Toggle(label, isOn: Binding(get: { draft.alerts.wrappedValue[key] == true },
                    set: { draft.alerts.wrappedValue[key] = $0 }))
            }
        }
    }

    private func teamPreferences(_ source: Initial, draft: Binding<Draft>) -> some View {
        let sports = (source.allowMlb ? ["MLB"] : []) + ["NFL", "NBA", "NHL", "Soccer", "MMA"]
        let available = source.catalog.filter { team in draft.sports.wrappedValue.contains(where: { $0.caseInsensitiveCompare(team.sport) == .orderedSame }) }
        let teams = available.filter { teamSearch.isEmpty || $0.name.localizedCaseInsensitiveContains(teamSearch) }
        return VStack(alignment: .leading, spacing: 14) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 105), spacing: 7)], spacing: 8) {
                ForEach(sports, id: \.self) { sport in
                    option(sport, logo: LeagueArtwork.logo(sport), binding: draft.sports, key: sport)
                }
            }
            if !available.isEmpty {
                TextField("Find a team", text: $teamSearch).textFieldStyle(.roundedBorder)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 7)], spacing: 8) {
                    ForEach(teams) { team in option(team.name, logo: team.logo, binding: draft.teams, key: team.key) }
                }
            }
            Text("What you want to see").font(.headline).accessibilityAddTraits(.isHeader)
            options([("research", "Research"), ("picks", "Picks"), ("live-games", "Live games"), ("community", "Community"), ("creators", "Creators"), ("results", "Results")],
                selection: draft.contentMix)
            Text("Markets you follow").font(.headline).accessibilityAddTraits(.isHeader)
            options([("moneyline", "Game lines"), ("player-props", "Player props"), ("milestones", "Ladders"), ("first-score", "First score"),
                ("live", "Live markets"), ("matrices", "Matrices")], selection: draft.marketFocus)
        }
    }

    private func options(_ values: [(String, String)], selection: Binding<[String]>) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 115), spacing: 7)], spacing: 8) {
            ForEach(values, id: \.0) { key, label in
                option(label, logo: nil, binding: selection, key: key)
            }
        }
    }

    private func option(_ label: String, logo: URL?, binding: Binding<[String]>, key: String) -> some View {
        let selected = binding.wrappedValue.contains(key)
        return Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.19)) {
                if selected { binding.wrappedValue.removeAll { $0 == key } } else { binding.wrappedValue.append(key) }
            }
        } label: {
            HStack(spacing: 6) {
                if let logo { ResearchArtwork(urls: [logo], fallback: "shield").frame(width: 22, height: 22) }
                Text(label).font(.caption.weight(.semibold))
                Spacer(minLength: 0)
                if selected { Image(systemName: "checkmark").font(.caption.weight(.bold)).accessibilityHidden(true) }
            }
            .padding(.horizontal, 8)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? Brand.accent(for: scheme) : Brand.text(for: scheme))
            .background(selected ? Brand.accent(for: scheme).opacity(0.16) : Brand.surface(for: scheme), in: .rect(cornerRadius: 10))
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func load() async {
        do {
            let source = try await account.onboardingData()
            guard !Task.isCancelled else { return }
            if source.complete {
                await account.recheckOnboarding()
                dismiss()
            } else {
                initial = source
                draft = .init(source)
            }
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }

    private func apply(_ draft: Draft) async {
        failed = false
        do {
            try await account.finishOnboarding(draft)
            dismiss()
        } catch {
            failed = true
        }
    }
}
