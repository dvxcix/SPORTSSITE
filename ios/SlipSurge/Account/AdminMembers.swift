import SwiftUI

struct AdminMember: Decodable, Identifiable {
    struct Connections: Decodable { let discord: Bool; let x: Bool; let whop: Bool }

    let id: UUID
    let username: String
    let displayName: String?
    let avatarUrl: URL?
    let email: String?
    let accountType: String
    let isVerified: Bool?
    let isActiveMember: Bool?
    let followerCount: Int?
    let createdAt: String
    let tier: String?
    let effectiveTier: String
    let adminGrantedTier: String?
    let adminGrantedTierAt: String?
    let betaAccessActive: Bool?
    let connections: Connections
    let planName: String?
    let tierStatus: String?
    let tierCurrentPeriodEnd: String?
    let tierPurchasedAt: String?
    let emailVerified: Bool?
    let bannedUntil: String?

    var name: String { displayName ?? username }
    var banned: Bool { bannedUntil.flatMap(SidelineBoard.timestamp).map { $0 > .now } ?? false }
}

struct AdminMembersAPI {
    struct Page: Decodable { let members: [AdminMember]; let hasMore: Bool }
    struct Detail: Decodable { let member: AdminMember; let authAvailable: Bool }
    struct Action: Encodable {
        let userId: UUID
        var action: String?
        var value: String?
        var boolean: Bool?
        var ban: Bool?

        func encode(to encoder: any Encoder) throws {
            enum Key: String, CodingKey { case userId, action, value, ban }
            var container = encoder.container(keyedBy: Key.self)
            try container.encode(userId.uuidString.lowercased(), forKey: .userId)
            try container.encodeIfPresent(action, forKey: .action)
            if let boolean { try container.encode(boolean, forKey: .value) }
            else { try container.encodeIfPresent(value, forKey: .value) }
            try container.encodeIfPresent(ban, forKey: .ban)
        }
    }

    struct Receipt: Decodable { let ok: Bool; let message: String? }
    let account: AccountStore
    let userID: UUID
    private static let members = "/api/mobile/admin/members"

    func list(query: String, type: String, tier: String, banned: Bool, page: Int) async throws -> Page {
        let query: [URLQueryItem] = [.init(name: "q", value: query), .init(name: "type", value: type), .init(name: "tier", value: tier),
            .init(name: "view", value: banned ? "banned" : "directory"), .init(name: "page", value: String(page))]
        return try await read(Page.self, query: query)
    }

    func detail(_ id: UUID) async throws -> Detail { try await read(Detail.self, query: [.init(name: "id", value: id.uuidString.lowercased())]) }

    func change(_ action: Action, endpoint: String) async throws -> String? {
        let api = DiscoverAPI(account: account, userID: userID)
        let receipt = try await api.write(Receipt.self, path: "/api/admin/users/" + endpoint, body: action)
        guard receipt.ok else { throw URLError(.cannotParseResponse) }
        return receipt.message
    }

    private func read<Response: Decodable>(_ type: Response.Type, query: [URLQueryItem]) async throws -> Response {
        let data = try await SlipSurgeHTTP.memberData(Self.members, query: query, account: account, userID: userID)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }
}

struct AdminMembersView: View {
    private struct Filter: Hashable { let q: String; let type: String; let tier: String; let banned: Bool }
    let api: AdminMembersAPI
    @Environment(\.colorScheme) private var scheme
    @State private var query = ""
    @State private var type = ""
    @State private var tier = ""
    @State private var banned: Bool
    @State private var result: [AdminMember]?
    @State private var hasMore = false
    @State private var page = 0
    @State private var error: (any Error)?
    @State private var loading = false

    private var filter: Filter { .init(q: query, type: type, tier: tier, banned: banned) }

    init(api: AdminMembersAPI, banned: Bool = false) {
        self.api = api
        _banned = State(initialValue: banned)
    }

    var body: some View {
        List {
            Section {
                Picker("Directory", selection: $banned) { Text("All accounts").tag(false); Text("Banned").tag(true) }
                    .pickerStyle(.segmented)
                if !banned {
                    Picker("Account type", selection: $type) {
                        Text("All account types").tag("")
                        ForEach(["user", "creator", "admin"], id: \.self) { Text($0 == "user" ? "Member" : $0.capitalized).tag($0) }
                    }
                    Picker("Membership", selection: $tier) {
                        Text("All memberships").tag("")
                        ForEach(["free", "basic", "advanced", "ultimate"], id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }
            }.listRowBackground(Brand.surface(for: scheme))
            if let result {
                ForEach(result) { member in
                    NavigationLink {
                        AdminMemberDetail(api: api, initial: member) { await load(filter, from: 0, preserve: true) }
                    } label: { memberRow(member) }
                    .listRowBackground(Brand.surface(for: scheme))
                }
                if result.isEmpty { ContentUnavailableView(banned ? "No banned accounts on this page" : "No matching members", systemImage: "person.crop.circle") }
                if hasMore {
                    Button("Load more") { Task { await load(filter, from: page + 1) } }.disabled(loading)
                }
            } else {
                ResearchToolMessage(title: "Members couldn’t load", error: error) { Task { await load(filter, from: 0) } }
            }
        }
        .searchable(text: $query, prompt: "Name, username, or email")
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: filter) {
            let key = filter
            try? await Task.sleep(for: .milliseconds(key.q.isEmpty ? 0 : 200))
            if !Task.isCancelled { await load(key, from: 0) }
        }
        .refreshable { await load(filter, from: 0) }
    }

    private func memberRow(_ member: AdminMember) -> some View {
        HStack(spacing: 10) {
            ResearchArtwork(urls: [member.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                .frame(width: 36, height: 36).clipShape(.circle)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(verbatim: member.name).font(.subheadline.weight(.semibold))
                    if member.isVerified == true { Image(systemName: "checkmark.seal.fill").font(.caption).accessibilityLabel("Verified") }
                }
                Text("@\(member.username)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(member.effectiveTier.capitalized).font(.caption.weight(.semibold))
                if member.accountType != "user" { Text(member.accountType.capitalized).font(.caption2).foregroundStyle(.secondary) }
            }
        }
    }

    private func load(_ key: Filter, from next: Int, preserve: Bool = false) async {
        if next > 0 && loading { return }
        loading = true
        if next == 0, !preserve { result = nil; hasMore = false; error = nil }
        defer { if filter == key { loading = false } }
        do {
            let value = try await api.list(query: key.q, type: key.banned ? "" : key.type, tier: key.banned ? "" : key.tier, banned: key.banned, page: next)
            guard !Task.isCancelled, filter == key else { return }
            let previous = next == 0 ? [] : result ?? []
            let seen = Set(previous.map(\.id))
            result = previous + value.members.filter { !seen.contains($0.id) }
            hasMore = value.hasMore
            page = next
        } catch { if !Task.isCancelled, filter == key { self.error = error } }
    }
}

private struct AdminMemberDetail: View {
    private struct Change: Identifiable {
        var id: String { title }
        let title: String
        let endpoint: String
        var action: String?
        var value: String?
        var boolean: Bool?
        var ban: Bool?
        var destructive = false
    }

    let api: AdminMembersAPI
    let initial: AdminMember
    let onChange: () async -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var detail: AdminMembersAPI.Detail?
    @State private var planned: Change?
    @State private var editEmail = false
    @State private var email = ""
    @State private var busy = false
    @State private var notice: String?

    private var member: AdminMember { detail?.member ?? initial }

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    ResearchArtwork(urls: [member.avatarUrl].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle")
                        .frame(width: 48, height: 48).clipShape(.circle)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: member.name).font(.title3.weight(.semibold))
                        Text("@\(member.username)").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                if let email = member.email { LabeledContent("Email", value: email).textSelection(.enabled) }
                if let confirmed = member.emailVerified { LabeledContent("Email verification", value: confirmed ? "Verified" : "Pending") }
                if let date = SidelineBoard.timestamp(member.createdAt) { LabeledContent("Joined", value: date.formatted(date: .abbreviated, time: .omitted)) }
                LabeledContent("Followers", value: (member.followerCount ?? 0).formatted())
            }
            Section("Connections") {
                provider("Discord", asset: "discord", connected: member.connections.discord)
                provider("X", asset: "x", connected: member.connections.x)
                provider("Whop", asset: "whop", connected: member.connections.whop)
            }
            Section("Membership") {
                LabeledContent("Effective tier", value: member.effectiveTier.capitalized)
                if let plan = member.planName { LabeledContent("Whop plan", value: plan) }
                if let status = member.tierStatus { LabeledContent("Subscription state", value: status.replacingOccurrences(of: ".", with: " ").capitalized) }
                if let end = member.tierCurrentPeriodEnd.flatMap(SidelineBoard.timestamp) {
                    LabeledContent("Current period ends", value: end.formatted(date: .abbreviated, time: .omitted))
                }
                Menu("Grant membership", systemImage: "person.crop.circle.badge.plus") {
                    ForEach(["basic", "advanced", "ultimate"], id: \.self) { tier in
                        Button(tier.capitalized) { planned = .init(title: "Grant \(tier.capitalized)", endpoint: "manage", action: "grantTier", value: tier) }
                    }
                }
                if let grant = member.adminGrantedTier {
                    Button("Revoke \(grant.capitalized) grant", systemImage: "minus.circle", role: .destructive) {
                        planned = .init(title: "Revoke membership grant", endpoint: "manage", action: "revokeGrantedTier", destructive: true)
                    }
                }
                support("Reconcile Whop membership", icon: "arrow.trianglehead.clockwise", action: "reconcileMembership")
            }
            Section("Account access") {
                Menu("Account type", systemImage: "checkmark.shield") {
                    ForEach(["user", "creator", "admin"], id: \.self) { role in
                        Button(role == "user" ? "Member" : role.capitalized) {
                            planned = .init(title: "Change account type", endpoint: "manage", action: "setType", value: role)
                        }.disabled(member.accountType == role)
                    }
                }
                Button(member.isVerified == true ? "Remove verification badge" : "Verify profile", systemImage: "checkmark.seal") {
                    planned = .init(title: member.isVerified == true ? "Remove verification badge" : "Verify profile", endpoint: "manage",
                        action: "verify", boolean: member.isVerified != true)
                }
                if member.id != api.userID {
                    if detail?.authAvailable == true {
                        Button(member.banned ? "Lift ban" : "Ban account", systemImage: "nosign", role: member.banned ? nil : .destructive) {
                            planned = .init(title: member.banned ? "Lift ban" : "Ban account", endpoint: "ban", ban: !member.banned, destructive: !member.banned)
                        }
                    }
                    Button("Delete member", systemImage: "trash", role: .destructive) {
                        planned = .init(title: "Delete member", endpoint: "manage", action: "delete", destructive: true)
                    }
                }
            }
            Section("Account support") {
                support("Send password reset", icon: "key", action: "sendPasswordReset")
                if member.emailVerified == false { support("Resend verification", icon: "checkmark.envelope", action: "resendVerification") }
                Button("Request an email change", systemImage: "envelope.badge") { email = ""; editEmail = true }
            }
            if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .navigationTitle("Manage member")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(busy)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("\(planned?.title ?? "Confirm change") for \(member.name)?",
            isPresented: Binding(get: { planned != nil }, set: { if !$0 { planned = nil } }), titleVisibility: .visible, presenting: planned) { change in
                Button(change.title, role: change.destructive ? .destructive : nil) { Task { await run(change) } }
            }
        .alert("Request email change", isPresented: $editEmail) {
            TextField("New email address", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Cancel", role: .cancel) {}
            Button("Send confirmation") {
                let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
                Task { await run(.init(title: "Request email change", endpoint: "support", action: "changeEmail", value: address)) }
            }
        }
    }

    private func provider(_ title: String, asset: String, connected: Bool) -> some View {
        LabeledContent {
            Text(connected ? "Connected" : "Disconnected").foregroundStyle(.secondary)
        } label: {
            HStack(spacing: 8) {
                Image("sign-in-" + asset).renderingMode(.template).resizable().scaledToFit().frame(width: 18, height: 18)
                    .foregroundStyle(asset == "discord" ? Color(rgb: 0x5865F2) : asset == "whop" ? Color(rgb: 0xFF6243) : Brand.text(for: scheme))
                    .accessibilityHidden(true)
                Text(title)
            }
        }
    }

    private func support(_ title: String, icon: String, action: String) -> some View {
        Button(title, systemImage: icon) { planned = .init(title: title, endpoint: "support", action: action) }
    }

    private func load() async {
        do { detail = try await api.detail(initial.id) }
        catch { if !Task.isCancelled { notice = "Member details could not be refreshed." } }
    }

    private func run(_ change: Change) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        notice = nil
        do {
            let message = try await api.change(.init(userId: initial.id, action: change.action, value: change.value,
                boolean: change.boolean, ban: change.ban), endpoint: change.endpoint)
            if change.action == "delete" { await onChange(); dismiss(); return }
            await load()
            notice = message ?? "\(change.title) confirmed."
            await onChange()
        } catch let status as SlipSurgeHTTP.Status {
            struct Failure: Decodable { let error: String? }
            notice = (try? JSONDecoder().decode(Failure.self, from: status.data))?.error ?? "The change couldn’t be confirmed."
        } catch { notice = "The change couldn’t be confirmed. Reload this account before retrying." }
    }
}
