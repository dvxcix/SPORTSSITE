import SwiftUI

struct GameAlertSettings: View {
    let api: DiscoverAPI
    let query: [URLQueryItem]
    let matchup: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var palette
    @EnvironmentObject private var push: PushNotifications
    @State private var saved: Preferences?
    @State private var draft = Preferences()
    @State private var isAvailable: Bool?
    @State private var isSaving = false
    @State private var status: String?
    @State private var retry = 0

    private struct Preferences: Codable, Equatable {
        var scoring = false
        var major = false
        var milestone = false

        var enabled: Bool { scoring || major || milestone }
    }

    private struct Response: Decodable {
        let available: Bool
        let scoring: Bool
        let major: Bool
        let milestone: Bool

        var preferences: Preferences { .init(scoring: scoring, major: major, milestone: milestone) }
    }

    private var path: String { "/api/mobile/scores/game/alerts" }

    var body: some View {
        NavigationStack {
            Form {
                if isAvailable == true {
                    Section {
                        Toggle(isOn: $draft.scoring) {
                            Label("Scoring plays", systemImage: "sportscourt")
                        }
                        Toggle(isOn: $draft.major) {
                            Label("Big plays", systemImage: "bolt")
                        }
                        Toggle(isOn: $draft.milestone) {
                            Label("Period and final scores", systemImage: "clock")
                        }
                    } header: {
                        Text(matchup)
                    } footer: {
                        Text("These alerts apply to this game. They follow your account’s quiet hours and live game priority.")
                    }
                    .disabled(isSaving)
                    if push.state != .connected {
                        Section("This device") { DeviceAlertControl() }
                    }
                    if let status { Text(status).foregroundStyle(.secondary) }
                } else if isAvailable == false {
                    ContentUnavailableView("Game alerts unavailable", systemImage: "bell.slash")
                } else if let status {
                    Section {
                        Text(status)
                        Button("Try again") { retry += 1 }
                    }
                } else {
                    ProgressView("Loading game alerts")
                }
            }
            .scrollContentBackground(.hidden)
            .background(palette.background)
            .navigationTitle("Game alerts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(saved == draft ? "Close" : "Cancel") { dismiss() } }
                if isAvailable == true {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { Task { await save() } }
                            .disabled(isSaving || draft == saved || draft.enabled && push.state != .connected && saved?.enabled != true)
                    }
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
        .tint(palette.accent)
        .task(id: retry) { await load() }
    }

    private func load() async {
        status = nil
        do {
            let response = try await api.memberRead(Response.self, path: path, query: query, timeout: 10)
            isAvailable = response.available
            saved = response.preferences
            draft = response.preferences
        } catch let error as SlipSurgeHTTP.Status where error.code == 404 {
            isAvailable = false
        } catch {
            if !Task.isCancelled { status = "Couldn’t load game alerts." }
        }
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        status = nil
        defer { isSaving = false }
        do {
            let response = try await api.write(Response.self, path: path, query: query, body: draft, timeout: 15, method: "PUT")
            guard response.available else {
                isAvailable = false
                return
            }
            saved = response.preferences
            draft = response.preferences
            dismiss()
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            status = "Check that notifications are enabled and this game is upcoming or live."
        } catch {
            status = "Couldn’t save game alerts. Try again."
        }
    }
}
