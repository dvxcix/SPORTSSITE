import AuthenticationServices
import SwiftUI

struct AccountConnectionsView: View {
    let api: AccountConnectionsAPI
    var focusedProvider: SignInProvider? = nil

    @Environment(\.webAuthenticationSession) private var browser
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var connections: [AccountConnection]?
    @State private var working: SignInProvider?
    @State private var disconnecting: AccountConnection?
    @State private var feedback: String?
    @State private var failure: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 13) {
                if let connections {
                    ForEach(connections.filter { focusedProvider == nil || $0.provider == focusedProvider }) { card($0) }
                } else if failure == nil {
                    ProgressView("Loading connections").padding(24)
                } else {
                    Button("Retry", systemImage: "arrow.clockwise") { Task { try? await load() } }.buttonStyle(.bordered)
                }
                if let feedback {
                    Label(feedback, systemImage: "checkmark.circle").font(.subheadline).foregroundStyle(Brand.accent(for: scheme))
                }
                if let failure {
                    Label(failure, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red)
                }
            }
            .padding(16).frame(maxWidth: 520).frame(maxWidth: .infinity)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(focusedProvider?.title ?? "Connected accounts")
        .navigationBarTitleDisplayMode(.inline)
        .task { try? await load() }
        .refreshable { try? await load() }
        .sensoryFeedback(.success, trigger: feedback) { _, next in next != nil }
        .confirmationDialog("Disconnect account?", isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } }),
            titleVisibility: .visible, presenting: disconnecting) { connection in
            Button("Disconnect \(connection.provider.title)", role: .destructive) { Task { await disconnect(connection.provider) } }
        }
    }

    private func card(_ connection: AccountConnection) -> some View {
        let provider = connection.provider
        return ResearchToolCard(color: providerTint(provider)) {
            HStack(spacing: 11) {
                Image("sign-in-\(provider.rawValue)").renderingMode(.template).resizable().scaledToFit()
                    .frame(width: 22, height: 22).padding(10)
                    .foregroundStyle(provider == .whop ? Color(rgb: 0x180A05) : .white)
                    .background(provider == .x ? .black : providerTint(provider), in: .rect(cornerRadius: 12))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(provider.title).font(.headline)
                    if let identity = connection.identity {
                        Text(verbatim: identity.handle).font(.footnote).foregroundStyle(.secondary)
                    } else if connection.connected {
                        Text("Connected").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if connection.connected {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Brand.accent(for: scheme)).accessibilityLabel("Connected")
                }
            }
        } content: {
            if working == provider {
                ProgressView(connection.connected ? "Updating connection" : "Connecting").font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if connection.connected {
                if connection.canDisconnect {
                    Button("Disconnect", systemImage: "link.badge.minus") { disconnecting = connection }
                        .buttonStyle(.bordered).disabled(working != nil)
                } else {
                    Text("Add another sign-in method to disconnect this account.").font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                connectButton(provider).disabled(working != nil)
            }
        }
    }

    @ViewBuilder
    private func connectButton(_ provider: SignInProvider) -> some View {
        let button = Button {
            Task { await connect(provider) }
        } label: {
            Label("Connect \(provider.title)", systemImage: "arrow.up.right")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(provider == .whop ? Color(rgb: 0x180A05) : Brand.text(for: scheme))
                .contentShape(.rect(cornerRadius: 13))
        }.buttonStyle(SlipSurgePressStyle())
        if provider == .whop {
            button.background(providerTint(provider), in: .rect(cornerRadius: 13))
        } else if #available(iOS 26, *) {
            button.glassEffect(.regular.tint(providerTint(provider).opacity(0.15)).interactive(), in: .rect(cornerRadius: 13))
        } else {
            button.background(Brand.surface(for: scheme), in: .rect(cornerRadius: 13))
        }
    }

    private func providerTint(_ provider: SignInProvider) -> Color {
        switch provider {
        case .whop: Color(rgb: 0xFA4616)
        case .discord: Color(rgb: 0x5865F2)
        case .x: scheme == .dark ? .white.opacity(0.36) : .black.opacity(0.62)
        }
    }

    private func load() async throws {
        do {
            let values = try await api.list()
            try Task.checkCancellation()
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.24)) { connections = values }
            failure = nil
        } catch {
            if !Task.isCancelled { failure = "Connected accounts couldn’t load." }
            throw error
        }
    }

    private func connect(_ provider: SignInProvider) async {
        guard working == nil else { return }
        working = provider
        feedback = nil
        failure = nil
        defer { working = nil }
        do {
            let attempt = try ConnectionAttempt()
            let url = try await api.start(provider, attempt: attempt)
            let callback: URL
            if #available(iOS 17.4, *) {
                callback = try await browser.authenticate(using: url, callback: .customScheme(ProviderSignIn.scheme), preferredBrowserSession: .ephemeral, additionalHeaderFields: [:])
            } else {
                callback = try await browser.authenticate(using: url, callbackURLScheme: ProviderSignIn.scheme, preferredBrowserSession: .ephemeral)
            }
            try await api.finish(provider, callback: callback, attempt: attempt)
            try await load()
            if connections?.contains(where: { $0.provider == provider && $0.connected }) == true {
                feedback = "\(provider.title) connected."
            }
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            failure = "That account already belongs to another SlipSurge profile."
        } catch {
            try? await load()
            failure = "The \(provider.title) connection couldn’t be confirmed."
        }
    }

    private func disconnect(_ provider: SignInProvider) async {
        guard working == nil else { return }
        working = provider
        feedback = nil
        failure = nil
        defer { working = nil }
        do {
            try await api.disconnect(provider)
            try await load()
            feedback = "\(provider.title) disconnected."
        } catch {
            try? await load()
            failure = "The \(provider.title) disconnection couldn’t be confirmed."
        }
    }
}
