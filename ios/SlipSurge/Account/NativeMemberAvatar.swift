import SwiftUI

@MainActor
enum AvatarArtwork {
    struct Decoration: Decodable, Identifiable {
        let id: String
        let name: String
        let sport: String
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

    private static let stillAtlas = UIImage(named: "AvatarDecorations")?.cgImage
    private static let tileOffsets = Dictionary(uniqueKeysWithValues: items.enumerated().map { ($0.element.id, $0.offset) })
    private static var tiles: [String: CGImage] = [:]

    static func decoration(_ value: String?) -> Decoration? {
        guard let value, value.hasPrefix("deco:") else { return nil }
        return byId[String(value.dropFirst(5))]
    }

    static func title(_ value: String?) -> String {
        decoration(value)?.name ?? (value.flatMap(Ring.init(rawValue:)) ?? .surge).title
    }

    static func still(_ item: Decoration) -> CGImage? {
        if let tile = tiles[item.id] { return tile }
        guard let catalog, let stillAtlas, let offset = tileOffsets[item.id] else { return nil }
        let size = catalog.atlasSize
        let tile = stillAtlas.cropping(to: CGRect(x: offset % catalog.columns * size,
            y: offset / catalog.columns * size, width: size, height: size))
        tiles[item.id] = tile
        return tile
    }
}
struct NativeMemberAvatar: View {
    let url: URL?
    let name: String
    let size: CGFloat
    var style: String?
    var color: String?
    var tone: String?
    var animated = true
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
            contentMode: .fill, fallbackText: initials, pointSize: size)
            .font(.system(size: size * 0.3, weight: .semibold))
            .frame(width: size, height: size)
            .background(Brand.surface(for: scheme), in: .circle)
            .clipShape(.circle)
            .overlay { Circle().strokeBorder(.secondary.opacity(0.23)) }
            .overlay { ornament.allowsHitTesting(false) }
            .accessibilityHidden(true)
    }

    @ViewBuilder private var ornament: some View {
        let wantsMotion = animated && style != nil && !reduceMotion
        if let item = AvatarArtwork.decoration(style) {
            let decorationSize = size * 240 / 184
            Group {
                if wantsMotion {
                    MovingAvatarDecoration(item: item, size: decorationSize, playing: phase == .active)
                } else if let still = AvatarArtwork.still(item) {
                    Image(decorative: still, scale: 1).resizable().scaledToFit()
                }
            }
            .frame(width: decorationSize, height: decorationSize)
        } else {
            let ring = style.flatMap(AvatarArtwork.Ring.init(rawValue:)) ?? .surge
            if wantsMotion && phase == .active && ring != .solid && ring != .none {
                ringView(ring).modifier(AvatarRingMotion(ring: ring))
            } else {
                ringView(ring)
            }
        }
    }

    @ViewBuilder private func ringView(_ ring: AvatarArtwork.Ring) -> some View {
        let width = size < 45 ? 1.5 : 2.5
        let color = ringColor
        switch ring {
        case .surge, .orbit:
            let orbit = ring == .orbit
            let stops: [Gradient.Stop] = orbit
                ? [.init(color: .clear, location: 0.58), .init(color: color, location: 0.72), .init(color: color, location: 0.86), .init(color: .clear, location: 1)]
                : [.init(color: .clear, location: 0.10), .init(color: color, location: 0.3), .init(color: color.opacity(0.82), location: 0.44), .init(color: .clear, location: 0.64)]
            Circle().strokeBorder(AngularGradient(gradient: Gradient(stops: stops), center: .center,
                angle: .degrees(orbit ? 0 : 120)), lineWidth: width)
                .frame(width: size + (orbit ? 8 : 5), height: size + (orbit ? 8 : 5))
        case .solid, .pulse:
            Circle().strokeBorder(color, lineWidth: width)
                .frame(width: size + 5, height: size + 5)
                .shadow(color: color.opacity(0.35), radius: 3)
        case .none:
            EmptyView()
        }
    }
}

private struct AvatarRingMotion: ViewModifier {
    let ring: AvatarArtwork.Ring
    @State private var progress: Double = 0

    func body(content: Content) -> some View {
        let pulse = ring == .pulse
        content
            .rotationEffect(.degrees(pulse ? 0 : 360 * progress))
            .scaleEffect(pulse ? 1 + progress * 0.045 : 1)
            .opacity(pulse ? 0.55 + progress * 0.45 : 1)
            .task(id: ring) {
                progress = 0
                await Task.yield()
                guard !Task.isCancelled else { return }
                let animation: Animation = pulse ? .easeInOut(duration: 1.1) : .linear(duration: ring == .orbit ? 3.2 : 4.8)
                withAnimation(animation.repeatForever(autoreverses: pulse)) { progress = 1 }
            }
    }
}
