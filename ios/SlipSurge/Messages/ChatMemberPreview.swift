import SwiftUI

struct ChatMemberPreview: View {
    private enum Route: Hashable { case profile, message }
    private struct Response: Decodable { let profile: MemberProfileView.Page.Profile }

    let viewer: DiscoverAPI
    let member: MessagePerson
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var profile: MemberProfileView.Page.Profile?
    @State private var failed = false
    @State private var path: [Route] = []
    @State private var detent = PresentationDetent.medium

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    portrait
                    identity
                    actions
                    if let profile, profile.canView {
                        if let bio = profile.bio, !bio.isEmpty {
                            NativeSocialBody(content: bio)
                        }
                        if let record = profile.record, let rate = record.rate {
                            Label("\(record.wins)–\(record.losses) · \(rate.formatted(.percent.precision(.fractionLength(0)))) win rate",
                                systemImage: "chart.line.uptrend.xyaxis")
                                .font(.footnote.weight(.medium)).foregroundStyle(.secondary)
                        }
                    }
                    if failed {
                        Button("Retry profile") { Task { await load() } }
                            .font(.footnote.weight(.medium))
                    }
                }
                .padding(16)
            }
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .navigationTitle("Member")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .profile:
                    MemberProfileView(api: viewer, target: member.id.uuidString.lowercased())
                case .message:
                    if let userID = viewer.userID, canMessage {
                        MessageThreadView(api: .init(account: viewer.account, userID: userID),
                            destination: .init(kind: .direct, id: member.id))
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close member preview", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly)
                }
            }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .onAppear { if textSize.isAccessibilitySize { detent = .large } }
        .onChange(of: path) { _, current in
            if !current.isEmpty || textSize.isAccessibilitySize { detent = .large }
        }
        .task(id: member.id) { await load() }
    }

    private var portrait: some View {
        let colors = profile?.teams.first?.colors?.compactMap { Color(hex: $0) } ?? []
        let name = profile?.name ?? member.name
        return ZStack(alignment: .bottomLeading) {
            GeometryReader { proxy in
                LinearGradient(colors: [(colors.first ?? Brand.accent(for: scheme)).opacity(0.46),
                    colors.dropFirst().first ?? Brand.surface(for: scheme)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let banner = profile?.bannerUrl, FeedPostCard.allowedMedia(banner) {
                    ResearchArtwork(urls: [banner], fallback: nil, contentMode: .fill, pointSize: 420)
                        .frame(width: proxy.size.width, height: proxy.size.height).clipped()
                }
            }
            .frame(height: 74)
            .clipShape(.rect(cornerRadius: 16))
            NativeMemberAvatar(url: profile?.avatarUrl ?? member.avatarUrl, name: name, size: 58,
                style: profile?.avatarRingStyle ?? member.avatarRingStyle,
                color: profile?.avatarRingColor ?? member.avatarRingColor)
                .padding(5)
                .background(Brand.background(for: scheme), in: .circle)
                .padding(.leading, 12)
                .alignmentGuide(.bottom) { $0[.bottom] - 20 }
                .accessibilityIdentifier("chat-member-avatar")
        }
        .padding(.bottom, 20)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(profile?.name ?? member.name).font(.title3.weight(.bold)).accessibilityAddTraits(.isHeader)
                if profile?.verified ?? member.isVerified ?? false {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Brand.accent(for: scheme))
                        .accessibilityLabel("Verified member")
                }
                if profile?.isPrivate == true {
                    Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                        .accessibilityLabel("Private profile")
                }
            }
            Text("@\(profile?.username ?? member.username)").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { actionButtons }
            VStack(alignment: .leading, spacing: 8) { actionButtons }
        }
    }

    @ViewBuilder private var actionButtons: some View {
        Button("View profile", systemImage: "person.crop.circle") { path.append(.profile) }
            .buttonStyle(SlipSurgePrimaryButtonStyle())
        if canMessage {
            Button("Message", systemImage: "bubble") { path.append(.message) }
                .buttonStyle(.bordered).controlSize(.large)
        }
    }

    private var canMessage: Bool {
        guard let profile, viewer.userID != nil else { return false }
        return !profile.own && profile.allowMessages != false
    }

    private func load() async {
        failed = false
        do {
            let response = try await viewer.readPublic(Response.self, path: "/api/mobile/profiles",
                query: [.init(name: "user", value: member.id.uuidString.lowercased()), .init(name: "tab", value: "communities")])
            try Task.checkCancellation()
            guard response.profile.id == member.id else { throw URLError(.cannotParseResponse) }
            profile = response.profile
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}
