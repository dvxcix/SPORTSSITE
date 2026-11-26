import SwiftUI

struct CreatorAccessCompletionView: View {
    enum Outcome: String { case failed, canceled }

    let api: CreatorMembershipAPI
    let offerID: UUID
    let outcome: Outcome?
    @Environment(\.openURL) private var openURL
    @Environment(\.slipPalette) private var slipPalette
    @State private var access: CreatorMembershipAPI.Access?
    @State private var problem = false
    @State private var running = false
    @State private var managing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ResearchToolCard(color: slipPalette.accent) {
                    ResearchSectionTitle(title: heading)
                } content: {
                    if running, access?.active != true { ProgressView("Checking Whop access") }
                    Text(description).font(.subheadline).foregroundStyle(.secondary)
                    if access?.active == true, let group = access?.group {
                        NavigationLink {
                            CommunityDetailView(api: api.client, group: group, initialMember: true)
                        } label: { Label("Open \(group.name)", systemImage: "person.2") }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Button("Refresh access", systemImage: "arrow.clockwise") { Task { await check(poll: false) } }
                            .buttonStyle(.borderedProminent).disabled(running)
                    }
                    if outcome != nil, access?.active != true {
                        NavigationLink {
                            LinkedCreatorOfferView(api: .init(client: api.client), id: offerID)
                        } label: { Label("Return to membership", systemImage: "arrow.right") }.buttonStyle(.bordered)
                    }
                    if let access, access.status != "pending" {
                        Button("Manage billing", systemImage: "creditcard") { Task { await billing() } }
                            .buttonStyle(.bordered).disabled(managing)
                    }
                    NavigationLink {
                        DiscoverView(api: api.client)
                    } label: { Label("My communities", systemImage: "person.2") }.buttonStyle(.bordered)
                    if problem { Text("Access couldn’t be confirmed. Try again.").font(.caption).foregroundStyle(.secondary) }
                }
            }.padding(16)
        }
        .navigationTitle("Member access")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .task(id: offerID) { await check(poll: outcome == nil) }
    }

    private var heading: String {
        if access?.active == true { return "Your access is ready" }
        if let outcome { return outcome == .canceled ? "Checkout canceled" : "Checkout wasn’t completed" }
        if access?.status == "revoked" { return "Community access paused" }
        if let access, access.status != "pending" { return "Access ended" }
        return "Checking your membership"
    }

    private var description: String {
        if access?.active == true { return "Your membership is linked to your SlipSurge account." }
        if outcome != nil { return "Return to the offer to try again, or refresh if you completed payment elsewhere." }
        if access?.status == "revoked" { return "Contact SlipSurge support about community access. You can still manage billing through Whop." }
        if let access, access.status != "pending" { return "Your membership is no longer active. You can manage billing through Whop." }
        return "Access opens after Whop confirms your membership. This can take a moment."
    }

    private func check(poll: Bool) async {
        guard !running else { return }
        running = true
        problem = false
        defer { running = false }
        do {
            let attempts = poll ? 10 : 1
            for index in 0..<attempts {
                let result = try await api.access(offerID)
                try Task.checkCancellation()
                access = result
                guard !result.active, result.status == "pending", index + 1 < attempts else { return }
                try await Task.sleep(for: .seconds(4))
            }
        } catch {
            if !Task.isCancelled { problem = true }
        }
    }

    private func billing() async {
        guard !managing else { return }
        managing = true
        problem = false
        defer { managing = false }
        do { openURL(try await api.manage(offerID)) }
        catch { if !Task.isCancelled { problem = true } }
    }
}

struct LinkedCreatorOfferView: View {
    let api: CreatorPublicStoreAPI
    let id: UUID
    @State private var value: CreatorPublicStoreAPI.Offer?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        Group {
            if let value {
                CreatorMembershipView(account: api.client.account, offer: value.offer, creatorID: value.creator?.id,
                    artwork: value.creator?.avatarUrl, community: value.community, creatorUsername: value.creator?.username)
            } else if (error as? SlipSurgeHTTP.Status)?.code == 404 {
                ContentUnavailableView("Membership unavailable", systemImage: "person.crop.circle.badge.xmark")
            } else {
                ResearchToolMessage(title: "Membership couldn’t load", error: error) { retry += 1 }
            }
        }
        .task(id: retry) {
            error = nil
            do {
                let result = try await api.offer(id)
                if !Task.isCancelled { value = result }
            } catch {
                if !Task.isCancelled { self.error = error }
            }
        }
    }
}
