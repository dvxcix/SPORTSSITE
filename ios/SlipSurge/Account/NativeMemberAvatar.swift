import SwiftUI
import WebKit

@MainActor
enum AvatarArtwork {
    struct Decoration: Decodable, Identifiable {
        let id: String
        let name: String
        let sport: String
        let preview: String
    }

    enum Ring: String, CaseIterable {
        case surge, pulse, orbit, solid, none
        var title: String { self == .none ? "No decoration" : rawValue.capitalized + " ring" }
    }

    private struct Catalog: Decodable {
        let atlasSize: Int
        let columns: Int
        let items: [Decoration]
    }

    nonisolated static let defaultColor = "#b6ff3b"
    static let colors = ["#b6ff3b", "#39d9ff", "#a855f7", "#ff4d6a", "#f8c15c", "#ffffff"]
    private static let catalog: Catalog? = {
        guard let url = Bundle.main.url(forResource: "AvatarDecorations", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }()
    static let items = catalog?.items ?? []
    private static let byId = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })

    private static let tiles: [String: CGImage] = {
        guard let catalog, let atlas = UIImage(named: "AvatarDecorations")?.cgImage else { return [:] }
        let size = catalog.atlasSize
        return Dictionary(uniqueKeysWithValues: catalog.items.enumerated().compactMap { offset, entry in
            let rect = CGRect(x: offset % catalog.columns * size, y: offset / catalog.columns * size, width: size, height: size)
            return atlas.cropping(to: rect).map { (entry.id, $0) }
        })
    }()

    static func decoration(_ value: String?) -> Decoration? {
        guard let value, value.hasPrefix("deco:") else { return nil }
        return byId[String(value.dropFirst(5))]
    }

    static func title(_ value: String?) -> String {
        decoration(value)?.name ?? (value.flatMap(Ring.init(rawValue:)) ?? .surge).title
    }

    static func still(_ item: Decoration) -> CGImage? { tiles[item.id] }
}

struct NativeMemberAvatar: View {
    let url: URL?
    let name: String
    let size: CGFloat
    var style: String?
    var color: String?
    var tone: String?
    var animated = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var initials: String {
        let letters = name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    private var ringColor: Color {
        if let custom = Color(hex: color) { return custom }
        switch tone {
        case "ultimate": return Color(rgb: 0x39D9FF)
        case "advanced": return Color(rgb: 0xFF4D6A)
        case "creator": return Color(rgb: 0xF8C15C)
        default: return Brand.accent(for: scheme).opacity(0.75)
        }
    }

    var body: some View {
        ResearchArtwork(urls: [url].compactMap { $0 }.filter(FeedPostCard.allowedMedia), fallback: "person.crop.circle.fill",
            contentMode: .fill, fallbackText: initials)
            .font(.system(size: size * 0.3, weight: .semibold))
            .frame(width: size, height: size)
            .background(Brand.surface(for: scheme), in: .circle)
            .clipShape(.circle)
            .overlay { Circle().strokeBorder(.secondary.opacity(0.23)) }
            .overlay { ornament.allowsHitTesting(false) }
            .accessibilityHidden(true)
    }

    @ViewBuilder private var ornament: some View {
        let motion = animated && !reduceMotion && phase == .active
        if let item = AvatarArtwork.decoration(style) {
            Group {
                if motion {
                    MovingAvatarDecoration(item: item)
                } else if let still = AvatarArtwork.still(item) {
                    Image(decorative: still, scale: 1).resizable().scaledToFit()
                }
            }
            .frame(width: size * 240 / 184, height: size * 240 / 184)
            .shadow(color: .black.opacity(0.24), radius: size > 55 ? 1.5 : 0.7, y: 1)
        } else {
            let ring = style.flatMap(AvatarArtwork.Ring.init(rawValue:)) ?? .surge
            if motion && ring != .solid && ring != .none {
                TimelineView(.animation(minimumInterval: 1 / 24)) { timeline in
                    ringView(ring, time: timeline.date.timeIntervalSinceReferenceDate)
                }
            } else {
                ringView(ring, time: 0)
            }
        }
    }

    @ViewBuilder private func ringView(_ ring: AvatarArtwork.Ring, time: TimeInterval) -> some View {
        let width = size < 45 ? 1.5 : 2.5
        let color = ringColor
        switch ring {
        case .surge, .orbit:
            let orbit = ring == .orbit
            let period = orbit ? 3.2 : 4.8
            let angle = time.truncatingRemainder(dividingBy: period) / period * 360
            let stops: [Gradient.Stop] = orbit
                ? [.init(color: .clear, location: 0.58), .init(color: color, location: 0.72), .init(color: color, location: 0.86), .init(color: .clear, location: 1)]
                : [.init(color: .clear, location: 0.10), .init(color: color, location: 0.3), .init(color: color.opacity(0.82), location: 0.44), .init(color: .clear, location: 0.64)]
            Circle().strokeBorder(AngularGradient(gradient: Gradient(stops: stops), center: .center,
                angle: .degrees(angle + (orbit ? 0 : 120))), lineWidth: width)
                .frame(width: size + (orbit ? 8 : 5), height: size + (orbit ? 8 : 5))
        case .solid, .pulse:
            let pulse = ring == .pulse ? (1 - cos(time / 2.2 * 2 * .pi)) / 2 : 0
            Circle().strokeBorder(color, lineWidth: width)
                .frame(width: size + 5, height: size + 5)
                .scaleEffect(1 + pulse * 0.045)
                .opacity(ring == .pulse ? 0.55 + pulse * 0.45 : 1)
                .shadow(color: color.opacity(0.35), radius: 3)
        case .none:
            EmptyView()
        }
    }
}

private struct MovingAvatarDecoration: UIViewRepresentable {
    let item: AvatarArtwork.Decoration

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.isUserInteractionEnabled = false
        return view
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.art != item.id else { return }
        context.coordinator.art = item.id
        view.loadHTMLString("""
          <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
          <style>html,body,svg{display:block;width:100%;height:100%;margin:0;overflow:hidden;background:transparent}</style>
          </head><body>\(item.preview)</body></html>
          """, baseURL: nil)
    }

    final class Coordinator { var art: String? }
}
