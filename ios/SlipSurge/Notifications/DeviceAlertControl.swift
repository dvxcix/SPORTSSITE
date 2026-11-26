import SwiftUI

struct DeviceAlertControl: View {
    @EnvironmentObject private var push: PushNotifications
    @Environment(\.openURL) private var openURL
    @State private var requesting = false

    var body: some View {
        Group {
            switch push.state {
            case .unknown, .connecting:
                ProgressView("Checking device alerts")
            case .available:
                Button("Enable notifications", systemImage: "bell.badge") {
                    requesting = true
                    Task {
                        await push.requestPermission()
                        requesting = false
                    }
                }
                .disabled(requesting)
            case .authorized, .connected:
                Button(push.state == .connected ? "Notifications enabled on this device" : "Notifications allowed",
                    systemImage: "bell.badge.fill", action: showSettings)
                    .accessibilityHint("Opens iOS notification settings")
            case .off:
                Button("Open iOS notification settings", systemImage: "gear", action: showSettings)
            case .failed:
                Button("Retry device alerts", systemImage: "arrow.clockwise") { Task { await push.sync() } }
            case .unavailable:
                Label("Push is unavailable in this build", systemImage: "bell.slash")
                    .foregroundStyle(.secondary)
            }
        }
        .task { if push.state == .unknown { await push.sync() } }
    }

    private func showSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
    }
}
