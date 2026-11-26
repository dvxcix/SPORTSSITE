import SwiftUI

struct NativeResumeLocation: Equatable {
    let path: String
    let title: String
    var scrollY = 0

    static func feed(filter: FeedFilter, sport: String, scroll: Int = 0, anchor: UUID? = nil) -> Self {
        let items = [URLQueryItem(name: "filter", value: filter == .latest ? nil : filter.rawValue),
            URLQueryItem(name: "sport", value: sport.isEmpty ? nil : sport.lowercased()),
            URLQueryItem(name: "iosPost", value: anchor?.uuidString.lowercased())].filter { $0.value != nil }
        var components = URLComponents()
        components.path = "/feed"
        components.queryItems = items.isEmpty ? nil : items
        return Self(path: components.string ?? "/feed", title: filter == .latest ? "Feed" : "Feed · " + filter.rawValue.capitalized,
            scrollY: scroll)
    }

    static func destination(_ url: URL, title: String? = nil) -> Self? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil, components.port == nil,
              components.percentEncodedPath.hasPrefix("/"), !components.percentEncodedPath.hasPrefix("//"),
              !components.percentEncodedPath.contains("\\") else { return nil }
        let privateKeys = ["code", "token", "access_token", "refresh_token", "state", "secret", "receipt", "password",
            "nonce", "signature", "checkoutid", "checkout_id", "sessionid", "session_id", "paymentid", "payment_id", "refresh"]
        var fragment = URLComponents()
        fragment.percentEncodedQuery = components.percentEncodedFragment
        let keys = (components.queryItems ?? []) + (fragment.queryItems ?? [])
        guard !keys.contains(where: { privateKeys.contains($0.name.lowercased()) }) else { return nil }
        let pathname = components.percentEncodedPath
        guard !pathname.lowercased().hasPrefix("/admin"), !pathname.lowercased().hasPrefix("/auth"),
              !pathname.lowercased().hasPrefix("/api"), !pathname.hasSuffix("/create"), !pathname.hasSuffix("/new") else { return nil }
        var path = pathname
        if let query = components.percentEncodedQuery, !query.isEmpty { path += "?" + query }
        if let anchor = components.percentEncodedFragment, !anchor.isEmpty { path += "#" + anchor }
        guard path.utf8.count <= 900, let native = URL(string: "https://" + SlipSurgeHTTP.site + path),
              ResearchDeepLink(native) != nil || NativeSiteLink(native) != nil else { return nil }
        let savedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        return Self(path: path, title: savedTitle.flatMap { $0.isEmpty || $0.hasPrefix("SlipSurge | ") ? nil : $0 }
            ?? label(pathname, target: NativeSiteLink(native)))
    }

    private static func label(_ path: String, target: NativeSiteLink?) -> String {
        if case .community(_, .settings) = target { return "Community settings" }
        return switch path {
        case "/the-paint", "/nba": "The Court"
        case "/the-sideline": "The Sideline"
        case "/dugout": "The Dugout"
        case "/sports", "/scores": "Live Scores"
        case "/picks": "My Picks"
        case "/", "/feed", "/home": "Feed"
        default:
            String((path.split(separator: "/").first ?? "SlipSurge").replacingOccurrences(of: "-", with: " ").capitalized.prefix(160))
        }
    }
}

private struct NativeResumeAPI {
    struct Record: Decodable {
        let path: String
        let pageTitle: String?
        let scrollY: Int
        let updatedAt: String
    }

    struct Snapshot: Decodable {
        let saved: Record?
        let version: String?
    }

    private struct Change: Encodable {
        let path: String
        let pageTitle: String
        let scrollY: Int
        let expectedVersion: String?
    }

    let viewer: DiscoverAPI
    private let path = "/api/mobile/resume"

    func load() async throws -> Snapshot {
        try await viewer.memberRead(Snapshot.self, path: path, keyDecodingStrategy: .convertFromSnakeCase)
    }

    func save(_ location: NativeResumeLocation, expected: String?) async throws -> Snapshot {
        try await viewer.write(Snapshot.self, path: path, body: Change(path: location.path, pageTitle: location.title,
            scrollY: location.scrollY, expectedVersion: expected), keyDecodingStrategy: .convertFromSnakeCase)
    }
}

@MainActor
@Observable
final class NativeResumeStore {
    struct Offer: Equatable {
        let url: URL
        let title: String
        let scrollY: Int
        let version: String
    }

    struct FeedRestore: Equatable {
        let id = UUID()
        let selection: NativeFeedSelection
        let offset: Int
        let anchor: UUID?
    }

    private(set) var offer: Offer?
    private(set) var feedRestore: FeedRestore?
    @ObservationIgnored private var owner: UUID?
    @ObservationIgnored private var version: String?
    @ObservationIgnored private var dismissedVersion: String?
    @ObservationIgnored private var observedWrite = false
    @ObservationIgnored private var active: NativeResumeLocation?
    @ObservationIgnored private var lastSaved: NativeResumeLocation?
    @ObservationIgnored private var pendingSave: Task<Void, Never>?
    @ObservationIgnored private var syncing = false

    func refresh(account: AccountStore, userID: UUID?) async {
        if owner != userID {
            pendingSave?.cancel()
            pendingSave = nil
            owner = userID
            version = nil
            dismissedVersion = nil
            observedWrite = false
            active = nil
            lastSaved = nil
            offer = nil
            feedRestore = nil
            syncing = false
        }
        guard let userID, !syncing else { return }
        let started = version
        let api = NativeResumeAPI(viewer: .init(account: account, userID: userID))
        guard let snapshot = try? await api.load(), !Task.isCancelled, owner == userID,
              account.memberID == userID, version == started, !syncing else { return }
        apply(snapshot)
    }

    func record(_ location: NativeResumeLocation, account: AccountStore, interaction: Bool = false) {
        guard let userID = account.memberID, userID == owner, active != location else { return }
        active = location
        if interaction { dismiss() }
        guard observedWrite, offer == nil, interaction || lastSaved != nil else { return }
        pendingSave?.cancel()
        let research = location.path.hasPrefix("/the-paint?") || location.path.hasPrefix("/the-sideline?")
        pendingSave = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(research ? 2 : 30)) } catch { return }
            await self?.flush(account: account)
        }
    }

    func flush(account: AccountStore) async {
        guard let userID = owner, userID == account.memberID, observedWrite, !syncing,
              let active, active != lastSaved, offer == nil else { return }
        syncing = true
        let api = NativeResumeAPI(viewer: .init(account: account, userID: userID))
        defer { if owner == userID { syncing = false } }
        do {
            let saved = try await api.save(active, expected: version)
            guard owner == userID, account.memberID == userID else { return }
            version = saved.version
            lastSaved = active
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            guard let saved = try? await api.load(), owner == userID, account.memberID == userID else { return }
            apply(saved)
        } catch {
            // A transient write leaves the last observed version eligible for the next flush.
        }
    }

    func dismiss() {
        if let offer { dismissedVersion = offer.version }
        offer = nil
    }

    func select(_ offer: Offer) {
        if let destination = NativeSiteLink(offer.url), case .feed(let selection) = destination {
            let anchor = URLComponents(url: offer.url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "iosPost" }?.value
            feedRestore = FeedRestore(selection: selection, offset: offer.scrollY, anchor: anchor.flatMap(UUID.init(uuidString:)))
        }
        dismiss()
    }

    func restoredFeed(_ intent: FeedRestore) {
        if feedRestore?.id == intent.id { feedRestore = nil }
    }

    private func apply(_ snapshot: NativeResumeAPI.Snapshot) {
        version = snapshot.version
        observedWrite = true
        guard let record = snapshot.saved, record.updatedAt != dismissedVersion,
              let url = URL(string: "https://" + SlipSurgeHTTP.site + record.path),
              let location = NativeResumeLocation.destination(url, title: record.pageTitle),
              (location.path != active?.path || record.scrollY != active?.scrollY),
              (0...10_000_000).contains(record.scrollY) else {
            offer = nil
            return
        }
        offer = Offer(url: url, title: location.title, scrollY: record.scrollY, version: record.updatedAt)
    }
}

extension EnvironmentValues {
    @Entry var nativeResume: NativeResumeStore?
    @Entry var nativeResumeActive = false
}
