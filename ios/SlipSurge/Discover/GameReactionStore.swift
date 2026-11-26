import Foundation
import Observation

@MainActor @Observable
final class GameReactionStore {
    typealias Totals = [String: GameCenterData.Play.Reaction]

    private struct Row: Decodable {
        let id: UUID
        let play_id: String
        let user_id: UUID
        let emoji: String
    }

    private struct Frame: Decodable {
        struct Payload: Decodable {
            struct Change: Decodable {
                struct Record: Decodable { let id: UUID?; let game_id: String? }
                let type: String
                let table: String
                let record: Record?
                let old_record: Record?
            }
            let status: String?
            let data: Change?
        }

        let topic: String
        let event: String
        let ref: String?
        let payload: Payload?
    }

    private var totals: [String: Totals]?
    @ObservationIgnored private var rows = Set<UUID>()
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var queuedRead: Task<Void, Never>?
    @ObservationIgnored private var reading = false
    @ObservationIgnored private var dirty = false
    @ObservationIgnored private var generation = UUID()

    func reactions(for play: String, fallback: Totals) -> Totals {
        guard let totals else { return fallback }
        return totals[play] ?? [:]
    }

    func run(game: String, account: AccountStore, userID: UUID) async {
        let key = UUID()
        generation = key
        queuedRead?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        totals = nil
        rows = []
        reading = false
        dirty = false

        await withTaskGroup(of: Void.self) { group in
            group.addTask { [self] in
                while !Task.isCancelled, await account.memberID == userID {
                    await reload(game: game, account: account, userID: userID, generation: key)
                    do { try await Task.sleep(for: .seconds(16)) } catch { return }
                }
            }
            group.addTask { [self] in
                guard let url = AccountAPI().realtimeURL() else { return }
                while !Task.isCancelled, await account.memberID == userID {
                    await connect(url: url, game: game, account: account, userID: userID, generation: key)
                    do { try await Task.sleep(for: .seconds(3)) } catch { return }
                }
            }
        }
        if generation == key { queuedRead?.cancel(); socket?.cancel(with: .goingAway, reason: nil) }
    }

    static func set(_ emoji: String, enabled: Bool, for play: String, in game: String,
                    account: AccountStore, userID: UUID) async throws {
        struct Body: Encodable {
            let p_game: String
            let p_play: String
            let p_emoji: String
            let p_enabled: Bool
        }
        let api = AccountAPI()
        var request = try api.authRequest("/rest/v1/rpc/set_native_play_reaction", query: [])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Body(p_game: game, p_play: play, p_emoji: emoji, p_enabled: enabled))
        let data = try await send(request, account: account, userID: userID)
        guard try JSONDecoder().decode(Bool.self, from: data) else { throw URLError(.cannotParseResponse) }
    }

    func refresh(game: String, account: AccountStore, userID: UUID) async {
        await reload(game: game, account: account, userID: userID, generation: generation)
    }

    private func reload(game: String, account: AccountStore, userID: UUID, generation key: UUID) async {
        guard generation == key, !Task.isCancelled else { return }
        if reading { dirty = true; return }
        reading = true
        defer { if generation == key { reading = false } }
        repeat {
            dirty = false
            do {
                let incoming = try await Self.read(game: game, account: account, userID: userID)
                guard generation == key, !Task.isCancelled else { return }
                rows = Set(incoming.map(\.id))
                var next: [String: Totals] = [:]
                for row in incoming {
                    let previous = next[row.play_id]?[row.emoji]
                    next[row.play_id, default: [:]][row.emoji] = .init(
                        count: (previous?.count ?? 0) + 1, mine: previous?.mine == true || row.user_id == userID)
                }
                if totals != next { totals = next }
            } catch { }
        } while dirty && generation == key && !Task.isCancelled
    }

    private static func read(game: String, account: AccountStore, userID: UUID) async throws -> [Row] {
        var rows: [Row] = []
        var cursor: UUID?
        repeat {
            var query: [URLQueryItem] = [
                .init(name: "game_id", value: "eq.\(game)"), .init(name: "select", value: "id,play_id,user_id,emoji"),
                .init(name: "order", value: "id.asc"), .init(name: "limit", value: "500"),
            ]
            if let cursor { query.append(.init(name: "id", value: "gt.\(cursor.uuidString.lowercased())")) }
            var request = try AccountAPI().authRequest("/rest/v1/play_reactions", query: query)
            request.httpMethod = "GET"
            let data = try await send(request, account: account, userID: userID)
            let page = try JSONDecoder().decode([Row].self, from: data)
            rows += page
            cursor = page.count == 500 ? page.last?.id : nil
        } while cursor != nil && !Task.isCancelled
        return rows
    }

    private static func send(_ original: URLRequest, account: AccountStore, userID: UUID) async throws -> Data {
        var request = original
        let token = try await account.accessToken(for: userID)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let result: Data
        do {
            result = try await SlipSurgeHTTP.send(request)
        } catch let status as SlipSurgeHTTP.Status where status.code == 401 {
            let renewed = try await account.accessToken(for: userID, replacing: token)
            request.setValue("Bearer \(renewed)", forHTTPHeaderField: "Authorization")
            result = try await SlipSurgeHTTP.send(request)
        }
        try Task.checkCancellation()
        guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
        return result
    }

    private func connect(url: URL, game: String, account: AccountStore, userID: UUID, generation key: UUID) async {
        guard let token = try? await account.accessToken(for: userID), generation == key, !Task.isCancelled else { return }
        let session = URLSession(configuration: .ephemeral)
        let connection = session.webSocketTask(with: url)
        connection.maximumMessageSize = 96_000
        socket = connection
        connection.resume()
        defer {
            session.invalidateAndCancel()
            if socket == connection { socket = nil }
        }

        let topic = "realtime:game-reactions:\(game)"
        do {
            // Deletes only contain the primary key and cannot use this game's row filter.
            let changes = [
                ["schema": "public", "table": "play_reactions", "event": "INSERT", "filter": "game_id=eq.\(game)"],
                ["schema": "public", "table": "play_reactions", "event": "UPDATE", "filter": "game_id=eq.\(game)"],
                ["schema": "public", "table": "play_reactions", "event": "DELETE"],
            ]
            try await Self.sendFrame(on: connection, topic: topic, event: "phx_join", ref: "1", payload: [
                "config": ["broadcast": ["ack": false, "self": false], "presence": ["enabled": false],
                           "postgres_changes": changes, "private": false],
                "access_token": token,
            ])

            let heartbeat = Task {
                var reference = 2
                var previous = token
                while !Task.isCancelled {
                    do {
                        try await Task.sleep(for: .seconds(25))
                        let current = try await account.accessToken(for: userID)
                        if current != previous {
                            try await Self.sendFrame(on: connection, topic: topic, event: "access_token",
                                                     ref: String(reference), payload: ["access_token": current])
                            previous = current
                            reference += 1
                        }
                        try await Self.sendFrame(on: connection, topic: "phoenix", event: "heartbeat",
                                                 ref: String(reference), payload: [:])
                        reference += 1
                    } catch {
                        if !Task.isCancelled { connection.cancel() }
                        return
                    }
                }
            }
            defer { heartbeat.cancel() }

            try await withTaskCancellationHandler {
                while !Task.isCancelled, generation == key {
                    let message = try await connection.receive()
                    let data: Data
                    switch message {
                    case .data(let value): data = value
                    case .string(let value): data = Data(value.utf8)
                    @unknown default: continue
                    }
                    guard let frame = try? JSONDecoder().decode(Frame.self, from: data), frame.topic == topic else { continue }
                    if frame.event == "phx_error" || frame.event == "phx_close" { return }
                    if frame.event == "phx_reply", frame.ref == "1" {
                        guard frame.payload?.status == "ok" else { return }
                        scheduleRead(game: game, account: account, userID: userID, generation: key)
                    }
                    if frame.event == "postgres_changes", let change = frame.payload?.data, change.table == "play_reactions",
                       change.record?.game_id == game || change.old_record?.id.map(rows.contains) == true {
                        scheduleRead(game: game, account: account, userID: userID, generation: key)
                    }
                }
            } onCancel: {
                connection.cancel(with: .goingAway, reason: nil)
            }
        } catch { }
    }

    private func scheduleRead(game: String, account: AccountStore, userID: UUID, generation key: UUID) {
        guard queuedRead == nil || queuedRead?.isCancelled == true else { return }
        queuedRead = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(45)) } catch { return }
            guard let self, generation == key else { return }
            queuedRead = nil
            await reload(game: game, account: account, userID: userID, generation: key)
        }
    }

    private static func sendFrame(on socket: URLSessionWebSocketTask, topic: String, event: String, ref: String,
                                  payload: [String: Any]) async throws {
        var frame: [String: Any] = ["topic": topic, "event": event, "ref": ref, "payload": payload]
        if topic != "phoenix" { frame["join_ref"] = "1" }
        let data = try JSONSerialization.data(withJSONObject: frame)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }
}
