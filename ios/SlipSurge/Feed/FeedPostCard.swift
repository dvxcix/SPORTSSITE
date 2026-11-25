import AVKit
import SwiftUI

struct FeedPostCard: View {
    let post: FeedPost
    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let reposter = post.repostedBy {
                Label("\(reposter) reposted", systemImage: "arrow.2.squarepath")
                    .font(.caption).foregroundStyle(.secondary)
            }
            author
            if post.spoiler && !revealed {
                Button("Reveal spoiler", systemImage: "eye.slash") { revealed = true }
            } else {
                postBody
            }
        }
        .padding(.vertical, 6)
        .buttonStyle(.borderless)
    }

    private var author: some View {
        HStack(spacing: 10) {
            let portrait = post.author?.avatar.flatMap { Self.allowedMedia($0) ? $0 : nil }
            ResearchArtwork(urls: portrait.map { [$0] } ?? [], fallback: "person.crop.circle")
                .frame(width: 36, height: 36)
                .clipShape(.circle)
            VStack(alignment: .leading, spacing: 2) {
                if let author = post.author {
                    HStack(spacing: 5) {
                        Text(author.displayName ?? author.username).font(.headline)
                        if author.verified == true {
                            Image(systemName: "checkmark.seal.fill")
                                .accessibilityLabel("Verified")
                        }
                    }
                    Text("@\(author.username)").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("SlipSurge member").font(.headline)
                }
                if let posted = SidelineBoard.timestamp(post.createdAt) {
                    Text(posted.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private var postBody: some View {
        if !post.content.isEmpty { Text(verbatim: post.content) }
        if let pick = post.pick {
            if pick.legs.isEmpty {
                pickRow(label: pick.label, line: pick.line, price: pick.odds, result: pick.result)
            } else {
                ForEach(Array(pick.legs.enumerated()), id: \.offset) { _, leg in
                    pickRow(label: leg.label, line: leg.line, price: leg.odds, result: leg.result)
                }
            }
        }
        if let poll = post.poll {
            Label("Poll", systemImage: "chart.bar")
            ForEach(Array(poll.options.enumerated()), id: \.offset) { _, choice in
                Text(verbatim: choice)
            }
        }
        ForEach(Array(post.media.enumerated()), id: \.offset) { _, url in
            if Self.allowedMedia(url) {
                FeedMedia(url: url)
            }
        }
        HStack(spacing: 16) {
            count("Reactions", icon: "heart", value: post.reactions)
            count("Comments", icon: "bubble", value: post.comments)
            count("Reposts", icon: "arrow.2.squarepath", value: post.reposts)
        }
        .font(.caption).foregroundStyle(.secondary)
        SiteLink("View post on the web", path: "/posts/\(post.postID.uuidString.lowercased())")
        if post.shareable,
           let url = URL(string: "https://\(SlipSurgeHTTP.site)/posts/\(post.postID.uuidString.lowercased())") {
            ShareLink(item: url) { Label("Share post", systemImage: "square.and.arrow.up") }
        }
    }

    private func pickRow(label: String?, line: String?, price: String?, result: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label ?? "Pick").font(.subheadline.bold())
            if let line { Text(verbatim: line).font(.subheadline) }
            if let price { Text(verbatim: price).monospacedDigit() }
            if let result { Text(result.capitalized).font(.caption) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(.quaternary, in: .rect(cornerRadius: 8))
    }

    private func count(_ label: String, icon: String, value: Int) -> some View {
        Label(value.formatted(), systemImage: icon)
            .accessibilityLabel("\(value) \(label.lowercased())")
    }

    private static func allowedMedia(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, let host = url.host else { return false }
        return host == SlipSurgeHTTP.site || host == "hkldweedwnxartkfhror.supabase.co" ||
            host == "media.tenor.com" || host == "a.espncdn.com" ||
            host == "cdn.discordapp.com" || host == "pbs.twimg.com" || host.hasSuffix(".public.blob.vercel-storage.com")
    }
}

private struct FeedMedia: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        if ["mp4", "mov", "m4v"].contains(url.pathExtension.lowercased()) {
            if let player {
                VideoPlayer(player: player).aspectRatio(16 / 9, contentMode: .fit)
                    .onDisappear { player.pause() }
            } else {
                Button("Load video", systemImage: "play.rectangle") { player = AVPlayer(url: url) }
            }
        } else {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFit().frame(maxHeight: 360)
                        .clipShape(.rect(cornerRadius: 8))
                        .accessibilityLabel("Post image")
                case .failure:
                    Label("Media unavailable", systemImage: "photo")
                default:
                    ProgressView().accessibilityLabel("Loading post image")
                }
            }
        }
    }
}
