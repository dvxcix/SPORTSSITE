import SwiftUI

struct AdminNflAccessView: View {
    private struct Member: Decodable, Identifiable {
        let id: UUID
        let username: String
        let displayName: String?
        let avatarUrl: URL?
        let granted: Bool?

        var person: MessagePerson {
            .init(id: id, username: username, displayName: displayName, avatarUrl: avatarUrl, isVerified: nil)
        }
    }

    private struct Grant: Decodable, Identifiable {
        let userId: UUID
        let grantedAt: String
        let member: Member?
        var id: UUID { userId }
    }

    private struct Grants: Decodable { let grants: [Grant]; let count: Int }
    private struct Matches: Decodable { let users: [Member] }
    private struct Change: Encodable { let userId: UUID; let granted: Bool }
    private struct Changed: Decodable { let granted: Bool }
    private struct Issue: Decodable { let error: String }
    private struct Decision {
        let member: Member
        let grant: Bool
        var title: String { "\(grant ? "Grant" : "Revoke") NFL access for @\(member.username)?" }
    }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @State private var grants: Grants?
    @State private var matches: Matches?
    @State private var page = 0
    @State private var pageRequest = UUID()
    @State private var matchRequest = UUID()
    @State private var pageIssue: (any Error)?
    @State private var searchIssue: (any Error)?
    @State private var search = ""
    @State private var currentSearch = ""
    @State private var decision: Decision?
    @State private var confirming = false
    @State private var busy = false
    @State private var feedback: String?

    private static let path = "/api/mobile/admin/nfl-access"
    private static let grantDate: Date.FormatStyle = {
        var format = Date.FormatStyle.dateTime.month(.abbreviated).day().year()
        format.timeZone = .gmt
        return format
    }()

    private var term: String {
        let normalized = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.hasPrefix("@") ? String(normalized.dropFirst()) : normalized
    }

    var body: some View {
        List {
            Section {
                Label {
                    Text("Add members to the NFL beta")
                } icon: {
                    ResearchArtwork(urls: LeagueArtwork.logo("nfl").map { [$0] } ?? [], fallback: "football.fill")
                        .frame(width: 29, height: 29)
                }
                if let feedback { Text(feedback).font(.footnote).foregroundStyle(.secondary) }
            }
            if term.count >= 2 { searchResults }
            approvedTesters
        }
        .navigationTitle("NFL early access")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Username or name")
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .task(id: page) { await loadPage(page) }
        .task(id: term) { await searchMembers(term, debounce: true) }
        .refreshable {
            await loadPage(page)
            await searchMembers(term, debounce: false)
        }
        .confirmationDialog(decision?.title ?? "Change NFL access?", isPresented: $confirming, titleVisibility: .visible, presenting: decision) { decision in
            Button(decision.grant ? "Grant access" : "Revoke access", role: decision.grant ? nil : .destructive) {
                Task { await submit(decision) }
            }
        }
    }

    @ViewBuilder private var searchResults: some View {
        Section("Matching members") {
            if currentSearch != term {
                ProgressView("Searching members")
            } else if let searchIssue {
                ResearchToolMessage(title: "Members couldn’t load", error: searchIssue) {
                    Task { await searchMembers(term, debounce: false) }
                }
            } else if let matches {
                if matches.users.isEmpty {
                    ContentUnavailableView.search(text: term)
                }
                ForEach(matches.users) { member in
                    HStack {
                        identity(member)
                        Spacer()
                        if member.granted == true {
                            Label("Added", systemImage: "checkmark.circle").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Button("Grant", systemImage: "person.badge.plus") { propose(member, grant: true) }
                                .buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                .accessibilityLabel("Grant NFL access to \(member.username)").disabled(busy)
                        }
                    }
                }
            }
        }
    }

    private var approvedTesters: some View {
        Section {
            if let grants {
                if grants.grants.isEmpty {
                    ContentUnavailableView("No testers added", systemImage: "person.badge.shield.checkmark",
                        description: Text("Find a member by username or name."))
                }
                ForEach(grants.grants) { row in
                    if let member = row.member {
                        HStack {
                            identity(member, granted: row.grantedAt)
                            Spacer()
                            Button("Revoke", systemImage: "person.badge.minus") { propose(member, grant: false) }
                                .buttonStyle(.borderless).labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                                .accessibilityLabel("Revoke NFL access for \(member.username)").disabled(busy)
                        }
                    }
                }
                if grants.count > 50 {
                    HStack {
                        Button("Previous", systemImage: "chevron.left") { goToPage(page - 1) }
                            .labelStyle(.iconOnly).disabled(page == 0 || busy)
                        Spacer()
                        Text("Page \(page + 1) of \((grants.count + 49) / 50)").font(.footnote).monospacedDigit()
                        Spacer()
                        Button("Next", systemImage: "chevron.right") { goToPage(page + 1) }
                            .labelStyle(.iconOnly).disabled((page + 1) * 50 >= grants.count || busy)
                    }
                    .buttonStyle(.borderless)
                }
            } else {
                ResearchToolMessage(title: "Testers couldn’t load", error: pageIssue) { Task { await loadPage(page) } }
            }
        } header: {
            Text(grants.map { "Approved testers · \($0.count.formatted())" } ?? "Approved testers")
        }
    }

    private func identity(_ member: Member, granted: String? = nil) -> some View {
        HStack(spacing: 9) {
            MessageAvatar(person: member.person, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(member.person.name).font(.subheadline.weight(.semibold))
                Text("@\(member.username)").font(.caption).foregroundStyle(.secondary)
                if let date = granted.flatMap(SidelineBoard.timestamp) {
                    Text(date, format: Self.grantDate)
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func loadPage(_ requestedPage: Int) async {
        guard !Task.isCancelled else { return }
        let requestID = UUID()
        pageRequest = requestID
        pageIssue = nil
        do {
            let value = try await api.memberRead(Grants.self, path: Self.path,
                query: [.init(name: "page", value: String(requestedPage))], keyDecodingStrategy: .convertFromSnakeCase)
            try Task.checkCancellation()
            guard requestedPage == page, pageRequest == requestID else { return }
            grants = value
        } catch is CancellationError {
            return
        } catch {
            guard requestedPage == page, pageRequest == requestID else { return }
            grants = nil
            pageIssue = error
        }
    }

    private func searchMembers(_ requested: String, debounce: Bool) async {
        guard !Task.isCancelled else { return }
        let requestID = UUID()
        matchRequest = requestID
        guard requested.count >= 2 else {
            currentSearch = ""
            matches = nil
            searchIssue = nil
            return
        }
        do {
            if debounce { try await Task.sleep(for: .milliseconds(250)) }
            let value = try await api.memberRead(Matches.self, path: Self.path,
                query: [.init(name: "q", value: requested)], keyDecodingStrategy: .convertFromSnakeCase)
            try Task.checkCancellation()
            guard requested == term, matchRequest == requestID else { return }
            matches = value
            searchIssue = nil
            currentSearch = requested
        } catch is CancellationError {
            return
        } catch {
            guard requested == term, matchRequest == requestID else { return }
            matches = nil
            searchIssue = error
            currentSearch = requested
        }
    }

    private func goToPage(_ index: Int) {
        grants = nil
        pageIssue = nil
        page = index
    }

    private func propose(_ member: Member, grant: Bool) {
        decision = .init(member: member, grant: grant)
        confirming = true
    }

    private func submit(_ decision: Decision) async {
        guard !busy else { return }
        busy = true
        feedback = nil
        defer { busy = false }
        do {
            let changed = try await api.write(Changed.self, path: Self.path,
                body: Change(userId: decision.member.id, granted: decision.grant))
            feedback = changed.granted ? "NFL access granted to @\(decision.member.username)." : "NFL access revoked for @\(decision.member.username)."
            if !changed.granted, page > 0, grants?.grants.count == 1 { goToPage(page - 1) } else { await loadPage(page) }
            await searchMembers(term, debounce: false)
        } catch let error as SlipSurgeHTTP.Status {
            feedback = (try? JSONDecoder().decode(Issue.self, from: error.data))?.error ?? "The access change couldn’t be confirmed."
        } catch {
            feedback = "The access change couldn’t be confirmed."
        }
    }
}
