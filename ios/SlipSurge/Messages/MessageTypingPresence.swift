import Foundation
import Observation

@MainActor @Observable
final class MessageTypingPresence {
    private struct Frame: Decodable {
        struct Meta: Decodable {
            let phx_ref: String
            let phx_ref_prev: String?
            let user_id: UUID?
            let typing: Bool?
        }

        struct Member: Decodable { let metas: [Meta] }
        struct Difference: Decodable { let joins: [String: Member]; let leaves: [String: Member] }
        struct Reply: Decodable { let status: String }

        let topic: String
        let event: String
        let ref: String?
        var members: [String: Member]?
        var changes: Difference?
        var reply: Reply?

        private enum CodingKeys: String, CodingKey { case topic, event, ref, payload }

        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            topic = try values.decode(String.self, forKey: .topic)
            event = try values.decode(String.self, forKey: .event)
            ref = try values.decodeIfPresent(String.self, forKey: .ref)
            switch event {
            case "presence_state": members = try values.decode([String: Member].self, forKey: .payload)
            case "presence_diff": changes = try values.decode(Difference.self, forKey: .payload)
            case "phx_reply": reply = try values.decode(Reply.self, forKey: .payload)
            default: break
            }
        }
    }

    private(set) var count = 0
    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var heartbeat: Task<Void, Never>?
    @ObservationIgnored private var typingTimer: Task<Void, Never>?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var receivedInitialState = false
    @ObservationIgnored private var buffered: [Frame.Difference] = []
    @ObservationIgnored private var peers: [String: Frame.Meta] = [:]
    @ObservationIgnored private var typing = false
    @ObservationIgnored private var joined = false
    @ObservationIgnored private var reference = 1
    @ObservationIgnored private var activeTopic = ""
    @ObservationIgnored private var actorID: UUID?

    func run(account: AccountStore, userID: UUID, destination: MessageDestination) async {
        stop()
        guard destination.kind != .group, let url = AccountAPI().realtimeURL() else { return }
        let room: String
        switch destination.kind {
        case .direct: room = "dm:" + [userID, destination.id].map { $0.uuidString.lowercased() }.sorted().joined(separator: ":")
        case .channel: room = "channel:" + destination.id.uuidString.lowercased()
        case .group: return
        }
        let key = generation
        while !Task.isCancelled, generation == key, account.memberID == userID {
            let mayReconnect = await connect(url, account: account, userID: userID, destination: destination,
                topic: "realtime:presence:" + room, generation: key)
            guard mayReconnect, generation == key, !Task.isCancelled else { break }
            do { try await Task.sleep(for: .seconds(4)) } catch { break }
        }
        if generation == key { stop() }
    }

    func didType(hasText: Bool) {
        guard joined, let socket else { return }
        typingTimer?.cancel()
        if typing != hasText {
            typing = hasText
            update(socket)
        }
        guard hasText else { return }
        typingTimer = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(1400)) } catch { return }
            self?.didType(hasText: false)
        }
    }

    func stop() {
        generation = UUID()
        resetSocket()
    }

    private func resetSocket() {
        heartbeat?.cancel()
        typingTimer?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        peers = [:]
        buffered = []
        receivedInitialState = false
        joined = false
        typing = false
        count = 0
        reference = 1
        activeTopic = ""
        actorID = nil
    }

    private func connect(_ url: URL, account: AccountStore, userID: UUID, destination: MessageDestination,
        topic: String, generation key: UUID) async -> Bool {
        guard let token = try? await account.accessToken(for: userID), generation == key, !Task.isCancelled else { return false }
        let session = URLSession(configuration: .ephemeral)
        let connection = session.webSocketTask(with: url)
        connection.maximumMessageSize = 128_000
        socket = connection
        activeTopic = topic
        actorID = userID
        connection.resume()
        defer {
            session.invalidateAndCancel()
            if socket == connection { resetSocket() }
        }

        do {
            let config: [String: Any] = ["broadcast": ["ack": false, "self": false],
                "presence": ["enabled": true, "key": userID.uuidString.lowercased()], "private": false, "postgres_changes": [String]()]
            try await push("phx_join", to: topic, socket: connection, payload: ["config": config, "access_token": token], ref: "1")
            heartbeat = Task { [weak self] in
                guard let self else { return }
                var previousToken = token
                while !Task.isCancelled {
                    do {
                        try await Task.sleep(for: .seconds(24))
                        guard self.socket == connection, self.joined else { connection.cancel(); return }
                        let current = try await account.accessToken(for: userID)
                        guard self.socket == connection, !Task.isCancelled else { return }
                        if current != previousToken {
                            try await self.push("access_token", to: topic, socket: connection, payload: ["access_token": current])
                            previousToken = current
                        }
                        try await self.push("heartbeat", to: "phoenix", socket: connection, payload: [:])
                    } catch {
                        if !Task.isCancelled { connection.cancel() }
                        return
                    }
                }
            }
            return try await withTaskCancellationHandler {
                while !Task.isCancelled, generation == key {
                    let message = try await connection.receive()
                    let data: Data
                    switch message {
                    case .string(let text): data = Data(text.utf8)
                    case .data(let bytes): data = bytes
                    @unknown default: continue
                    }
                    guard data.count <= 128_000, let frame = try? JSONDecoder().decode(Frame.self, from: data), frame.topic == topic else { continue }
                    if !consume(frame, socket: connection, userID: userID, partner: destination.kind == .direct ? destination.id : nil) { return true }
                }
                return false
            } onCancel: { connection.cancel(with: .goingAway, reason: nil) }
        } catch { return !Task.isCancelled }
    }

    private func consume(_ frame: Frame, socket: URLSessionWebSocketTask, userID: UUID, partner: UUID?) -> Bool {
        switch frame.event {
        case "phx_reply" where frame.ref == "1":
            guard frame.reply?.status == "ok" else { return false }
            joined = true
            update(socket)
        case "presence_state":
            peers.removeAll(keepingCapacity: true)
            for member in frame.members?.values ?? [:].values { merge(member.metas) }
            receivedInitialState = true
            for difference in buffered { apply(difference) }
            buffered.removeAll()
        case "presence_diff":
            if let changes = frame.changes {
                if receivedInitialState { apply(changes) }
                else if buffered.count < 32 { buffered.append(changes) }
            }
        case "phx_error", "phx_close": return false
        default: break
        }
        count = Set(peers.values.compactMap { entry in
            guard entry.typing == true, let id = entry.user_id, id != userID, partner == nil || partner == id else { return nil as UUID? }
            return id
        }).count
        return true
    }

    private func merge(_ entries: [Frame.Meta]) {
        for entry in entries {
            if let previous = entry.phx_ref_prev { peers.removeValue(forKey: previous) }
            peers[entry.phx_ref] = entry
        }
    }

    private func apply(_ changes: Frame.Difference) {
        for member in changes.leaves.values { for entry in member.metas { peers.removeValue(forKey: entry.phx_ref) } }
        for member in changes.joins.values { merge(member.metas) }
    }

    private func update(_ connection: URLSessionWebSocketTask) {
        guard let actorID else { return }
        let topic = activeTopic
        let isTyping = typing
        Task { [weak self] in
            guard let self, self.socket == connection, self.typing == isTyping else { return }
            try? await self.push("presence", to: topic, socket: connection, payload: ["event": "track", "type": "presence", "payload": [
                "user_id": actorID.uuidString.lowercased(), "label": topic.contains(":dm:") ? "Someone" : "Member", "typing": isTyping,
            ]])
        }
    }

    private func push(_ event: String, to topic: String, socket: URLSessionWebSocketTask, payload: [String: Any], ref: String? = nil) async throws {
        if ref == nil { reference += 1 }
        var frame: [String: Any] = ["topic": topic, "event": event, "payload": payload, "ref": ref ?? String(reference)]
        if topic != "phoenix" { frame["join_ref"] = "1" }
        let data = try JSONSerialization.data(withJSONObject: frame)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }
}
