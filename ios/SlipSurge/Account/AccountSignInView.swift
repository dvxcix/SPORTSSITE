import AuthenticationServices
import SwiftUI

struct AccountSignInView: View {
    let account: AccountStore
    @Binding var appearance: Appearance

    @Environment(\.webAuthenticationSession) private var browser
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var email = ""
    @State private var password = ""
    @State private var opening: SignInProvider?
    @State private var appeared = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    private var canSignIn: Bool {
        account.isConfigured && !account.isBusy && !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 21) {
                welcome
                if account.providersAvailable {
                    providerGroup
                        .transition(.opacity)
                }
                credentials
                help
            }
            .frame(maxWidth: 480)
            .padding(.horizontal, 22)
            .padding(.top, 14)
            .padding(.bottom, 22)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu("Appearance", systemImage: "circle.lefthalf.filled") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(Appearance.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .background(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                Brand.background(for: scheme)
                RadialGradient(colors: [Brand.accent(for: scheme).opacity(scheme == .dark ? 0.15 : 0.12), .clear],
                    center: .topLeading, startRadius: 16, endRadius: 310)
            }
            .ignoresSafeArea()
        }
        .foregroundStyle(Brand.text(for: scheme))
        .animation(reduceMotion ? nil : .easeOut(duration: 0.23), value: account.providersAvailable)
        .sensoryFeedback(.selection, trigger: opening) { _, next in next != nil }
        .onAppear {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.32)) { appeared = true }
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 9) {
                Image("brand")
                    .resizable().scaledToFit().frame(width: 34, height: 34)
                    .clipShape(.rect(cornerRadius: 9))
                    .accessibilityHidden(true)
                Text("SlipSurge").font(.headline.weight(.heavy))
            }
            Text("Welcome back")
                .font(.largeTitle.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Text("Sign in to join the conversation and get back to your research.")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .opacity(appeared || reduceMotion ? 1 : 0)
        .offset(y: appeared || reduceMotion ? 0 : 8)
    }

    @ViewBuilder
    private var providerGroup: some View {
        if #available(iOS 26, *) {
            GlassEffectContainer(spacing: 11) { providerButtons }
        } else {
            providerButtons
        }
    }

    private var providerButtons: some View {
        VStack(spacing: 10) {
            ForEach([SignInProvider.whop, .discord, .x]) { provider in
                Button {
                    open(provider)
                } label: {
                    providerAppearance(provider)
                }
                .buttonStyle(SlipSurgePressStyle())
                .disabled(account.isBusy || opening != nil)
            }
        }
    }

    @ViewBuilder
    private func providerAppearance(_ provider: SignInProvider) -> some View {
        let content = HStack(spacing: 10) {
            Image("sign-in-\(provider.rawValue)")
                .renderingMode(.template).resizable().scaledToFit()
                .frame(width: 23, height: 23)
                .foregroundStyle(provider == .discord ? (scheme == .dark ? Color(rgb: 0xA6ADFF) : Color(rgb: 0x353FC4)) : .primary)
                .accessibilityHidden(true)
            Text("Continue with \(provider.title)").font(.subheadline.weight(.bold))
            Spacer(minLength: 5)
            if opening == provider {
                ProgressView().tint(provider == .whop ? Color(rgb: 0x150E0C) : Brand.text(for: scheme))
            } else {
                Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .frame(minHeight: 52)
        .contentShape(.rect(cornerRadius: 15))

        if provider == .whop {
            content.foregroundStyle(Color(rgb: 0x150E0C))
                .background(Color(rgb: 0xFA4616), in: .rect(cornerRadius: 15))
        } else if #available(iOS 26, *) {
            content.foregroundStyle(Brand.text(for: scheme))
                .glassEffect(.regular.tint(provider == .discord ? Color(rgb: 0x5865F2).opacity(0.22) : .clear).interactive(),
                    in: .rect(cornerRadius: 15))
        } else {
            content.foregroundStyle(Brand.text(for: scheme))
                .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 15))
                .overlay { RoundedRectangle(cornerRadius: 15).strokeBorder(.secondary.opacity(0.23)) }
        }
    }

    private var credentials: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                Rectangle().fill(.secondary.opacity(0.22)).frame(height: 1)
                Text("Sign in with email").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                Rectangle().fill(.secondary.opacity(0.22)).frame(height: 1)
            }
            field("Email", icon: "envelope") {
                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress).textContentType(.username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focus, equals: .email).submitLabel(.next)
                    .accessibilityLabel("Email").onSubmit { focus = .password }
            }
            field("Password", icon: "lock") {
                SecureField("Your password", text: $password)
                    .textContentType(.password).focused($focus, equals: .password)
                    .submitLabel(.go).accessibilityLabel("Password").onSubmit(submit)
            }
            if let notice = account.notice {
                Label(notice, systemImage: "exclamationmark.circle")
                    .font(.footnote).foregroundStyle(.primary)
            }
            Button(action: submit) {
                Group {
                    if account.isBusy, opening == nil {
                        ProgressView("Signing in").tint(Color(rgb: 0x102000))
                    } else {
                        Text("Sign in").font(.subheadline.weight(.bold))
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(Color(rgb: 0x102000))
                .background(Color(rgb: 0xB4FF4D), in: .rect(cornerRadius: 15))
            }
            .buttonStyle(SlipSurgePressStyle())
            .disabled(!canSignIn)
            .opacity(canSignIn || (account.isBusy && opening == nil) ? 1 : 0.55)
            if !account.isConfigured {
                Text("Sign-in isn’t configured for this build.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func field<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.footnote.weight(.semibold))
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(.secondary).accessibilityHidden(true)
                content().disabled(account.isBusy || !account.isConfigured)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
            .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(.secondary.opacity(0.22)) }
        }
    }

    private var help: some View {
        VStack(alignment: .leading, spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack { recovery; Spacer(minLength: 8); registration }
                VStack(alignment: .leading) { recovery; registration }
            }
            HStack(spacing: 12) {
                SiteLink("Terms", path: "/terms")
                SiteLink("Privacy", path: "/privacy")
            }
            .font(.caption)
        }
    }

    private var recovery: some View {
        SiteLink("Forgot password?", path: "/auth/forgot-password")
            .font(.footnote.weight(.medium)).frame(minHeight: 44)
    }

    private var registration: some View {
        SiteLink("Create account", path: "/auth/register")
            .font(.footnote.weight(.semibold)).frame(minHeight: 44)
    }

    private func open(_ provider: SignInProvider) {
        guard opening == nil else { return }
        focus = nil
        opening = provider
        Task {
            defer { opening = nil }
            await account.signIn(provider: provider) { url in
                if #available(iOS 17.4, *) {
                    return try await browser.authenticate(using: url, callback: .customScheme(ProviderSignIn.scheme),
                        preferredBrowserSession: .ephemeral, additionalHeaderFields: [:])
                }
                return try await browser.authenticate(using: url, callbackURLScheme: ProviderSignIn.scheme,
                    preferredBrowserSession: .ephemeral)
            }
        }
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
