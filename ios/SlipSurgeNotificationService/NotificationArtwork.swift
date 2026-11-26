import ImageIO
import UIKit
import UniformTypeIdentifiers
import UserNotifications

struct NotificationArtwork: Decodable {
    enum Kind: String, Decodable {
        case profile, image, game
    }

    struct Side: Decodable {
        let abbreviation: String
        let score: Int
        let logo: String?
        let primary: String?
        let secondary: String?
    }

    let version: Int
    let kind: Kind
    let image: String?
    let away: Side?
    let home: Side?
    let portrait: String?
    let portraitSide: String?
    let player: String?

    init?(userInfo: [AnyHashable: Any]) {
        guard let payload = userInfo["artwork"] as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: payload),
              data.count <= 3_000,
              let artwork = try? JSONDecoder().decode(Self.self, from: data),
              artwork.version == 1 else { return nil }
        self = artwork
    }

    func attachment() async -> UNNotificationAttachment? {
        let loader = ArtworkLoader()
        defer { loader.session.finishTasksAndInvalidate() }

        let output: UIImage?
        switch kind {
        case .profile, .image:
            guard let source = await loader.image(at: image) else { return nil }
            output = kind == .profile ? Self.profileImage(source) : source

        case .game:
            guard let away, let home else { return nil }
            async let awayImage = loader.image(at: away.logo)
            async let homeImage = loader.image(at: home.logo)
            async let playerImage = loader.image(at: portrait)
            output = await Self.gameImage(
                away: away, home: home, awayImage: awayImage, homeImage: homeImage,
                portrait: playerImage, portraitSide: portraitSide, player: player
            )
        }

        guard let data = output?.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory.appending(component: "\(UUID().uuidString).png")
        do {
            try data.write(to: url)
            return try UNNotificationAttachment(
                identifier: "slipsurge-artwork", url: url,
                options: [UNNotificationAttachmentOptionsTypeHintKey: UTType.png.identifier]
            )
        } catch {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
    }

    private static func renderer(_ size: CGSize) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format)
    }

    private static func profileImage(_ image: UIImage) -> UIImage {
        let rect = CGRect(x: 0, y: 0, width: 384, height: 384)
        return renderer(rect.size).image { context in
            context.cgContext.setFillColor(UIColor(red: 0.06, green: 0.12, blue: 0.10, alpha: 1).cgColor)
            context.cgContext.fill(rect)
            image.draw(in: fitted(image.size, in: rect, fill: true))
        }
    }

    private static func gameImage(
        away: Side, home: Side, awayImage: UIImage?, homeImage: UIImage?,
        portrait: UIImage?, portraitSide: String?, player: String?
    ) -> UIImage? {
        guard awayImage != nil || homeImage != nil || portrait != nil else { return nil }

        let portraitTeam: Side? = switch portraitSide {
        case "away": away
        case "home": home
        default: nil
        }
        let size = CGSize(width: 640, height: 344)
        return renderer(size).image { renderer in
            let context = renderer.cgContext
            let field = CGRect(origin: .zero, size: size)
            let left = UIColor.teamColor(away.primary)
            let right = UIColor.teamColor(portrait == nil ? home.primary : portraitTeam?.primary)
            let edge = UIColor.teamColor(portrait == nil ? home.secondary : portraitTeam?.secondary)
            context.setFillColor(UIColor(red: 0.035, green: 0.055, blue: 0.05, alpha: 1).cgColor)
            context.fill(field)
            if let wash = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                     colors: [left.cgColor, right.cgColor, edge.cgColor] as CFArray, locations: [0, 0.72, 1]) {
                context.drawLinearGradient(wash, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }

            let boardWidth: CGFloat = portrait == nil ? size.width : 388
            if let portrait {
                let photo = CGRect(x: 374, y: 15, width: 266, height: 329)
                context.saveGState()
                context.clip(to: photo)
                portrait.draw(in: fitted(portrait.size, in: photo, fill: true))
                context.restoreGState()
                if let player, !player.isEmpty {
                    let nameRect = CGRect(x: 380, y: 286, width: 260, height: 58)
                    context.setFillColor(UIColor.black.withAlphaComponent(0.78).cgColor)
                    context.fill(nameRect)
                    drawText(player, in: nameRect.insetBy(dx: 10, dy: 14), size: 22, weight: .semibold)
                }
            }

            let panel = CGRect(x: 24, y: 24, width: boardWidth - 48, height: 296)
            UIColor.black.withAlphaComponent(0.42).setFill()
            UIBezierPath(roundedRect: panel, cornerRadius: 32).fill()

            let gap = (panel.width - 28) / 2
            drawSide(away, logo: awayImage, center: panel.midX - gap / 2)
            drawSide(home, logo: homeImage, center: panel.midX + gap / 2)
            UIColor.white.withAlphaComponent(0.17).setFill()
            UIBezierPath(roundedRect: CGRect(x: panel.midX - 0.5, y: 81, width: 1, height: 178), cornerRadius: 1).fill()
        }
    }

    private static func drawSide(_ side: Side, logo: UIImage?, center: CGFloat) {
        let chip = CGRect(x: center - 53, y: 61, width: 106, height: 106)
        if let logo {
            UIColor.white.withAlphaComponent(0.94).setFill()
            UIBezierPath(roundedRect: chip, cornerRadius: 26).fill()
            logo.draw(in: fitted(logo.size, in: chip.insetBy(dx: 9, dy: 9)))
        }
        drawText(String(side.score), in: CGRect(x: center - 75, y: 180, width: 150, height: 71), size: 58, weight: .bold)
        drawText(side.abbreviation, in: CGRect(x: center - 60, y: 258, width: 120, height: 32), size: 23, weight: .semibold)
    }

    private static func drawText(_ text: String, in rect: CGRect, size: CGFloat, weight: UIFont.Weight) {
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        style.lineBreakMode = .byTruncatingTail
        (text as NSString).draw(in: rect, withAttributes: [
            .font: UIFont.monospacedDigitSystemFont(ofSize: size, weight: weight),
            .foregroundColor: UIColor.white,
            .paragraphStyle: style,
        ])
    }

    private static func fitted(_ size: CGSize, in rect: CGRect, fill: Bool = false) -> CGRect {
        let horizontal = rect.width / size.width
        let vertical = rect.height / size.height
        let ratio = fill ? max(horizontal, vertical) : min(horizontal, vertical)
        let width = size.width * ratio
        let height = size.height * ratio
        return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
    }
}

private extension UIColor {
    static func teamColor(_ hex: String?) -> UIColor {
        guard let hex, hex.count == 6, let value = UInt32(hex, radix: 16) else {
            return UIColor(red: 0.06, green: 0.19, blue: 0.14, alpha: 1)
        }
        // Temper the source color against SlipSurge's dark surfaces.
        return UIColor(
            red: 0.04 + 0.56 * CGFloat((value >> 16) & 255) / 255,
            green: 0.06 + 0.56 * CGFloat((value >> 8) & 255) / 255,
            blue: 0.05 + 0.56 * CGFloat(value & 255) / 255,
            alpha: 1
        )
    }
}

private final class ArtworkLoader: NSObject, URLSessionDownloadDelegate {
    private static let byteLimit: Int64 = 4 * 1_024 * 1_024
    let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 3
        configuration.timeoutIntervalForResource = 5
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        return URLSession(configuration: configuration)
    }()

    func image(at value: String?) async -> UIImage? {
        guard let value, value.utf8.count <= 600,
              let url = URL(string: value), Self.allows(url) else { return nil }
        do {
            let (file, response) = try await session.download(from: url, delegate: self)
            defer { try? FileManager.default.removeItem(at: file) }
            guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                  response.mimeType?.hasPrefix("image/") == true,
                  let actualSize = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                  actualSize > 0, Int64(actualSize) <= Self.byteLimit,
                  let source = CGImageSourceCreateWithURL(file as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
                  let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: 512,
                  ] as CFDictionary) else { return nil }
            return UIImage(cgImage: thumbnail)
        } catch {
            return nil
        }
    }

    func urlSession(
        _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
    ) {
        if totalBytesWritten > Self.byteLimit || totalBytesExpectedToWrite > Self.byteLimit {
            downloadTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}

    private static func allows(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil else { return false }

        let allowedPath: String
        switch url.host {
        case "a.espncdn.com":
            allowedPath = #"^/i/(teamlogos/(nfl|nba|mlb)/500(-dark)?/(scoreboard/)?[a-z0-9_-]+|headshots/(nfl|nba|mlb)/players/full/[0-9]+)\.png$"#
        case "cdn.nba.com":
            allowedPath = #"^/headshots/nba/latest/[0-9]+x[0-9]+/[0-9]+\.png$"#
        case "img.mlbstatic.com":
            allowedPath = #"^/mlb-photos/image/upload/[A-Za-z0-9_.,:/-]+/v1/people/[0-9]+/headshot/silo/current$"#
        case "static.www.nfl.com":
            allowedPath = #"^/image/upload/[A-Za-z0-9_.,/-]+$"#
        case "hkldweedwnxartkfhror.supabase.co":
            allowedPath = #"^/storage/v1/object/public/media/avatars/[a-fA-F0-9-]{36}/[a-fA-F0-9-]{36}\.(png|jpe?g|webp|gif|avif)$"#
        case "cdn.discordapp.com":
            allowedPath = #"^/avatars/[0-9]+/a?_[a-fA-F0-9]+\.(png|jpe?g|webp|gif)$|^/avatars/[0-9]+/[a-fA-F0-9]+\.(png|jpe?g|webp|gif)$"#
        case "pbs.twimg.com":
            allowedPath = #"^/profile_images/[0-9]+/[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif)$"#
        default:
            return false
        }
        let path = url.path(percentEncoded: true)
        return !path.contains("..") && path.range(of: allowedPath, options: .regularExpression) != nil
    }
}
