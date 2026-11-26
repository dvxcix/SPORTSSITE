import AVKit
import SwiftUI

struct StoryViewer: View {
    private struct Playback: Equatable {
        let id: UUID?
        let paused: Bool
        let retry: Int
    }

    let api: StoriesAPI
    let stories: [FeedStory]
    let removed: () -> Void
    let showAuthor: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index: Int
    @State private var paused = false
    @State private var progress = 0.0
    @State private var seconds = 5.0
    @State private var ready = false
    @State private var failed = false
    @State private var loadedPhoto: String?
    @State private var failedPhoto: String?
    @State private var retry = 0
    @State private var player: AVPlayer?
    @State private var removedIDs: Set<UUID> = []
    @State private var confirmingRemove = false
    @State private var removing = false
    @State private var removalFailed = false

    init(api: StoriesAPI, stories: [FeedStory], index: Int, removed: @escaping () -> Void, showAuthor: @escaping (String) -> Void) {
        self.api = api
        self.stories = stories
        self.removed = removed
        self.showAuthor = showAuthor
        _index = State(initialValue: index)
    }

    private var visible: [FeedStory] { stories.filter { !$0.expired && !removedIDs.contains($0.id) } }
    private var current: FeedStory? { visible.indices.contains(index) ? visible[index] : nil }
    private var mediaID: String { "\(current?.id.uuidString ?? ""):\(retry)" }
    private var mediaFailed: Bool { failed || failedPhoto == mediaID }
    private var playback: Playback {
        .init(id: current?.id, paused: paused || scene != .active || !(ready || loadedPhoto == mediaID) || mediaFailed || removing, retry: retry)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.ignoresSafeArea()
                if let current {
                    media(current, size: geometry.size).id(mediaID)
                    VStack(spacing: 10) {
                        storyProgress
                        header(current)
                        Spacer()
                        if current.artwork != nil, let caption = current.content, !caption.isEmpty {
                            Text(caption).font(.subheadline.weight(.semibold)).multilineTextAlignment(.center)
                                .padding(9).background(.black.opacity(0.68), in: .rect(cornerRadius: 11))
                        }
                        navigationButtons
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                }
            }
            .gesture(DragGesture(minimumDistance: 28).onEnded { motion in
                let distance = motion.translation.width
                if abs(distance) > abs(motion.translation.height) { move(distance < 0 ? 1 : -1) }
            })
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .onAppear { paused = reduceMotion }
        .onDisappear { player?.pause() }
        .task(id: mediaID) { await loadMedia() }
        .task(id: playback) { await advance(playback) }
        .sensoryFeedback(.selection, trigger: index)
        .confirmationDialog("Remove this story?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            if let current, current.mine {
                Button("Remove story", role: .destructive) { Task { await remove(current) } }
            }
        }
        .alert("Story couldn’t be removed", isPresented: $removalFailed) { Button("OK", role: .cancel) {} }
    }

    private var storyProgress: some View {
        HStack(spacing: 3) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { offset, story in
                Button {
                    index = offset
                } label: {
                    GeometryReader { geometry in
                        let fraction = offset < index ? 1 : offset == index ? progress : 0
                        Capsule().fill(.white.opacity(0.34)).overlay(alignment: .leading) {
                            Capsule().fill(.white).frame(width: geometry.size.width * fraction)
                        }
                    }.frame(height: 3).frame(minHeight: 20).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Story \(offset + 1), \(story.author.name)")
                .accessibilityAddTraits(offset == index ? .isSelected : [])
            }
        }
    }

    private func header(_ story: FeedStory) -> some View {
        HStack(spacing: 8) {
            Button {
                showAuthor(story.author.username)
            } label: {
                HStack(spacing: 7) {
                    StoryAvatar(author: story.author, size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(story.author.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                        if let date = story.createdAt.flatMap(SidelineBoard.timestamp) {
                            Text(date, style: .relative).font(.caption2).foregroundStyle(.white.opacity(0.75))
                        }
                    }
                }
            }.buttonStyle(.plain)
            Spacer(minLength: 1)
            if story.mine {
                Menu("Story options", systemImage: "ellipsis") {
                    Button("Remove story", systemImage: "trash", role: .destructive) { confirmingRemove = true }
                }.labelStyle(.iconOnly).disabled(removing)
            }
            viewerButton(paused ? "Play story" : "Pause story", icon: paused ? "play.fill" : "pause.fill") { paused.toggle() }
            viewerButton("Close stories", icon: "xmark") { dismiss() }
        }
        .padding(.horizontal, 5)
        .background(.black.opacity(0.4), in: .rect(cornerRadius: 20))
    }

    private var navigationButtons: some View {
        HStack {
            viewerButton("Previous story", icon: "chevron.left") { move(-1) }
                .opacity(index > 0 ? 1 : 0).disabled(index <= 0).accessibilityHidden(index <= 0)
            Spacer()
            viewerButton(index + 1 >= visible.count ? "Finish stories" : "Next story", icon: "chevron.right") { move(1) }
        }
    }

    private func viewerButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(title, systemImage: icon, action: action).labelStyle(.iconOnly)
            .font(.subheadline.weight(.semibold)).frame(minWidth: 44, minHeight: 44)
            .background(.black.opacity(0.38), in: Circle()).buttonStyle(SlipSurgePressStyle())
    }

    @ViewBuilder
    private func media(_ story: FeedStory, size: CGSize) -> some View {
        if mediaFailed {
            ContentUnavailableView {
                Label(story.video ? "Video unavailable" : "Photo unavailable", systemImage: "photo")
            } actions: { Button("Retry") { retry += 1 }.buttonStyle(.bordered) }
            .foregroundStyle(.white)
        } else if let url = story.artwork {
            if story.video {
                if let player { VideoPlayer(player: player).frame(width: size.width, height: size.height) }
                else { ProgressView().tint(.white) }
            } else if NativeGIFSource.canPlay(url) {
                let id = mediaID
                NativeGIFPlayback(url: url, maxHeight: size.height, maxWidth: size.width,
                    label: "Story GIF", autoplay: !paused && !removing) { loaded in
                    if loaded { loadedPhoto = id }
                    else { failedPhoto = id }
                }
                .id(id)
            } else {
                let id = mediaID
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFit().task { loadedPhoto = id }
                    case .failure: Color.clear.task { failedPhoto = id }
                    default: ProgressView().tint(.white)
                    }
                }
            }
        } else {
            (Color(hex: story.background) ?? .black)
                .overlay {
                    Text(story.content ?? "").font(.title2.weight(.bold)).multilineTextAlignment(.center)
                        .foregroundStyle(Color(hex: story.foreground) ?? .white)
                        .padding(.horizontal, 28).padding(.vertical, 100)
                }
        }
    }

    private func loadMedia() async {
        player?.pause()
        player = nil
        progress = 0
        seconds = 5
        ready = false
        failed = false
        guard let current else { dismiss(); return }
        guard let url = current.artwork else { ready = current.media == nil; failed = !ready; return }
        guard current.video else { return }
        do {
            let asset = AVURLAsset(url: url)
            let duration = try await asset.load(.duration).seconds
            guard !Task.isCancelled else { return }
            seconds = min(15, duration.isFinite && duration > 0 ? duration : 5)
            let playbackPlayer = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            playbackPlayer.isMuted = true
            player = playbackPlayer
            ready = true
        } catch { if !Task.isCancelled { failed = true } }
    }

    private func advance(_ state: Playback) async {
        guard !state.paused, let id = state.id, id == current?.id else { player?.pause(); return }
        player?.play()
        while !Task.isCancelled && progress < 1 {
            do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
            guard !Task.isCancelled, id == current?.id else { return }
            if let player {
                if player.currentItem?.status == .failed { failed = true; return }
                let played = player.currentTime().seconds
                if played.isFinite { progress = min(1, max(progress, played / seconds)) }
            } else {
                progress = min(1, progress + 0.05 / seconds)
            }
        }
        if !Task.isCancelled, id == current?.id { move(1) }
    }

    private func move(_ offset: Int) {
        let next = index + offset
        if visible.indices.contains(next) {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.18)) { index = next }
        } else if offset > 0 { dismiss() }
    }

    private func remove(_ story: FeedStory) async {
        guard !removing, story.mine else { return }
        removing = true
        defer { removing = false }
        do {
            try await api.remove(story.id)
            removedIDs.insert(story.id)
            index = max(0, min(index, visible.count - 1))
            removed()
            if visible.isEmpty { dismiss() }
        } catch { removalFailed = true }
    }
}
