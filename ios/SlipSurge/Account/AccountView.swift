import SwiftUI

struct AccountView: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    @Environment(\.colorScheme) private var scheme
    @State private var code = ""

    var body: some View {
        Group {
            if account.needsNewPassword {
                EmailAccountForm(account: account, flow: .password)
            } else if account.needsVerification || account.user != nil {
                signedInForm
            } else {
                AccountSignInView(account: account, appearance: $appearance)
            }
        }
        .navigationTitle("Account")
        .task { await account.checkProviders() }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
    }

    private var signedInForm: some View {
        Form {
            if account.needsVerification {
                verificationFields
            } else if let user = account.user {
                Section("Signed in") {
                    if let address = user.email {
                        Text(address).textContentType(.emailAddress)
                    }
                    if let userID = account.memberID {
                        NavigationLink {
                            MemberAccountView(account: account, userID: userID)
                        } label: {
                            Label("Profile & membership", systemImage: "person.text.rectangle")
                        }
                        NavigationLink {
                            ActivityView(api: ActivityAPI(account: account, userID: userID))
                        } label: {
                            Label("Notifications", systemImage: "bell")
                        }
                        NavigationLink {
                            MessagesView(api: MessagesAPI(account: account, userID: userID))
                        } label: {
                            Label("Messages", systemImage: "bubble.left.and.bubble.right")
                        }
                        NavigationLink {
                            FeedBookmarksView(api: FeedAPI(account: account, userID: userID))
                        } label: {
                            Label("Bookmarks", systemImage: "bookmark")
                        }
                    }
                    if !account.onboardingComplete {
                        NavigationLink {
                            NativeOnboarding(account: account)
                        } label: {
                            Label("Finish account setup", systemImage: "person.crop.circle.badge.checkmark")
                        }
                        Button("Check account setup") { Task { await account.recheckOnboarding() } }
                            .disabled(account.isBusy)
                    }
                    Button("Sign out", role: .destructive) {
                        Task { await account.signOut() }
                    }
                    .disabled(account.isBusy)
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
        .scrollContentBackground(.hidden)
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
}
