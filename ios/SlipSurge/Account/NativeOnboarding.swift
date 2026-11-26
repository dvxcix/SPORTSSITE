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
        case profile = "Make it yours"
        case teams = "Follow your sports"
        case privacy = "Choose your privacy"
        case alerts = "Stay in the loop"

        var icon: String {
            switch self {
            case .profile: "person.crop.circle"
            case .teams: "sportscourt"
            case .privacy: "lock.shield"
            case .alerts: "bell.badge"
            }
        }
    }

    let account: AccountStore
    var completed: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
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

    private var stepIndex: Int { Step.allCases.firstIndex(of: step) ?? 0 }
    private var busy: Bool { account.isBusy || uploadingAvatar || uploadingBanner }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let initial, let draft = Binding($draft) {
                        introduction.id("top")
                        stage(initial, draft: draft)
                            .id(step)
                            .transition(.opacity)
                        if failed {
                            Text("Setup couldn’t save. Your selections are still here.")
                                .font(.footnote).foregroundStyle(Brand.signal(-1, for: scheme))
                        }
                    } else {
                        ResearchToolMessage(title: "Setup couldn’t load", error: error, loadingLabel: "Loading account setup") { retry += 1 }
                    }
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: step) { _, _ in scroll.scrollTo("top", anchor: .top) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let draft {
                    Button {
                        if step == .alerts { Task { await apply(draft) } }
                        else { navigate(to: stepIndex + 1) }
                    } label: {
                        Text(step == .alerts ? "Finish setup" : "Continue")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .fontWeight(.semibold)
                    .frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
                    .padding(12)
                    .background(.bar)
                    .disabled(busy)
                }
            }
        }
        .task(id: retry) { await load() }
        .navigationTitle("Account setup")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if stepIndex > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Previous step", systemImage: "chevron.backward") { navigate(to: stepIndex - 1) }
                        .labelStyle(.iconOnly)
                        .disabled(busy)
                }
            }
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProgressView(value: Double(stepIndex + 1), total: Double(Step.allCases.count))
                .accessibilityLabel("Setup progress")
                .accessibilityValue("Step \(stepIndex + 1) of \(Step.allCases.count)")
            Image(systemName: step.icon)
                .font(.title2.weight(.semibold))
                .foregroundStyle(slipPalette.accent)
                .frame(width: 50, height: 50)
                .background(slipPalette.accent.opacity(0.12), in: .circle)
                .accessibilityHidden(true)
            Text(step.rawValue).font(.largeTitle.weight(.bold)).accessibilityAddTraits(.isHeader)
        }
    }

    private func navigate(to index: Int) {
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.22)) { step = Step.allCases[index] }
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
            VStack(alignment: .leading, spacing: 10) {
                Text("Turn on iPhone alerts for the updates you care about. You can change these anytime in Settings.")
                    .font(.subheadline).foregroundStyle(.secondary)
                DeviceAlertControl().buttonStyle(.bordered).controlSize(.large)
            }
            Text("Alert preferences").font(.headline).accessibilityAddTraits(.isHeader)
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
            .foregroundStyle(selected ? slipPalette.accent : slipPalette.text)
            .background(selected ? slipPalette.accent.opacity(0.16) : slipPalette.surface, in: .rect(cornerRadius: 10))
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
                finish()
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
            finish()
        } catch {
            failed = true
        }
    }

    private func finish() {
        if let completed { completed() }
        else { dismiss() }
    }
}
