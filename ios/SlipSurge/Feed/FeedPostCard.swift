import AVKit
import SwiftUI

struct FeedPostCard: View {
    let post: FeedPost
    var operation: ((FeedAPI.Mutation) -> Void)?
    var showDiscussionButton = true
    var discussion: (() -> Void)?
    var showAuthor: (() -> Void)?
    var actionsAPI: FeedAPI?
    var postChanged: ((Bool) -> Void)?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false
    @State private var showingEmoji = false
    @State private var showingQuickReactions = false
    @State private var expandReactions = false
    @State private var reactionFailed = false
    @State private var heartPulse = 0

    private static let heart = "❤️"
    private static let quickReactions = ["🔥", "⚡", "👀", "👏", "😂"]
    private var canReact: Bool { actionsAPI?.userID != nil }
    private var reactions: (selected: Set<String>, counts: [String: Int]) {
        if let actionsAPI { return actionsAPI.account.postReactions.reactions(for: post) }
        return (Set(post.reacted ?? []), post.reactionSummary ?? [Self.heart: post.reactions])
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let reposter = post.repostedBy {
                Label("\(reposter) reposted", systemImage: "arrow.2.squarepath")
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack(alignment: .top) {
                if let showAuthor, let author = post.author {
                    Button(action: showAuthor) { authorLabel }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityLabel("View \(author.displayName ?? author.username)’s profile")
                } else {
                    authorLabel
                }
                Spacer(minLength: 3)
                if let actionsAPI, actionsAPI.userID != nil, let postChanged {
                    FeedPostActions(api: actionsAPI, post: post, changed: postChanged)
                }
            }
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
                NativeEmojiPicker(title: "React", select: react)
            }
            .presentationDetents([.medium, .large])
        }
        .alert("Reaction couldn’t sync", isPresented: $reactionFailed) { Button("OK", role: .cancel) {} }
    }

    private var authorLabel: some View {
        HStack(spacing: 10) {
            NativeMemberAvatar(url: post.author?.avatar, name: post.author?.displayName ?? post.author?.username ?? "Member",
                size: 36, style: post.author?.avatarRingStyle, color: post.author?.avatarRingColor, tone: post.author?.avatarTone,
                animated: post.author?.avatarRingStyle != nil)
            VStack(alignment: .leading, spacing: 2) {
                if let author = post.author {
                    HStack(spacing: 5) {
                        Text(author.displayName ?? author.username).font(.subheadline.weight(.semibold))
                        if author.verified == true {
                            Image(systemName: "checkmark.seal.fill")
                                .accessibilityLabel("Verified")
                        }
                    }
                    let posted = SidelineBoard.timestamp(post.createdAt)?
                        .formatted(.relative(presentation: .numeric, unitsStyle: .abbreviated))
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 5) {
                            Text("@\(author.username)").fixedSize(horizontal: true, vertical: false)
                            if let posted {
                                Text("·").accessibilityHidden(true)
                                Text(posted).fixedSize(horizontal: true, vertical: false)
                            }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("@\(author.username)").lineLimit(1)
                            if let posted { Text(posted) }
                        }
                    }
                    .font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("SlipSurge member").font(.subheadline.weight(.semibold))
                    if let posted = SidelineBoard.timestamp(post.createdAt) {
                        Text(posted, style: .relative).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var postBody: some View {
        if !post.content.isEmpty { NativeSocialBody(content: post.content) }
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
        let summary = reactions.counts.filter { $0.key != Self.heart && $0.value > 0 }
        if !summary.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(summary.keys.sorted { first, second in
                        (summary[first] ?? 0) == (summary[second] ?? 0) ? first < second : (summary[first] ?? 0) > (summary[second] ?? 0)
                    }, id: \.self) { symbol in
                        Button { react(symbol) } label: {
                            HStack(spacing: 5) {
                                NativeReactionArtwork(symbol: symbol)
                                Text((summary[symbol] ?? 0).formatted()).monospacedDigit()
                            }
                            .padding(.horizontal, 9).frame(minHeight: 44)
                            .background {
                                Capsule().fill(reactions.selected.contains(symbol) ? Brand.accent(for: scheme).opacity(0.15) : Color.secondary.opacity(0.08))
                                    .frame(height: 28)
                            }
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .disabled(!canReact)
                        .accessibilityLabel("\(symbol) reaction, \(summary[symbol] ?? 0)")
                        .accessibilityAddTraits(reactions.selected.contains(symbol) ? .isSelected : [])
                        .transition(.scale(scale: 0.88).combined(with: .opacity))
                    }
                }
                .font(.caption)
            }
            .scrollIndicators(.hidden)
        }
        interactions
    }

    private var interactions: some View {
        HStack(spacing: 0) {
            if showDiscussionButton, let discussion {
                actionButton("Replies", icon: "bubble", value: post.comments, action: discussion)
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
            heartButton
            if canReact {
                Button("More reactions", systemImage: "face.smiling") { showingQuickReactions = true }
                    .labelStyle(.iconOnly)
                    .buttonStyle(SlipSurgePressStyle())
                    .frame(minWidth: 44, minHeight: 44)
                    .popover(isPresented: $showingQuickReactions, arrowEdge: .bottom) { quickReactionPicker }
            }
            if let operation {
                actionButton(post.bookmarked == true ? "Remove bookmark" : "Bookmark",
                    icon: post.bookmarked == true ? "bookmark.fill" : "bookmark", active: post.bookmarked == true) {
                    operation(.init(kind: "bookmark", enabled: post.bookmarked != true))
                }
            }
            if post.shareable, let url = URL(string: "https://\(SlipSurgeHTTP.site)/posts/\(post.postID.uuidString.lowercased())") {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up").frame(minWidth: 44, minHeight: 44)
                }.accessibilityLabel("Share post")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var heartButton: some View {
        let liked = reactions.selected.contains(Self.heart)
        let count = reactions.counts[Self.heart] ?? 0
        if canReact {
            Button { react(Self.heart) } label: {
                HStack(spacing: 4) {
                    Group {
                        if reduceMotion { Image(systemName: liked ? "heart.fill" : "heart") }
                        else { Image(systemName: liked ? "heart.fill" : "heart").symbolEffect(.bounce.up, value: heartPulse) }
                    }
                    if count > 0 {
                        Text(count.formatted()).monospacedDigit().contentTransition(.numericText())
                    }
                }
                .foregroundStyle(liked ? Color(rgb: scheme == .dark ? 0xFF6C8C : 0xC22B5A) : .secondary)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(.rect)
                .overlay(alignment: .leading) {
                    if !reduceMotion { LikeBurst(trigger: heartPulse).offset(x: 9) }
                }
            }
            .buttonStyle(SlipSurgePressStyle())
            .accessibilityLabel(liked ? "Unlike post" : "Like post")
            .accessibilityValue("\(count) likes")
            .accessibilityAddTraits(liked ? .isSelected : [])
            .accessibilityAction(named: "More reactions") { showingQuickReactions = true }
            .contextMenu {
                ForEach(Self.quickReactions, id: \.self) { symbol in
                    Button("\(reactions.selected.contains(symbol) ? "Remove" : "React") \(symbol)") { react(symbol) }
                }
                Button("All reactions", systemImage: "face.smiling") { showingEmoji = true }
            }
            .sensoryFeedback(.impact(weight: .light), trigger: heartPulse)
        } else {
            self.count("Likes", icon: "heart", value: count)
        }
    }

    private var quickReactionPicker: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) { reactionOptions }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 44, maximum: 52))], spacing: 4) { reactionOptions }
        }
        .padding(7)
        .presentationCompactAdaptation(.popover)
        .onDisappear {
            if expandReactions {
                expandReactions = false
                showingEmoji = true
            }
        }
    }

    @ViewBuilder
    private var reactionOptions: some View {
        ForEach(Self.quickReactions, id: \.self) { symbol in
            Button { react(symbol) } label: {
                Text(symbol).font(.title3).frame(width: 44, height: 44)
                    .background(reactions.selected.contains(symbol) ? Brand.accent(for: scheme).opacity(0.16) : .clear, in: .circle)
            }
            .buttonStyle(SlipSurgePressStyle())
            .accessibilityLabel("\(reactions.selected.contains(symbol) ? "Remove reaction" : "React") \(symbol)")
        }
        Button("All reactions", systemImage: "plus.circle") {
            expandReactions = true
            showingQuickReactions = false
        }
        .labelStyle(.iconOnly).buttonStyle(SlipSurgePressStyle()).frame(width: 44, height: 44)
    }

    private func actionButton(_ label: String, icon: String, value: Int? = nil, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                if let value, value > 0 { Text(value.formatted()).monospacedDigit() }
            }
            .foregroundStyle(active ? Brand.accent(for: scheme) : .secondary)
            .frame(minWidth: 44, minHeight: 44)
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
        guard let actionsAPI, !value.isEmpty, value.utf16.count <= 32 else { return }
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) {
            if actionsAPI.account.postReactions.toggle(value, post: post, api: actionsAPI, failed: { reactionFailed = true }),
               value == Self.heart { heartPulse += 1 }
        }
        showingQuickReactions = false
        showingEmoji = false
    }

    private func count(_ label: String, icon: String, value: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            if value > 0 { Text(value.formatted()).monospacedDigit() }
        }
        .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("\(value) \(label.lowercased())")
    }

    nonisolated static func allowedMedia(_ url: URL) -> Bool {
        if NativeGIFSource.isProvider(url) { return true }
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil, let host = url.host else { return false }
        return host == SlipSurgeHTTP.site || host == "hkldweedwnxartkfhror.supabase.co" ||
            host == "media.tenor.com" || host == "a.espncdn.com" || host == "cdn.nba.com" || host == "static.www.nfl.com" || host == "img.mlbstatic.com" ||
            host == "cdn.discordapp.com" || host == "pbs.twimg.com" || host.hasSuffix(".public.blob.vercel-storage.com")
    }
}

private struct LikeBurst: View {
    let trigger: Int

    var body: some View {
        Color.clear.frame(width: 19, height: 19)
            .keyframeAnimator(initialValue: 1.0, trigger: trigger) { content, progress in
                content.overlay {
                    ForEach(0..<6) { index in
                        let angle = Double(index) * (.pi / 3) - .pi / 6
                        let radius = 8 + 11 * progress
                        Circle().fill(index.isMultiple(of: 2) ? Color(rgb: 0xFF6C8C) : Color(rgb: 0xFFB84D))
                            .frame(width: 3, height: 3).offset(x: cos(angle) * radius, y: sin(angle) * radius)
                            .opacity(max(0, (1 - progress) * 0.85))
                    }
                }
            } keyframes: { _ in
                MoveKeyframe(0)
                CubicKeyframe(1, duration: 0.34)
            }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct FeedMedia: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        if NativeGIFSource.canPlay(url) {
            NativeGIFPlayback(url: url, maxHeight: 340).clipShape(.rect(cornerRadius: 9))
        } else if ["mp4", "mov", "m4v"].contains(url.pathExtension.lowercased()) {
            if let player {
                VideoPlayer(player: player).aspectRatio(16 / 9, contentMode: .fit)
                    .onDisappear { player.pause() }
            } else {
                Button("Load video", systemImage: "play.rectangle") { player = AVPlayer(url: url) }
            }
        } else {
            PostArtwork(url: url, label: "Post image", maxHeight: 360)
                .clipShape(.rect(cornerRadius: 8))
        }
    }
}
