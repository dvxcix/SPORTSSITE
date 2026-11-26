import SwiftUI

struct MutedAndBlockedView: View {
    private enum Kind: String, CaseIterable, Identifiable {
        case muted, blocked
        var id: String { rawValue }
        var title: String { self == .muted ? "Muted accounts" : "Blocked accounts" }
        var action: String { self == .muted ? "Unmute" : "Unblock" }
        var symbol: String { self == .muted ? "speaker.slash" : "person.crop.circle.badge.xmark" }
    }

    private struct Person: Decodable, Identifiable {
        let id: UUID
        let username: String?
        let displayName: String?
        let avatarUrl: URL?
        let avatarRingColor: String?
        let isVerified: Bool?

        var name: String { displayName ?? username ?? "Unavailable account" }
    }

    private struct Page: Decodable {
        var people: [Person]
        let nextOffset: Int?
    }

    private struct Selection: Identifiable {
        let person: Person
        let kind: Kind
        var id: UUID { person.id }
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var pages: [Kind: Page] = [:]
    @State private var loading = Set<Kind>()
    @State private var errors = Set<Kind>()
    @State private var actionProblem: String?
    @State private var confirming: Selection?
    @State private var changing = false

    private static let path = "/api/mobile/account/suppressions"

    var body: some View {
        List {
            if let actionProblem {
                Label(actionProblem, systemImage: "exclamationmark.circle").foregroundStyle(.red)
            }
            ForEach(Kind.allCases) { kind in
                Section(kind.title) { rows(kind) }
                    .listRowBackground(slipPalette.surface)
            }
        }
        .navigationTitle("Muted and blocked")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task { await reload() }
        .refreshable { await reload() }
        .confirmationDialog("Unblock this account?",
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            titleVisibility: .visible, presenting: confirming) { selection in
            Button("Unblock") { Task { await restore(selection) } }
        } message: { selection in
            Text("This restores normal interactions with \(selection.person.name).")
        }
    }

    @ViewBuilder private func rows(_ kind: Kind) -> some View {
        if let page = pages[kind] {
            if page.people.isEmpty {
                Label(kind == .muted ? "No muted accounts" : "No blocked accounts", systemImage: kind.symbol)
                    .foregroundStyle(.secondary)
            }
            ForEach(page.people) { person in
                HStack(spacing: 12) {
                    if let username = person.username, kind == .muted {
                        NavigationLink {
                            MemberProfileView(api: api, target: username)
                        } label: { identity(person) }
                    } else {
                        identity(person)
                    }
                    Spacer(minLength: 0)
                    Button(kind.action) {
                        let selection = Selection(person: person, kind: kind)
                        if kind == .blocked { confirming = selection }
                        else { Task { await restore(selection) } }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(changing || !loading.isEmpty)
                    .accessibilityLabel("\(kind.action) \(person.name)")
                }
            }
            if let offset = page.nextOffset {
                Button(errors.contains(kind) ? "Retry" : "Load more") { Task { await load(kind, offset: offset) } }
                    .disabled(changing || loading.contains(kind))
            } else if errors.contains(kind) {
                Button("Reload accounts") { Task { await load(kind) } }
            }
        } else if errors.contains(kind) {
            Button("Couldn’t load accounts. Retry") { Task { await load(kind) } }
        } else {
            ProgressView("Loading accounts")
        }
    }

    private func identity(_ person: Person) -> some View {
        HStack(spacing: 10) {
            let portrait = person.avatarUrl.flatMap { FeedPostCard.allowedMedia($0) ? $0 : nil }
            ResearchArtwork(urls: portrait.map { [$0] } ?? [], fallback: "person.crop.circle.fill")
                .frame(width: 37, height: 37)
                .clipShape(.circle)
                .overlay { Circle().strokeBorder(Color(hex: person.avatarRingColor) ?? slipPalette.surface, lineWidth: 1.5) }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(verbatim: person.name).font(.headline)
                    if person.isVerified == true {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(slipPalette.accent)
                            .accessibilityLabel("Verified")
                    }
                }
                if let username = person.username {
                    Text("@\(username)").font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .foregroundStyle(slipPalette.text)
        .accessibilityElement(children: .combine)
    }

    private func reload() async {
        guard !changing else { return }
        async let muted: Void = load(.muted)
        async let blocked: Void = load(.blocked)
        _ = await (muted, blocked)
    }

    private func load(_ kind: Kind, offset: Int = 0) async {
        guard loading.insert(kind).inserted else { return }
        defer { loading.remove(kind) }
        errors.remove(kind)
        do {
            var page = try await api.readPublic(Page.self, path: Self.path,
                query: [.init(name: "kind", value: kind.rawValue), .init(name: "offset", value: String(offset))])
            guard !Task.isCancelled, api.userID == api.account.memberID else { return }
            if offset > 0, let previous = pages[kind]?.people {
                let known = Set(previous.map(\.id))
                page.people = previous + page.people.filter { !known.contains($0.id) }
            }
            pages[kind] = page
        } catch {
            if !Task.isCancelled { errors.insert(kind) }
        }
    }

    private func restore(_ selection: Selection) async {
        guard !changing, loading.isEmpty, let userID = api.userID else { return }
        changing = true
        actionProblem = nil
        defer { changing = false }
        do {
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.path,
                query: [.init(name: "kind", value: selection.kind.rawValue), .init(name: "id", value: selection.id.uuidString.lowercased())])
            request.httpMethod = "DELETE"
            let token = try await api.account.accessToken(for: userID)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try await SlipSurgeHTTP.send(request)
            guard api.account.memberID == userID else { return }
            pages[selection.kind]?.people.removeAll { $0.id == selection.id }
        } catch {
            actionProblem = "The change couldn’t be confirmed. Check the list before trying again."
        }
        await load(selection.kind)
    }
}
