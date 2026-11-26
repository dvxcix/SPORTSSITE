import SwiftUI

struct SiteAnnouncements: Decodable {
    struct Banner: Decodable {
        let message: String
        let bgColor: String
        let textColor: String
        let isActive: Bool
        let dismissible: Bool
        let linkUrl: String?
        let linkLabel: String?
        let updatedAt: String

        var destination: URL? { linkUrl.flatMap(SiteAnnouncements.link) }
        var label: String { linkLabel.flatMap { $0.isEmpty ? nil : $0 } ?? "Learn more" }
    }

    struct Release: Decodable, Identifiable {
        let id: UUID
        let title: String
        let description: String
        let howToUse: String?
        let screenshotUrls: [URL]
        let audienceTier: String
        let createdAt: String
        let updatedAt: String
        let isActive: Bool?
    }

    let banner: Banner?
    let entries: [Release]

    static func link(_ source: String) -> URL? {
        let text = source.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = URL(string: "https://" + SlipSurgeHTTP.site)
        let internalPath = text.hasPrefix("/") && !text.hasPrefix("//") && !text.contains("\\")
        let url = URL(string: text, relativeTo: internalPath ? base : nil)?.absoluteURL
        guard let url, ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil, url.user == nil, url.password == nil else { return nil }
        return url
    }

    @MainActor
    static func linkedText(_ source: String) -> AttributedString {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return AttributedString(source) }
        var result = AttributedString()
        var cursor = source.startIndex
        for match in detector.matches(in: source, range: NSRange(source.startIndex..., in: source)) {
            guard let range = Range(match.range, in: source), let raw = match.url, let url = link(raw.absoluteString) else { continue }
            result.append(AttributedString(String(source[cursor..<range.lowerBound])))
            var value = AttributedString(String(source[range]))
            value.link = url
            result.append(value)
            cursor = range.upperBound
        }
        result.append(AttributedString(String(source[cursor...])))
        return result
    }
}

struct SiteAnnouncementBanner: View {
    let banner: SiteAnnouncements.Banner
    var onClose: (() -> Void)?

    var body: some View {
        let foreground = Color(hex: banner.textColor) ?? .primary
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(SiteAnnouncements.linkedText(banner.message)).font(.footnote.weight(.semibold))
                if let url = banner.destination {
                    Link(destination: url) {
                        Label(banner.label, systemImage: "arrow.up.right").font(.footnote.weight(.bold))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if banner.dismissible, let onClose {
                Button("Dismiss announcement", systemImage: "xmark", action: onClose)
                    .labelStyle(.iconOnly)
                    .frame(width: 44, height: 44)
                    .buttonStyle(SlipSurgePressStyle())
            }
        }
        .foregroundStyle(foreground)
        .tint(foreground)
        .padding(.leading, 14)
        .padding(.trailing, banner.dismissible ? 4 : 14)
        .padding(.vertical, 5)
        .frame(minHeight: 44)
        .background(Color(hex: banner.bgColor) ?? .clear)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Site announcement")
    }
}

struct ReleaseAnnouncementView: View {
    let release: SiteAnnouncements.Release
    var queueCount = 1
    var actionTitle = "Don’t Show Again"
    var action: () -> Void
    var problem: String?
    var loading = false
    @Environment(\.slipPalette) private var slipPalette
    @State private var selected: Screenshot?

    private struct Screenshot: Identifiable {
        let url: URL
        var id: URL { url }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    if release.audienceTier == "ultimate" {
                        Label("Ultimate release", systemImage: "bolt.fill")
                            .font(.caption.weight(.heavy)).foregroundStyle(slipPalette.accent)
                    }
                    if queueCount > 1 {
                        Spacer()
                        Text("1 of \(queueCount)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Text(release.title).font(.title2.weight(.heavy)).accessibilityAddTraits(.isHeader)
                Text(SiteAnnouncements.linkedText(release.description)).font(.body)
                if let instructions = release.howToUse, !instructions.isEmpty {
                    Divider()
                    Text("How to use it").font(.headline).accessibilityAddTraits(.isHeader)
                    Text(SiteAnnouncements.linkedText(instructions)).font(.body)
                }
                if !release.screenshotUrls.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            ForEach(Array(release.screenshotUrls.enumerated()), id: \.offset) { index, url in
                                Button { selected = .init(url: url) } label: {
                                    ResearchArtwork(urls: [url], fallback: "photo")
                                        .frame(width: 220, height: 134)
                                        .background(slipPalette.background, in: .rect(cornerRadius: 13))
                                }
                                .buttonStyle(SlipSurgePressStyle())
                                .accessibilityLabel("Enlarge screenshot \(index + 1)")
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                if let problem { Text(problem).font(.subheadline).foregroundStyle(.red) }
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(loading)
            }
            .frame(maxWidth: 650, alignment: .leading)
            .padding(19)
        }
        .foregroundStyle(slipPalette.text)
        .background(slipPalette.surface)
        .sheet(item: $selected) { screenshot in
            NavigationStack {
                ResearchArtwork(urls: [screenshot.url], fallback: "photo")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Done") { selected = nil } }
                    }
            }
        }
    }
}

struct SiteAnnouncementsAPI {
    let account: AccountStore
    let userID: UUID?
    private static let path = "/api/mobile/announcements"

    func read() async throws -> SiteAnnouncements {
        try await DiscoverAPI(account: account, userID: userID).readPublic(SiteAnnouncements.self, path: Self.path)
    }

    func dismiss(_ id: UUID) async throws {
        struct Body: Encodable { let entryId: String }
        struct Response: Decodable { let dismissed: UUID }
        let response = try await DiscoverAPI(account: account, userID: userID).write(Response.self,
            path: Self.path, body: Body(entryId: id.uuidString.lowercased()))
        guard response.dismissed == id else { throw URLError(.badServerResponse) }
    }
}
