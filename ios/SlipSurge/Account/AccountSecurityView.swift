import CoreImage.CIFilterBuiltins
import SwiftUI

struct AccountSecurityView: View {
    let account: AccountStore
    let userID: UUID

    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.openURL) private var openURL
    @State private var current: AccountSession.User?
    @State private var enrollment: AuthenticatorEnrollment?
    @State private var code = ""
    @State private var busy = false
    @State private var failure: String?
    @State private var notice: String?
    @State private var removing: AccountSession.User.Factor?
    @State private var endSessions = false

    var body: some View {
        Form {
            Section {
                if let current {
                    NavigationLink {
                        AccountCredentialsView(account: account, userID: userID, email: current.email)
                    } label: {
                        Label("Email and password", systemImage: "key.horizontal")
                    }
                } else if failure == nil {
                    ProgressView("Checking account security")
                } else {
                    Button("Retry") { Task { await load() } }
                }
            }.listRowBackground(slipPalette.surface)

            if let current {
                let factors = current.factors?.filter { $0.factorType == "totp" && $0.status == "verified" } ?? []
                let unfinished = current.factors?.first { $0.factorType == "totp" && $0.status == "unverified" && $0.friendlyName == "SlipSurge authenticator" }
                Section {
                    if factors.isEmpty, enrollment == nil {
                        if let unfinished {
                            Button("Discard unfinished setup", systemImage: "xmark.circle") {
                                Task { await remove(unfinished.id, pending: true) }
                            }
                        } else {
                            Button("Set up authenticator", systemImage: "shield.lefthalf.filled") {
                                Task { await beginEnrollment() }
                            }
                        }
                    }
                    ForEach(factors, id: \.id) { factor in
                        HStack {
                            Label(factor.friendlyName ?? "Authenticator app", systemImage: "checkmark.shield.fill")
                            Spacer()
                            Button("Remove", role: .destructive) { removing = factor }
                                .buttonStyle(.borderless)
                        }
                    }
                    if let enrollment { enrollmentControls(enrollment) }
                } header: {
                    Text("Two-factor authentication")
                } footer: {
                    if enrollment == nil { Text("Use a six-digit code from your authenticator when you sign in.") }
                }
                .listRowBackground(slipPalette.surface)

                Section {
                    Button("Sign out other devices", systemImage: "rectangle.portrait.and.arrow.right") { endSessions = true }
                } footer: { Text("Keep this iPhone signed in.") }
                .listRowBackground(slipPalette.surface)
            }
            if let failure { Label(failure, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            if let notice { Label(notice, systemImage: "checkmark.circle").foregroundStyle(slipPalette.accent) }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .navigationTitle("Account security")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(busy)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Remove this authenticator?", isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible, presenting: removing) { factor in
            Button("Remove authenticator", role: .destructive) {
                Task { await remove(factor.id) }
            }
        }
        .confirmationDialog("Sign out all other devices?", isPresented: $endSessions, titleVisibility: .visible) {
            Button("Sign out other devices", role: .destructive) { Task { await signOutOthers() } }
        }
    }

    @ViewBuilder
    private func enrollmentControls(_ enrollment: AuthenticatorEnrollment) -> some View {
        if let image = Self.qrCode(enrollment.totp.uri) {
            Image(decorative: image, scale: 1).interpolation(.none).resizable().scaledToFit()
                .frame(maxWidth: 176).padding(12).background(.white, in: .rect(cornerRadius: 10))
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Authenticator setup QR code")
                .privacySensitive()
        }
        Button("Open authenticator", systemImage: "arrow.up.right.square") {
            openURL(enrollment.totp.uri) { accepted in
                if !accepted { failure = "Open your authenticator app and enter the setup key." }
            }
        }
        LabeledContent {
            Text(verbatim: enrollment.totp.secret).font(.footnote.monospaced()).textSelection(.enabled).privacySensitive()
        } label: { Text("Setup key") }
        TextField("Six-digit code", text: $code)
            .textContentType(.oneTimeCode).keyboardType(.numberPad).monospacedDigit()
            .onChange(of: code) { _, value in code = String(value.filter { $0.isASCII && $0.isNumber }.prefix(6)) }
        Button("Verify authenticator", systemImage: "checkmark.shield") {
            Task { await verify(enrollment.id) }
        }.disabled(code.count != 6)
        Button("Cancel setup", role: .cancel) { Task { await remove(enrollment.id, pending: true) } }
    }

    private static func qrCode(_ uri: URL) -> CGImage? {
        let generator = CIFilter.qrCodeGenerator()
        generator.message = Data(uri.absoluteString.utf8)
        guard let image = generator.outputImage else { return nil }
        return CIContext().createCGImage(image, from: image.extent)
    }

    private func load() async {
        do {
            current = try await account.withSecuritySession(for: userID) { try await AccountAPI().validatedUser($0) }
            failure = nil
        } catch {
            if !Task.isCancelled { failure = "Account security couldn’t load. Try again." }
        }
    }

    private func beginEnrollment() async {
        await perform("Authenticator setup couldn’t start.") {
            enrollment = try await account.setupAuthenticator(for: userID)
        }
    }

    private func verify(_ id: UUID) async {
        await perform("Enter the latest six-digit code from your authenticator.") {
            try await account.verifyAuthenticator(code, id: id, for: userID)
            enrollment = nil
            code = ""
            notice = "Two-factor authentication is active."
            await load()
        }
    }

    private func remove(_ id: UUID, pending: Bool = false) async {
        await perform("The authenticator couldn’t be removed. Try again.") {
            try await account.withSecuritySession(for: userID) { try await AccountAPI().removeAuthenticator(id, session: $0) }
            if pending { enrollment = nil; code = "" }
            else { notice = "Authenticator removed." }
            await load()
        }
    }

    private func signOutOthers() async {
        await perform("Other sessions couldn’t be signed out. Try again.") {
            try await account.withSecuritySession(for: userID) { try await AccountAPI().signOut($0, otherDevices: true) }
            notice = "Other devices were signed out."
        }
    }

    private func perform(_ fallback: String, action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        failure = nil
        notice = nil
        defer { busy = false }
        do { try await action() } catch { failure = fallback }
    }
}
