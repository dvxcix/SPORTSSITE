import SwiftUI

struct AccountCredentialsView: View {
    let account: AccountStore
    let userID: UUID
    let email: String?

    @Environment(\.colorScheme) private var scheme
    @State private var address = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var code = ""
    @State private var needsCode = false
    @State private var busy = false
    @State private var message: String?
    @State private var failure: String?

    var body: some View {
        Form {
            Section {
                if let email { LabeledContent("Current email", value: email) }
                TextField("New email address", text: $address).textContentType(.emailAddress).keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Update email") { Task { await updateEmail() } }
                    .disabled(!address.contains("@") || address.count > 254 || address.caseInsensitiveCompare(email ?? "") == .orderedSame)
            } header: { Text("Email address") }
            .listRowBackground(Brand.surface(for: scheme))

            Section {
                SecureField("New password", text: $password).textContentType(.newPassword)
                SecureField("Confirm new password", text: $confirm).textContentType(.newPassword)
                if needsCode {
                    TextField("Email verification code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                    Button("Send verification code") { Task { await requestCode() } }
                }
                Button("Change password") { Task { await updatePassword() } }
                    .disabled(!(8...128).contains(password.count) || password != confirm || needsCode && code.isEmpty)
            } header: { Text("Password") }
            .listRowBackground(Brand.surface(for: scheme))

            if let failure { Label(failure, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            if let message { Label(message, systemImage: "checkmark.circle").foregroundStyle(Brand.accent(for: scheme)) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .navigationTitle("Email and password")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(busy)
    }

    private func updateEmail() async {
        await perform("Email couldn’t be updated. Check the address and try again.") {
            let newAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
            let user = try await account.withSecuritySession(for: userID) { current in
                try await AccountAPI().updateUser(["email": newAddress], session: current)
            }
            message = user.email?.caseInsensitiveCompare(newAddress) == .orderedSame
                ? "Email updated." : "Check your email for the confirmation links."
            address = ""
        }
    }

    private func requestCode() async {
        await perform("A verification code couldn’t be sent. Try again.") {
            try await account.withSecuritySession(for: userID) { try await AccountAPI().requestPasswordCode(session: $0) }
            message = "Check your email for the verification code."
        }
    }

    private func updatePassword() async {
        await perform("Password couldn’t be updated. Check the details and try again.") {
            do {
                try await account.withSecuritySession(for: userID) { current in
                    try await AccountAPI().updatePassword(password, nonce: needsCode ? code : nil, session: current)
                    if var alert = try? SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/settings/notify-password-changed", timeout: 10) {
                        alert.httpMethod = "POST"
                        alert.setValue("Bearer \(current.accessToken)", forHTTPHeaderField: "Authorization")
                        _ = try? await SlipSurgeHTTP.send(alert)
                    }
                }
                password = ""
                confirm = ""
                code = ""
                needsCode = false
                message = "Password updated."
            } catch let error as SlipSurgeHTTP.Status {
                struct AuthFailure: Decodable { let error_code: String? }
                switch (try? JSONDecoder().decode(AuthFailure.self, from: error.data))?.error_code {
                case "reauthentication_needed", "reauthentication_not_valid":
                    needsCode = true
                    failure = "Request a verification code to finish changing your password."
                case "same_password":
                    failure = "Choose a different password."
                default:
                    throw error
                }
            }
        }
    }

    private func perform(_ fallback: String, action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        message = nil
        failure = nil
        defer { busy = false }
        do { try await action() } catch { failure = fallback }
    }
}
