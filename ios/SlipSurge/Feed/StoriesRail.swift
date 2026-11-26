import SwiftUI

struct StoriesRail: View {
    private struct Playback: Identifiable {
        let id = UUID()
        let queue: [FeedStory]
        let index: Int
    }

    private struct StoryGroup: Identifiable {
        let id: UUID
        var items: [FeedStory]
    }

    let api: StoriesAPI
    let sports: [String]
    let revision: Int
    let showAuthor: (String) -> Void
    @Environment(\.slipPalette) private var slipPalette
    @State private var page: StoriesAPI.Page?
    @State private var composer = false
    @State private var playback: Playback?
    @State private var refreshed = 0

    private var groups: [StoryGroup] {
        let stories = (page?.stories ?? []).filter { !$0.expired }
        let grouped = Dictionary(grouping: stories, by: \.author.id)
        let authors = stories.reduce(into: [UUID]()) { result, story in
            if !result.contains(story.author.id) { result.append(story.author.id) }
        }
        return authors.map { StoryGroup(id: $0, items: grouped[$0] ?? []) }
    }

    var body: some View {
        Group {
            if let page, page.enabled, page.canCreate || !groups.isEmpty {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 14) {
                        if page.canCreate {
                            Button { composer = true } label: {
                                VStack(spacing: 6) {
                                    Image(systemName: "plus")
                                        .font(.title3.weight(.semibold))
                                        .foregroundStyle(slipPalette.accent)
                                        .frame(width: 58, height: 58)
                                        .background(slipPalette.accent.opacity(0.14), in: Circle())
                                    Text("Your story").font(.caption.weight(.medium))
                                }.frame(width: 68)
                            }.buttonStyle(SlipSurgePressStyle())
                        }
                        ForEach(groups) { group in
                            if let story = group.items.first {
                                Button { open(group.id) } label: {
                                    VStack(spacing: 6) {
                                        StoryAvatar(author: story.author, size: 58)
                                            .overlay(alignment: .bottomTrailing) {
                                                if let sport = story.sport, let logo = LeagueArtwork.logo(sport) {
                                                    ResearchArtwork(urls: [logo], fallback: "sportscourt", pointSize: 15)
                                                        .frame(width: 15, height: 15).padding(4)
                                                        .background(slipPalette.surface, in: Circle())
                                                }
                                            }
                                        Text(story.author.name).font(.caption.weight(.medium)).lineLimit(1)
                                    }.frame(width: 68)
                                }
                                .buttonStyle(SlipSurgePressStyle())
                                .accessibilityLabel("\(story.author.name), \(group.items.count) stories")
                            }
                        }
                    }
                    .padding(.vertical, 5)
                    .padding(.horizontal, 4)
                }
                .scrollIndicators(.hidden)
                .accessibilityLabel("Stories")
            }
        }
        .task(id: revision + refreshed) {
            let response = try? await api.load()
            if !Task.isCancelled, let response { page = response }
        }
        .sheet(isPresented: $composer) {
            if let userID = api.userID {
                StoryComposerView(api: api, userID: userID, sports: sports) { refreshed += 1 }
            }
        }
        .fullScreenCover(item: $playback) { item in
            StoryViewer(api: api, stories: item.queue, index: item.index, removed: { refreshed += 1 }) { username in
                playback = nil
                showAuthor(username)
            }
        }
    }

    private func open(_ author: UUID) {
        let queue = groups.flatMap(\.items)
        guard let start = queue.firstIndex(where: { $0.author.id == author }) else { return }
        playback = .init(queue: queue, index: start)
    }
}

struct StoryAvatar: View {
    let author: FeedStory.Author
    let size: CGFloat
    @Environment(\.slipPalette) private var slipPalette

    var body: some View {
        let accent = Color(hex: author.avatarRingColor) ?? slipPalette.accent
        NativeMemberAvatar(url: author.avatarUrl, name: author.name, size: size - 8,
            style: author.avatarRingStyle, color: author.avatarRingColor)
            .padding(4)
            .background {
                Circle().strokeBorder(AngularGradient(colors: [accent, accent.opacity(0.28), accent], center: .center), lineWidth: 2)
            }
    }
}
