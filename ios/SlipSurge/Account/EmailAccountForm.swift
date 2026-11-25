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

    private var validEmail: Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return address.utf16.count <= 254 && address.contains("@") && !address.isEmpty
    }

    private var valid: Bool {
        guard account.isConfigured, !account.isBusy else { return false }
        switch flow {
        case .registration:
            return validEmail && username.range(of: "^[a-z0-9._]{2,30}$", options: .regularExpression) != nil
                && password.count >= 8 && password.count <= 128
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
                } else {
                    fields
                    if let notice = account.notice {
                        Label(notice, systemImage: "exclamationmark.circle").font(.footnote)
                    }
                    Button(action: submit) {
                        Group {
                            if account.isBusy {
                                ProgressView()
                            } else {
                                Text(flow == .password ? "Update password" : flow == .recovery ? "Send reset link" : "Create account")
                                    .font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Brand.accent(for: scheme), in: .rect(cornerRadius: 14))
                        .foregroundStyle(scheme == .dark ? .black : .white)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .disabled(!valid).opacity(valid ? 1 : 0.52)
                }
            }
            .padding(18)
            .frame(maxWidth: 460)
            .frame(maxWidth: .infinity)
        }
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
        .onChange(of: account.needsNewPassword) { _, ready in if ready && flow != .password { dismiss() } }
        .onChange(of: account.user?.id) { _, user in if user != nil && flow != .password { dismiss() } }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
    }

    @ViewBuilder
    private var fields: some View {
        if flow != .password {
            TextField("Email address", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress)
                .textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
        }
        if flow != .recovery {
            SecureField("Password (at least 8 characters)", text: $password)
                .textContentType(.newPassword).textFieldStyle(.roundedBorder)
        }
        if flow == .registration {
            TextField("Username", text: $username).textContentType(.username).textInputAutocapitalization(.never)
                .autocorrectionDisabled().textFieldStyle(.roundedBorder)
                .onChange(of: username) { _, value in
                    if value.lowercased() != value { username = value.lowercased() }
                }
            TextField("Display name", text: $displayName).textContentType(.name).textFieldStyle(.roundedBorder)
            HStack(spacing: 14) {
                SiteLink("Terms", path: "/terms")
                SiteLink("Privacy", path: "/privacy")
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

    private func submit() {
        guard valid else { return }
        Task {
            let address = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch flow {
            case .registration:
                let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                let result = await account.beginEmail(.init(email: address, password: password, username: username,
                    displayName: name.isEmpty ? username : String(name.prefix(60)), sports: []))
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
