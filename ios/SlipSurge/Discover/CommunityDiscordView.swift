import AuthenticationServices
import SwiftUI

struct CommunityDiscordView: View {
    let api: CommunityDiscordAPI

    private var browser = CommunityDiscordBrowser()
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scene
    @Environment(\.colorScheme) private var scheme
    @State private var membership: CommunityDiscordAPI.Membership?
    @State private var receipt: CommunityDiscordAPI.Receipt?
    @State private var loading = false
    @State private var pending = false
    @State private var error: String?
    @State private var authorizationRequired = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let membership {
                    ResearchToolCard(color: discordColor) {
                        CommunityDiscordIdentity(title: receipt?.guildName ?? membership.guildName,
                            detail: receipt != nil || membership.ready ? "Member roles ready" : "Discord member access")
                    } content: {
                        ForEach(receipt?.roles ?? membership.roles, id: \.self) { role in
                            Label(role, systemImage: receipt != nil || membership.ready ? "checkmark.seal.fill" : "checkmark.shield")
                                .font(.subheadline.weight(.medium))
                        }
                        Button {
                            Task { await claim(authorizing: !membership.connected || authorizationRequired) }
                        } label: {
                            if pending {
                                ProgressView().tint(.white)
                            } else {
                                Label(claimTitle(membership), systemImage: membership.ready ? "arrow.clockwise" : "person.badge.key")
                            }
                        }
                        .buttonStyle(DiscordCommunityButtonStyle())
                        .disabled(pending)
                        if let url = CommunityDiscordAPI.invite(membership.inviteUrl) {
                            Button("Open Discord server", systemImage: "arrow.up.right") { openURL(url) }
                                .buttonStyle(.bordered)
                        }
                    }
                } else if loading || error == nil {
                    ProgressView("Checking Discord access").frame(maxWidth: .infinity).padding()
                } else {
                    Button("Retry", systemImage: "arrow.clockwise") { Task { await load() } }
                        .buttonStyle(.bordered)
                }
                if let error { Label(error, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.secondary) }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Discord access")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: scene) { _, next in
            if next == .active, !pending { Task { await load() } }
        }
        .sensoryFeedback(.success, trigger: receipt != nil)
    }

    private func claimTitle(_ membership: CommunityDiscordAPI.Membership) -> String {
        if !membership.connected { return "Connect Discord" }
        if authorizationRequired { return "Authorize Discord" }
        return membership.ready || receipt != nil ? "Check access" : "Join and claim member roles"
    }

    private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let value = try await api.membership()
            guard !Task.isCancelled else { return }
            membership = value
            error = nil
            if !value.ready { receipt = nil }
        } catch {
            guard !Task.isCancelled else { return }
            membership = nil
            receipt = nil
            self.error = (error as? CommunityDiscordAPI.Problem)?.error ?? "Discord access couldn’t load."
        }
    }

    private func claim(authorizing: Bool) async {
        guard !pending else { return }
        pending = true
        error = nil
        defer { pending = false }
        do {
            let token = authorizing ? try await api.authorize(.membership, authenticate: browser.authenticate) : nil
            receipt = try await api.claim(providerToken: token)
            authorizationRequired = false
            await load()
        } catch let cause as ASWebAuthenticationSessionError where cause.code == .canceledLogin {
            return
        } catch {
            let problem = error as? CommunityDiscordAPI.Problem
            authorizationRequired = problem?.code == "discord_reconnect"
            self.error = problem?.error ?? "Discord access couldn’t be verified."
        }
    }
}

struct CommunityDiscordBrowser: DynamicProperty {
    @Environment(\.webAuthenticationSession) private var browser

    func authenticate(_ url: URL) async throws -> URL {
        if #available(iOS 17.4, *) {
            return try await browser.authenticate(using: url, callback: .customScheme(ProviderSignIn.scheme),
                preferredBrowserSession: .ephemeral, additionalHeaderFields: [:])
        }
        return try await browser.authenticate(using: url, callbackURLScheme: ProviderSignIn.scheme, preferredBrowserSession: .ephemeral)
    }
}

struct CommunityDiscordIdentity: View {
    let title: String
    let detail: String?

    var body: some View {
        HStack(spacing: 10) {
            Image("sign-in-discord")
                .renderingMode(.template).resizable().scaledToFit().frame(width: 22, height: 22)
                .foregroundStyle(.white).padding(10)
                .background(discordColor, in: .rect(cornerRadius: 12))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                if let detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}

struct DiscordCommunityButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(discordColor.opacity(enabled ? 1 : 0.55), in: .rect(cornerRadius: 13))
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .snappy(duration: 0.18), value: configuration.isPressed)
    }
}

var discordColor: Color { Color(rgb: 0x4C57D9) }
