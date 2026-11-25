import SwiftUI

struct AccountView: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Environment(\.colorScheme) private var scheme
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @FocusState private var focus: Field?

    private enum Field {
        case email, password
    }

    private var canSignIn: Bool {
        !account.isBusy && account.isConfigured && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    var body: some View {
        Form {
            if account.needsVerification {
                verificationFields
            } else if let user = account.user {
                Section("Signed in") {
                    if let address = user.email {
                        Text(address).textContentType(.emailAddress)
                    }
                    if !account.onboardingComplete {
                        SiteLink("Finish account setup on the web", path: "/onboarding")
                        Button("Check account setup") { Task { await account.recheckOnboarding() } }
                            .disabled(account.isBusy)
                    }
                    Button("Sign out", role: .destructive) {
                        Task { await account.signOut() }
                    }
                    .disabled(account.isBusy)
                }
                .listRowBackground(Brand.surface(for: scheme))
            } else {
                signInFields
                Section("Account help on the web") {
                    SiteLink("Forgot password?", path: "/auth/forgot-password")
                    SiteLink("Create account", path: "/auth/register")
                }
                .listRowBackground(Brand.surface(for: scheme))
            }
            if let notice = account.notice {
                Text(notice)
                    .listRowBackground(Brand.surface(for: scheme))
            }
            Section("Display") {
                Picker("Appearance", selection: $appearance) {
                    ForEach(Appearance.allCases, id: \.self) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
            }
            .listRowBackground(Brand.surface(for: scheme))
            Section {
                SiteLink("Terms", path: "/terms")
                SiteLink("Privacy policy", path: "/privacy")
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
        .navigationTitle("Account")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
    }

    private var verificationFields: some View {
        Section("Two-factor verification") {
            TextField("Six-digit authenticator code", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .onChange(of: code) { _, value in
                    code = String(value.filter { $0.isASCII && $0.isNumber }.prefix(6))
                }
                .disabled(account.isBusy)
            Button("Verify and continue") {
                let submitted = code
                code = ""
                Task { await account.verify(submitted) }
            }
            .disabled(account.isBusy || code.count != 6)
            Button("Cancel", role: .cancel) {
                code = ""
                Task { await account.cancelVerification() }
            }
            .disabled(account.isBusy)
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    private var signInFields: some View {
        Section {
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focus, equals: .email)
                .submitLabel(.next)
                .onSubmit { focus = .password }
                .disabled(account.isBusy || !account.isConfigured)
            SecureField("Password", text: $password)
                .textContentType(.password)
                .focused($focus, equals: .password)
                .submitLabel(.go)
                .onSubmit(submit)
                .disabled(account.isBusy || !account.isConfigured)
            Button(action: submit) {
                if account.isBusy {
                    ProgressView("Signing in")
                } else {
                    Text("Sign in").fontWeight(.semibold)
                }
            }
            .disabled(!canSignIn)
        } header: {
            Text("Sign in to SlipSurge")
        } footer: {
            if !account.isConfigured {
                Text("Sign-in isn’t configured for this build.")
            }
        }
        .listRowBackground(Brand.surface(for: scheme))
    }

    private func submit() {
        guard canSignIn else { return }
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedPassword = password
        focus = nil
        password = ""
        Task { await account.signIn(email: address, password: submittedPassword) }
    }
}
