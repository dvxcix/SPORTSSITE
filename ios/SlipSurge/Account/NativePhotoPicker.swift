import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct NativePhotoPicker: View {
    let title: String
    let upload: (NativeMediaUpload.Photo) async throws -> URL
    @Binding var url: URL?
    @Binding var uploading: Bool
    @State private var photo: PhotosPickerItem?

    var body: some View {
        let pending = uploading
        PhotosPicker(selection: $photo, matching: .images, preferredItemEncoding: .current) {
            if pending {
                ProgressView("Uploading photo")
            } else {
                Label(title, systemImage: "photo.on.rectangle")
            }
        }
        .disabled(uploading)
        .modifier(NativePhotoSelection(photo: $photo, url: $url, uploading: $uploading, upload: upload))
    }
}

struct NativePhotoSelection: ViewModifier {
    @Binding var photo: PhotosPickerItem?
    @Binding var url: URL?
    @Binding var uploading: Bool
    let upload: (NativeMediaUpload.Photo) async throws -> URL
    @State private var failed = false

    func body(content: Content) -> some View {
        content
            .task(id: photo) {
                guard let photo else { return }
                uploading = true
                defer { uploading = false }
                do {
                    guard let data = try await photo.loadTransferable(type: Data.self) else { throw URLError(.cannotDecodeContentData) }
                    let prepared = try await Task.detached(priority: .userInitiated) { try NativeMediaUpload.prepare(data) }.value
                    try Task.checkCancellation()
                    let result = try await upload(prepared)
                    try Task.checkCancellation()
                    url = result
                    self.photo = nil
                } catch {
                    if !Task.isCancelled { failed = true; self.photo = nil }
                }
            }
            .alert("Photo couldn’t upload", isPresented: $failed) {
                Button("OK", role: .cancel) {}
            } message: { Text("Choose a supported image and try again.") }
    }
}

enum NativeMediaUpload {
    struct Photo: Sendable { let data: Data; let mime: String; let extensionName: String }
    enum Kind: String {
        case avatars, banners, posts, messages, stories, changelog, emojis, badges
        case badgeCards = "badge-cards"
        case discordEmbeds = "discord-embeds"
        case socialPlatforms = "social-platforms"
    }

    static func prepare(_ data: Data) throws -> Photo {
        let limit = 4_100_000
        let supported: [UTType: (String, String)] = [.jpeg: ("image/jpeg", "jpg"), .png: ("image/png", "png"),
            .gif: ("image/gif", "gif"), .webP: ("image/webp", "webp")]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let raw = CGImageSourceGetType(source), let type = UTType(raw as String) else {
            throw URLError(.cannotDecodeContentData)
        }
        if let (mime, name) = supported[type], data.count < limit { return .init(data: data, mime: mime, extensionName: name) }
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2048] as CFDictionary) else {
            throw URLError(.cannotDecodeContentData)
        }
        let converted = NSMutableData()
        guard let output = CGImageDestinationCreateWithData(converted, UTType.jpeg.identifier as CFString, 1, nil) else { throw URLError(.cannotDecodeContentData) }
        CGImageDestinationAddImage(output, image, [kCGImageDestinationLossyCompressionQuality: 0.84] as CFDictionary)
        guard CGImageDestinationFinalize(output), converted.length < limit else { throw URLError(.dataLengthExceedsMaximum) }
        return .init(data: converted as Data, mime: "image/jpeg", extensionName: "jpg")
    }

    @MainActor
    static func upload(_ photo: Photo, kind: Kind, account: AccountStore, userID: UUID) async throws -> URL {
        let token = try await account.accessToken(for: userID)
        let url = try await send(photo, kind: kind, token: token, userID: userID)
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return url
    }

    static func send(_ photo: Photo, kind: Kind, token: String, userID: UUID) async throws -> URL {
        let boundary = UUID().uuidString
        let id = userID.uuidString.lowercased()
        var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/upload", timeout: 35)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var payload = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\n\(kind.rawValue)\r\n".utf8)
        payload.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"expectedUserId\"\r\n\r\n\(id)\r\n".utf8))
        payload.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.\(photo.extensionName)\"\r\nContent-Type: \(photo.mime)\r\n\r\n".utf8))
        payload.append(photo.data)
        payload.append(Data("\r\n--\(boundary)--\r\n".utf8))
        request.httpBody = payload
        struct Result: Decodable { let publicUrl: URL }
        let result = try JSONDecoder().decode(Result.self, from: await SlipSurgeHTTP.send(request)).publicUrl
        guard FeedPostCard.allowedMedia(result), result.path.hasPrefix("/storage/v1/object/public/media/\(kind.rawValue)/\(id)/") else {
            throw URLError(.cannotParseResponse)
        }
        return result
    }
}
