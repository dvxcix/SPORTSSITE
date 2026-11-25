import AVKit
import SwiftUI

struct FeedPostCard: View {
    let post: FeedPost
    var operation: ((FeedAPI.Mutation) -> Void)?
    var showDiscussionButton = true
    var discussion: (() -> Void)?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false
    @State private var showingEmoji = false
    @State private var customEmoji = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let reposter = post.repostedBy {
                Label("\(reposter) reposted", systemImage: "arrow.2.squarepath")
                    .font(.caption).foregroundStyle(.secondary)
            }
            author
            if post.spoiler && !revealed {
                Button("Reveal spoiler", systemImage: "eye.slash") {
                    withAnimation(reduceMotion ? nil : .smooth(duration: 0.24)) { revealed = true }
                }
            } else {
                postBody
                    .transition(.opacity)
            }
        }
        .padding(.vertical, 6)
        .buttonStyle(.borderless)
        .sheet(isPresented: $showingEmoji) {
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 48), spacing: 10)]) {
                        ForEach(["❤️", "🔥", "⚡", "👀", "👏", "😂", "💯", "🏆", "👍", "👎", "🙌", "🤝"], id: \.self) { symbol in
                            Button { react(symbol) } label: {
                                Text(symbol).font(.title2).frame(width: 46, height: 46)
                                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 11))
                            }
                            .accessibilityLabel("React \(symbol)")
                        }
                    }
                    HStack {
                        TextField("Emoji or custom shortcode", text: $customEmoji).textFieldStyle(.roundedBorder)
                        Button("Add") { react(customEmoji) }.disabled(customEmoji.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || customEmoji.utf16.count > 32)
                    }
                    Spacer()
                }
                .padding(16)
                .background(Brand.background(for: scheme))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { showingEmoji = false }.labelStyle(.iconOnly) }
                }
                .navigationTitle("React")
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium, .large])
        }
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
            FeedPickCard(pick: pick, sport: post.sport)
        }
        if let poll = post.poll {
            pollView(poll)
        }
        ForEach(Array(post.media.enumerated()), id: \.offset) { _, url in
            if Self.allowedMedia(url) {
                FeedMedia(url: url)
            }
        }
        interactions
    }

    private var interactions: some View {
        HStack(spacing: 4) {
            if let operation {
                actionButton("React", icon: post.reacted?.contains("❤️") == true ? "heart.fill" : "heart",
                    value: post.reactions, active: post.reacted?.contains("❤️") == true) {
                    operation(.init(kind: "react", enabled: post.reacted?.contains("❤️") != true, emoji: "❤️"))
                }
                .contextMenu {
                    Button("More reactions", systemImage: "face.smiling") { showingEmoji = true }
                    ForEach(["🔥", "⚡", "👀", "👏"], id: \.self) { symbol in
                        Button("React \(symbol)") { react(symbol) }
                    }
                }
                .accessibilityAction(named: "More reactions") { showingEmoji = true }
            } else {
                count("Reactions", icon: "heart", value: post.reactions)
            }
            if showDiscussionButton, let discussion {
                actionButton("Comments", icon: "bubble", value: post.comments, action: discussion)
            } else {
                count("Comments", icon: "bubble", value: post.comments)
            }
            if let operation, post.visibility != "private" {
                actionButton("Repost", icon: "arrow.2.squarepath", value: post.reposts, active: post.reposted == true) {
                    operation(.init(kind: "repost", enabled: post.reposted != true))
                }
            } else {
                count("Reposts", icon: "arrow.2.squarepath", value: post.reposts)
            }
            Spacer(minLength: 0)
            if let operation {
                actionButton(post.bookmarked == true ? "Remove bookmark" : "Bookmark",
                    icon: post.bookmarked == true ? "bookmark.fill" : "bookmark", active: post.bookmarked == true) {
                    operation(.init(kind: "bookmark", enabled: post.bookmarked != true))
                }
            }
            if post.shareable, let url = URL(string: "https://\(SlipSurgeHTTP.site)/posts/\(post.postID.uuidString.lowercased())") {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up").frame(minWidth: 39, minHeight: 44)
                }.accessibilityLabel("Share post")
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
    }

    private func actionButton(_ label: String, icon: String, value: Int? = nil, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                if let value, value > 0 { Text(value.formatted()).monospacedDigit() }
            }
            .foregroundStyle(active ? Brand.accent(for: scheme) : .secondary)
            .frame(minWidth: 39, minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(value.map { "\(label), \($0)" } ?? label)
        .accessibilityAddTraits(active ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: active)
    }

    private func pollView(_ poll: FeedPost.Poll) -> some View {
        let end = SidelineBoard.timestamp(poll.endsAt)
        let closed = end.map { $0 <= .now } ?? true
        let voted = post.pollVote != nil
        let total = poll.votes?.reduce(0, +) ?? 0
        return VStack(alignment: .leading, spacing: 7) {
            ForEach(Array(poll.options.enumerated()), id: \.offset) { index, option in
                let percent = total > 0 ? Double(poll.votes.flatMap { $0.indices.contains(index) ? $0[index] : nil } ?? 0) / Double(total) : 0
                Button {
                    operation?(.init(kind: "vote", option: index))
                } label: {
                    HStack {
                        Text(verbatim: option)
                        Spacer()
                        if voted || closed {
                            Text(percent.formatted(.percent.precision(.fractionLength(0)))).font(.caption.weight(.bold))
                        }
                        if post.pollVote == index {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(Brand.accent(for: scheme))
                        }
                    }
                    .padding(10)
                    .frame(minHeight: 44)
                    .background(.quaternary, in: .rect(cornerRadius: 9))
                    .contentShape(.rect)
                }
                .buttonStyle(SlipSurgePressStyle())
                .disabled(closed || voted || operation == nil)
            }
            if closed {
                Text("Poll ended").font(.caption).foregroundStyle(.secondary)
            } else if let end {
                Text("Ends \(end.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func react(_ symbol: String) {
        let value = symbol.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.utf16.count <= 32 else { return }
        operation?(.init(kind: "react", enabled: !(post.reacted?.contains(value) ?? false), emoji: value))
        customEmoji = ""
        showingEmoji = false
    }

    private func count(_ label: String, icon: String, value: Int) -> some View {
        Label(value.formatted(), systemImage: icon)
            .accessibilityLabel("\(value) \(label.lowercased())")
    }

    static func allowedMedia(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil, let host = url.host else { return false }
        return host == SlipSurgeHTTP.site || host == "hkldweedwnxartkfhror.supabase.co" ||
            host == "media.tenor.com" || host == "a.espncdn.com" || host == "cdn.nba.com" ||
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
