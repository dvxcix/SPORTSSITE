import SwiftUI

struct EmailAccountForm: View {
    enum Flow: String, Identifiable {
        case registration = "Create account"
        case recovery = "Reset your password"
        case password = "Set a new password"
        var id: String { rawValue }
    }

    let account: AccountStore
    let flow: Flow
    var prefill = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var username = ""
    @State private var displayName = ""
    @State private var code = ""
    @State private var sent = false
    @State private var registration: AccountAPI.RegistrationAvailability?
    @State private var registrationIssue = false
    @State private var registrationRevision = 0
    @State private var settingUpProfile = false
    @State private var followedSports: Set<String> = ["NFL"]
    @State private var openingProvider: SignInProvider?

    private var validEmail: Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return address.utf16.count <= 254 && address.contains("@") && !address.isEmpty
    }

    private var valid: Bool {
        guard account.isConfigured, !account.isBusy else { return false }
        switch flow {
        case .registration:
            return registration?.open == true && validEmail && password.count >= 8 && password.count <= 128
                && (!settingUpProfile || username.range(of: "^[a-z0-9._]{2,30}$", options: .regularExpression) != nil)
        case .recovery:
            return validEmail
        case .password:
            return password.count >= 8 && password.count <= 128 && password == confirm
                && (!account.recoveryNeedsAuthenticator || code.count == 6)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 15) {
                if sent {
                    ContentUnavailableView("Check your email", systemImage: "envelope.badge.shield.half.filled",
                        description: Text("Open the secure link on this device."))
                } else if flow == .registration && registration?.open != true {
                    registrationStatus
                } else {
                    if flow == .registration { registrationHeading }
                    fields
                    if let notice = account.notice {
                        Label(notice, systemImage: "exclamationmark.circle").font(.footnote)
                    }
                    Button(action: submit) {
                        Group {
                            if account.isBusy {
                                ProgressView()
                            } else {
                                Text(submitTitle).font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Brand.accent(for: scheme), in: .rect(cornerRadius: 14))
                        .foregroundStyle(scheme == .dark ? .black : .white)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .disabled(!valid).opacity(valid ? 1 : 0.52)
                    if flow == .registration {
                        Button(settingUpProfile ? "Back to account details" : "Already have an account? Sign in") {
                            if settingUpProfile { showProfile(false) } else { dismiss() }
                        }
                        .frame(minHeight: 44)
                    }
                }
            }
            .padding(22)
            .frame(maxWidth: 460)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(flow.rawValue)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", systemImage: "xmark") {
                    if flow == .password { account.cancelRecovery() } else { dismiss() }
                }
                .labelStyle(.iconOnly)
            }
        }
        .onAppear { if email.isEmpty { email = prefill } }
        .task(id: registrationRevision) {
            guard flow == .registration else { return }
            registrationIssue = false
            do {
                registration = try await account.registrationAvailability()
            } catch is CancellationError {
                return
            } catch {
                registrationIssue = true
            }
        }
        .onChange(of: account.needsNewPassword) { _, ready in if ready && flow != .password { dismiss() } }
        .onChange(of: account.user?.id) { _, user in if user != nil && flow != .password { dismiss() } }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }

    private var submitTitle: String {
        switch flow {
        case .registration: settingUpProfile ? "Create account" : "Continue"
        case .recovery: "Send reset link"
        case .password: "Update password"
        }
    }

    @ViewBuilder private var registrationStatus: some View {
        if registrationIssue {
            ContentUnavailableView {
                Label("Registration couldn’t load", systemImage: "wifi.exclamationmark")
            } actions: {
                Button("Try again") { registrationRevision += 1 }
            }
        } else if registration?.open == false {
            ContentUnavailableView {
                Label("Registration is closed", systemImage: "person.crop.circle.badge.xmark")
            } description: {
                Text("Check back soon or sign in to your existing account.")
            } actions: {
                Button("Back to sign in") { dismiss() }
            }
        } else {
            ProgressView("Checking registration").frame(maxWidth: .infinity, minHeight: 120)
        }
    }

    private var registrationHeading: some View {
        VStack(alignment: .leading, spacing: 9) {
            ProgressView(value: settingUpProfile ? 2 : 1, total: 2)
                .tint(Brand.accent(for: scheme))
                .accessibilityLabel("Registration progress")
                .accessibilityValue(settingUpProfile ? "2 of 2" : "1 of 2")
            Text(settingUpProfile ? "Set up your profile" : "Join SlipSurge")
                .font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
            if !settingUpProfile && account.providersAvailable {
                BrandedSignInProviders(account: account, opening: $openingProvider, registering: true)
                    .padding(.top, 5)
                Label("Or continue with email", systemImage: "envelope").font(.subheadline).foregroundStyle(.secondary)
                    .padding(.top, 6)
            }
        }
    }

    @ViewBuilder
    private var fields: some View {
        if flow != .password && !settingUpProfile {
            TextField("Email address", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress)
                .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
        }
        if flow != .recovery && !settingUpProfile {
            SecureField("Password (at least 8 characters)", text: $password)
                .textContentType(.newPassword).textFieldStyle(.roundedBorder)
        }
        if flow == .registration && settingUpProfile {
            TextField("Username", text: $username).textContentType(.username).textInputAutocapitalization(.never)
                .autocorrectionDisabled().textFieldStyle(.roundedBorder)
                .onChange(of: username) { _, value in
                    let normalized = String(value.lowercased().filter { !$0.isWhitespace }.prefix(30))
                    if normalized != value { username = normalized }
                }
            TextField("Display name", text: $displayName).textContentType(.name).textFieldStyle(.roundedBorder)
            if let registration { sportPreferences(registration.sports) }
            HStack(spacing: 14) {
                InformationLink(page: .terms, account: account, label: "Terms")
                InformationLink(page: .privacy, account: account, label: "Privacy")
            }.font(.caption)
        }
        if flow == .password {
            SecureField("Confirm password", text: $confirm).textContentType(.newPassword).textFieldStyle(.roundedBorder)
            if account.recoveryNeedsAuthenticator {
                TextField("Authenticator code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }
            }
        }
    }

    private func sportPreferences(_ sports: [AccountAPI.RegistrationAvailability.Sport]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sports you follow").font(.headline).accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8)], spacing: 8) {
                ForEach(sports) { sport in
                    let selected = followedSports.contains(sport.id)
                    Button {
                        if selected { followedSports.remove(sport.id) } else { followedSports.insert(sport.id) }
                    } label: {
                        HStack(spacing: 6) {
                            if let logo = sport.logo {
                                ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 23, height: 23)
                            }
                            Text(sport.id).font(.subheadline.weight(.semibold))
                            Spacer(minLength: 0)
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selected ? Brand.accent(for: scheme) : .secondary)
                                .accessibilityHidden(true)
                        }
                        .padding(.horizontal, 9).frame(minHeight: 44)
                        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 10))
                        .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(selected ? Brand.accent(for: scheme) : .secondary.opacity(0.18)) }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .sensoryFeedback(.selection, trigger: followedSports)
        }
    }

    private func showProfile(_ value: Bool) {
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.23)) { settingUpProfile = value }
    }

    private func submit() {
        guard valid else { return }
        if flow == .registration && !settingUpProfile {
            showProfile(true)
            return
        }
        Task {
            let address = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch flow {
            case .registration:
                let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                let sports = registration?.sports.map(\.id).filter { followedSports.contains($0) } ?? []
                let result = await account.beginEmail(.init(email: address, password: password, username: username,
                    displayName: name.isEmpty ? username : String(name.prefix(60)), sports: sports))
                if result { markSent() }
            case .recovery:
                if await account.beginRecovery(email: address) { markSent() }
            case .password:
                if await account.finishRecovery(password: password, code: code) {
                    password = ""
                    confirm = ""
                    code = ""
                }
            }
        }
    }

    private func markSent() {
        password = ""
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.23)) { sent = true }
    }
}
