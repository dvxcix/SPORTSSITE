import SwiftUI

struct CreatorMembersView: View {
    let account: AccountStore
    let userID: UUID

    private struct Member: Decodable, Identifiable {
        struct Profile: Decodable { let username: String; let displayName: String?; let avatarUrl: URL? }
        struct Product: Decodable { let title: String }
        let id: UUID
        let status: String
        let currentPeriodEnd: String?
        let product: Product?
        let member: Profile?
    }

    @Environment(\.slipPalette) private var slipPalette
    @State private var members: [Member]?
    @State private var filter = ""
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        List {
            if let members {
                let visible = members.filter { record in
                    filter.isEmpty || [record.member?.displayName, record.member?.username, record.product?.title, record.status]
                        .compactMap { $0 }.contains { $0.localizedStandardContains(filter) }
                }
                if visible.isEmpty { ContentUnavailableView("No members found", systemImage: "person.2") }
                ForEach(visible, content: row).listRowBackground(slipPalette.surface)
            } else {
                ResearchToolMessage(title: "Members couldn’t load", error: error) { retry += 1 }
                    .listRowBackground(slipPalette.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $filter, prompt: "Name, offer or status")
        .task(id: retry) { await load() }
        .refreshable { await load() }
    }

    private func row(_ member: Member) -> some View {
        HStack(spacing: 12) {
            ResearchArtwork(urls: member.member?.avatarUrl.map { [$0] } ?? [], fallback: "person.crop.circle")
                .frame(width: 38, height: 38).clipShape(.circle)
            VStack(alignment: .leading, spacing: 4) {
                Text(member.member?.displayName ?? member.member?.username ?? "Member").font(.subheadline.weight(.semibold))
                if let title = member.product?.title { Text(verbatim: title).font(.footnote).foregroundStyle(.secondary) }
                if let expiration = member.currentPeriodEnd.flatMap(SidelineBoard.timestamp) {
                    Text(expiration.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(member.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption.weight(.semibold))
                .foregroundStyle(["active", "trialing"].contains(member.status) ? slipPalette.accent : .secondary)
        }.accessibilityElement(children: .combine)
    }

    private func load() async {
        struct Result: Decodable { let members: [Member] }
        do {
            let data = try await SlipSurgeHTTP.memberData("/api/creator/members", account: account, userID: userID)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            members = try decoder.decode(Result.self, from: data).members
            error = nil
        } catch { if !Task.isCancelled { self.error = error } }
    }
}
