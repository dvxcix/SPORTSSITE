import SwiftUI

struct AdminRecentSignInsView: View {
    private struct Directory: Decodable {
        struct SignIn: Decodable, Identifiable {
            let id: UUID
            let name: String
            let username: String?
            let avatarUrl: URL?
            let lastSignIn: String
            let recent: Bool

            var person: MessagePerson {
                .init(id: id, username: username ?? name, displayName: name, avatarUrl: avatarUrl, isVerified: nil)
            }
        }
        let signIns: [SignIn]
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var entries: [Directory.SignIn]?
    @State private var issue: (any Error)?
    @State private var revision = 0

    var body: some View {
        List {
            if let entries, entries.isEmpty {
                ContentUnavailableView("No sign-in data", systemImage: "person.crop.circle.badge.clock")
            } else if let entries {
                Section {
                    ForEach(entries) { entry in
                        row(entry)
                    }
                } header: {
                    Text("Last sign-ins")
                } footer: {
                    Text("Recent indicates a sign-in within the last 15 minutes.")
                }
            } else {
                ResearchToolMessage(title: "Recent sign-ins couldn’t load", error: issue) { revision += 1 }
            }
        }
        .navigationTitle("Recent sign-ins")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func row(_ entry: Directory.SignIn) -> some View {
        HStack(spacing: 10) {
            MessageAvatar(person: entry.person, size: 38)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.name).font(.subheadline.weight(.semibold))
                if let date = SidelineBoard.timestamp(entry.lastSignIn) {
                    Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                }
                if entry.recent {
                    Label("Recent", systemImage: "clock.badge.checkmark").font(.caption.weight(.semibold))
                        .foregroundStyle(slipPalette.accent)
                }
            }
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            let directory = try await api.memberRead(Directory.self, path: "/api/mobile/admin/members", query: [.init(name: "view", value: "recent")])
            try Task.checkCancellation()
            entries = directory.signIns
            issue = nil
        } catch is CancellationError {
            return
        } catch {
            entries = nil
            issue = error
        }
    }
}
