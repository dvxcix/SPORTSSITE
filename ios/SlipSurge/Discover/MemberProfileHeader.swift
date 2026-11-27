import SwiftUI

struct MemberProfileHeader: View {
    let profile: MemberProfileView.Page.Profile
    let api: DiscoverAPI
    let changing: Bool
    let details: () -> Void
    let follow: () -> Void
    @Environment(\.slipPalette) private var slipPalette

    private var accent: Color { slipPalette.accent }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            banner
            HStack(alignment: .center, spacing: 7) {
                Spacer(minLength: 92)
                if let viewer = api.userID {
                    if profile.own {
                        NavigationLink("Edit profile") { NativeSettings(account: api.account, userID: viewer, section: .profile) }
                            .buttonStyle(.bordered).controlSize(.large)
                    } else {
                        if profile.allowMessages != false {
                            NavigationLink {
                                MessageThreadView(api: .init(account: api.account, userID: viewer), destination: .init(kind: .direct, id: profile.id))
                            } label: { Label("Message", systemImage: "bubble.left").labelStyle(.iconOnly) }
                                .buttonStyle(.bordered).controlSize(.large)
                        }
                        Button(action: follow) {
                            HStack(spacing: 6) {
                                if changing { ProgressView().controlSize(.small).accessibilityHidden(true) }
                                Text(profile.following ? "Following" : "Follow")
                            }
                        }
                        .buttonStyle(SlipSurgePrimaryButtonStyle())
                        .disabled(changing)
                        .accessibilityValue(changing ? "Updating" : "")
                    }
                }
            }
            .frame(minHeight: api.userID == nil ? 24 : 44)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(profile.name).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
                    if profile.verified == true {
                        Image(systemName: "checkmark.seal.fill").font(.subheadline).foregroundStyle(accent)
                            .accessibilityLabel("Verified member")
                    }
                    if profile.isPrivate == true {
                        Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary).accessibilityLabel("Private profile")
                    }
                }
                Text("@\(profile.username)").font(.subheadline).foregroundStyle(.secondary)
            }
            if let bio = profile.bio, !bio.isEmpty { NativeSocialBody(content: bio) }
            if let location = profile.location, !location.isEmpty {
                Label(location, systemImage: "mappin").font(.footnote).foregroundStyle(.secondary)
            }
            profileSummary
            profileLinks
        }
        .padding(.bottom, 4)
    }

    private var banner: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                if let url = profile.bannerUrl, FeedPostCard.allowedMedia(url) {
                    ResearchArtwork(urls: [url], fallback: nil, contentMode: .fill, pointSize: 450)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .clipShape(.rect(cornerRadius: 14))
                        .mask {
                            LinearGradient(stops: [.init(color: .black, location: 0.68), .init(color: .clear, location: 1)],
                                           startPoint: .top, endPoint: .bottom)
                        }
                        .accessibilityHidden(true)
                } else if let logo = profile.teams.first?.logo {
                    ResearchArtwork(urls: [logo], fallback: nil, pointSize: 91).frame(width: 91, height: 91)
                        .opacity(0.68).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                        .padding(.trailing, 12)
                        .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .bottomLeading) {
                NativeMemberAvatar(url: profile.avatarUrl, name: profile.name, size: 67,
                    style: profile.avatarRingStyle, color: profile.avatarRingColor)
                    .padding(6).background(slipPalette.background, in: .circle)
                    .padding(.leading, 12).offset(y: 32)
            }
        }
        .frame(height: profile.bannerUrl.map(FeedPostCard.allowedMedia) == true ? 128 : 88)
    }

    private var profileSummary: some View {
        let counts = [
            ((profile.followerCount ?? 0).formatted(.number.notation(.compactName)), "Followers"),
            ((profile.followingCount ?? 0).formatted(.number.notation(.compactName)), "Following")
        ]
        let picks = if let record = profile.record, let rate = record.rate {
            [("\(record.wins)–\(record.losses)", "Pick record"),
             (rate.formatted(.percent.precision(.fractionLength(0))), "Win rate")]
        } else {
            [(String, String)]()
        }
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 13) {
                metrics(counts)
                if !picks.isEmpty {
                    Rectangle().fill(.secondary.opacity(0.24)).frame(width: 1, height: 13)
                    metrics(picks)
                }
            }
            VStack(alignment: .leading, spacing: 7) {
                flexibleMetrics(counts)
                if !picks.isEmpty { flexibleMetrics(picks) }
            }
        }
    }

    private func flexibleMetrics(_ items: [(String, String)]) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { metrics(items) }
            VStack(alignment: .leading, spacing: 6) { metrics(items) }
        }
    }

    private func metrics(_ items: [(String, String)]) -> some View {
        ForEach(items.indices, id: \.self) { index in
            metric(items[index].0, items[index].1)
        }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        HStack(spacing: 4) {
            Text(value).bold().monospacedDigit().foregroundStyle(slipPalette.text)
            Text(label).foregroundStyle(.secondary)
        }
        .font(.footnote).fixedSize(horizontal: true, vertical: false).accessibilityElement(children: .combine)
    }

    private var profileLinks: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                if profile.creator != nil {
                    NavigationLink {
                        CreatorDetailView(api: api, username: profile.username)
                    } label: {
                        Label("Storefront", systemImage: "storefront").font(.footnote.weight(.semibold))
                            .padding(.horizontal, 10).frame(minHeight: 44)
                    }.buttonStyle(SlipSurgePressStyle()).foregroundStyle(accent)
                }
                ForEach(MemberProfileLink.links(profile).prefix(4)) { link in
                    if let href = link.href {
                        Link(destination: href) { linkIcon(link) }
                    } else {
                        Button(action: details) { linkIcon(link) }.buttonStyle(SlipSurgePressStyle())
                    }
                }
                Button("Profile details", systemImage: "info.circle", action: details).labelStyle(.iconOnly)
                    .font(.system(size: 17, weight: .medium)).frame(minWidth: 44, minHeight: 44)
                    .buttonStyle(SlipSurgePressStyle())
            }
        }.scrollIndicators(.hidden).foregroundStyle(slipPalette.text)
    }

    private func linkIcon(_ link: MemberProfileLink) -> some View {
        link.artwork.frame(width: 19, height: 19)
            .padding(8).background(slipPalette.surface, in: .circle)
            .frame(width: 44, height: 44).contentShape(.rect)
            .accessibilityLabel("\(link.name), \(link.handle)\(link.verified ? ", verified" : "")")
    }
}

struct MemberProfileLink: Identifiable {
    let id: String
    let name: String
    let handle: String
    let icon: URL?
    let asset: String?
    let href: URL?
    let verified: Bool

    static func links(_ profile: MemberProfileView.Page.Profile) -> [Self] {
        if let links = profile.socialLinks {
            return links.map { .init(id: $0.id.uuidString, name: $0.name, handle: $0.handle, icon: $0.iconUrl,
                asset: nil, href: safeLink($0.href), verified: $0.verified) }
        }
        return profile.verifiedSocials.keys.sorted().compactMap { provider in
            guard let identity = profile.verifiedSocials[provider] else { return nil }
            return .init(id: provider, name: provider.capitalized, handle: identity.handle, icon: nil,
                asset: "sign-in-\(provider)", href: safeLink(identity.profileUrl), verified: true)
        }
    }

    static func safeLink(_ url: URL?) -> URL? {
        guard let url, url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else { return nil }
        return url
    }

    @MainActor @ViewBuilder var artwork: some View {
        let provider = name.lowercased()
        if let asset = asset ?? (["discord", "whop", "x"].contains(provider) ? "sign-in-\(provider)" : nil) {
            Image(asset).renderingMode(.template).resizable().scaledToFit()
                .foregroundStyle(provider == "discord" ? Color(rgb: 0x5865F2) : provider == "whop" ? Color(rgb: 0xFA4616) : .primary)
        } else {
            ResearchArtwork(urls: icon.map { [$0] } ?? [], fallback: "at")
        }
    }
}
