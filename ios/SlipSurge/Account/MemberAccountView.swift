import SwiftUI

struct MemberAccountView: View {
    let account: AccountStore
    let userID: UUID

    @Environment(\.colorScheme) private var scheme
    @State private var details: Details?
    @State private var unavailable = false
    @State private var revision = 0

    private struct Details: Decodable {
        struct Membership: Decodable {
            let purchasedTier: String
            let status: String?
            let currentPeriodEnd: String?
            let cancelAtPeriodEnd: Bool
            let provider: String?
        }

        let id: UUID
        let username: String
        let displayName: String?
        let avatar: URL?
        let verified: Bool?
        let role: String?
        let accessTier: String
        let membership: Membership
    }

    var body: some View {
        List {
            if let details {
                accountSections(details)
            } else if unavailable {
                ContentUnavailableView {
                    Label("Account details unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } actions: {
                    Button("Retry") { revision += 1 }
                    SiteLink("Open settings on the web", path: "/settings")
                }
                .listRowBackground(Brand.surface(for: scheme))
            } else {
                ProgressView("Loading account")
                    .listRowBackground(Brand.surface(for: scheme))
            }
        }
        .navigationTitle("Profile & membership")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .tint(Brand.accent(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func accountSections(_ details: Details) -> some View {
        Section {
            HStack(spacing: 12) {
                let portrait = details.avatar.flatMap { $0.scheme == "https" ? $0 : nil }
                ResearchArtwork(urls: portrait.map { [$0] } ?? [], fallback: "person.crop.circle")
                    .frame(width: 48, height: 48)
                    .clipShape(.circle)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(details.displayName ?? details.username).font(.headline)
                        if details.verified == true {
                            Image(systemName: "checkmark.seal.fill").accessibilityLabel("Verified")
                        }
                    }
                    Text("@\(details.username)").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            if details.username.range(of: "^[A-Za-z0-9._-]{1,80}$", options: .regularExpression) != nil {
                SiteLink("View profile on the web", path: "/profile/\(details.username)")
            }
        }
        .listRowBackground(Brand.surface(for: scheme))

        Section("Membership") {
            LabeledContent("Access", value: tierLabel(details.accessTier))
            LabeledContent("Purchased plan", value: tierLabel(details.membership.purchasedTier))
            if details.membership.provider == "whop" { LabeledContent("Billed through", value: "Whop") }
            if let status = details.membership.status {
                LabeledContent("Status", value: status.replacingOccurrences(of: "_", with: " ").capitalized)
            }
            if let expiry = details.membership.currentPeriodEnd.flatMap(SidelineBoard.timestamp) {
                LabeledContent(
                    details.membership.cancelAtPeriodEnd ? "Scheduled end" : "Current period ends",
                    value: expiry.formatted(date: .abbreviated, time: .omitted)
                )
            }
        }
        .listRowBackground(Brand.surface(for: scheme))

        if details.role == "creator" || details.role == "admin" {
            Section("Workspaces on the web") {
                SiteLink("Creator Studio", path: "/creators/studio")
                if details.role == "admin" { SiteLink("Admin", path: "/admin") }
            }
            .listRowBackground(Brand.surface(for: scheme))
        }
    }

    private func tierLabel(_ rawValue: String) -> String {
        switch rawValue {
        case "free": "Free"
        case "basic": "Basic"
        case "advanced": "Advanced"
        case "ultimate": "Ultimate"
        default: "Unavailable"
        }
    }

    private func load() async {
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/mobile/account", account: account, userID: userID)
            let response = try JSONDecoder().decode(Details.self, from: data)
            guard response.id == userID else { throw URLError(.cannotParseResponse) }
            try Task.checkCancellation()
            details = response
            unavailable = false
        } catch {
            if !Task.isCancelled {
                details = nil
                unavailable = true
            }
        }
    }
}
