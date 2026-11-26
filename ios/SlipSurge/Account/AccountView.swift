import SwiftUI

struct AccountView: View {
    let account: AccountStore
    @Binding var appearance: Appearance
    var isYou = false
    var replayIntroduction: (() -> Void)? = nil
    var signInPurpose: String? = nil
    @EnvironmentObject private var push: PushNotifications
    @Environment(\.slipPalette) private var slipPalette
    @State private var code = ""

    var body: some View {
        Group {
            if account.needsNewPassword {
                EmailAccountForm(account: account, flow: .password)
            } else if account.needsVerification || account.user != nil {
                signedInForm
            } else {
                AccountSignInView(account: account, appearance: $appearance, purpose: signInPurpose)
            }
        }
        .navigationTitle(isYou ? "You" : "Account")
        .task { await account.checkProviders() }
        .background { SlipBackdrop() }
        .foregroundStyle(slipPalette.text)
        .tint(slipPalette.accent)
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
                        if let identity = account.profileIdentity {
                            NavigationLink {
                                MemberProfileView(api: .init(account: account, userID: userID), target: userID.uuidString)
                            } label: {
                                Label {
                                    Text("View profile")
                                } icon: {
                                    NativeMemberAvatar(url: identity.avatarUrl, name: identity.name, size: 26,
                                        style: identity.avatarRingStyle, color: identity.avatarRingColor)
                                }
                            }
                        }
                        NavigationLink {
                            MemberAccountView(account: account, userID: userID)
                        } label: {
                            Label("Profile & membership", systemImage: "person.text.rectangle")
                        }
                        if !isYou {
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
                        }
                        NavigationLink {
                            FeedBookmarksView(api: FeedAPI(account: account, userID: userID))
                        } label: {
                            Label("Bookmarks", systemImage: "bookmark")
                        }
                        NavigationLink {
                            ActivityReplayView(api: .init(account: account, userID: userID))
                        } label: {
                            Label("Activity Replay", systemImage: "clock.arrow.circlepath")
                        }
                        NavigationLink {
                            MemberProgressView(api: .init(account: account, userID: userID))
                        } label: {
                            Label("Missions", systemImage: "trophy")
                        }
                    }
                    if !account.onboardingComplete {
                        NavigationLink {
                            NativeOnboarding(account: account)
                        } label: {
                            Label("Finish account setup", systemImage: "person.crop.circle.badge.checkmark")
                        }
                        Button("Check account setup", systemImage: "arrow.clockwise") { Task { await account.recheckOnboarding() } }
                            .disabled(account.isBusy)
                    }
                    Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                        Task { await push.signOut(account: account) }
                    }
                    .disabled(account.isBusy || push.signingOut)
                }
                .listRowBackground(slipPalette.surface)
                if account.memberID != nil {
                    Section("Device alerts") { DeviceAlertControl() }
                        .listRowBackground(slipPalette.surface)
                }
            }
            if let notice = account.notice {
                Text(notice)
                    .listRowBackground(slipPalette.surface)
            }
            Section("Display") {
                Picker(selection: $appearance) {
                    ForEach(Appearance.allCases, id: \.self) { option in
                        Label(option.rawValue, systemImage: option.symbol).tag(option)
                    }
                } label: {
                    Label("Appearance", systemImage: "paintpalette")
                }
                if let replayIntroduction {
                    Button("Replay introduction", systemImage: "play.rectangle", action: replayIntroduction)
                }
            }
            .listRowBackground(slipPalette.surface)
            Section {
                NavigationLink {
                    NativeMembershipOverview(account: account)
                } label: { Label("Memberships", systemImage: "person.crop.circle.badge.checkmark") }
                InformationLink(page: .support, account: account)
                InformationLink(page: .faq, account: account)
                InformationLink(page: .about, account: account)
                InformationLink(page: .responsibleGambling, account: account)
                InformationLink(page: .terms, account: account)
                InformationLink(page: .privacy, account: account)
            }
            .listRowBackground(slipPalette.surface)
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
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
        .listRowBackground(slipPalette.surface)
    }
}
