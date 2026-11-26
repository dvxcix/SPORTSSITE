import SwiftUI
import WebKit

struct AdminEmailOperationsView: View {
    private enum Template: String, CaseIterable, Identifiable {
        case welcome, notification, security, billing
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .welcome: "hand.wave"
            case .notification: "bell"
            case .security: "lock.shield"
            case .billing: "creditcard"
            }
        }
    }

    private struct Snapshot: Decodable {
        struct Configuration: Decodable { let api: Bool; let domain: Bool; let webhooks: Bool; let authTemplates: Bool }
        struct Counts: Decodable { let sent: Int?; let failed: Int?; let webhookFailures: Int? }
        struct Delivery: Decodable, Identifiable {
            let id: Int64
            let status: String
            let providerStatus: Int?
            let providerMessage: String?
            let providerEvent: String?
            let hasError: Bool
            let attemptedAt: String
        }
        let configuration: Configuration
        let counts: Counts
        let recent: [Delivery]
    }

    private struct TemplateBody: Decodable { let html: String }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var snapshot: Snapshot?
    @State private var issue: (any Error)?
    @State private var selected: Template?
    @State private var confirmation = false
    @State private var sending = false
    @State private var pendingTest: UUID?
    @State private var sendResult: String?
    @State private var revision = 0

    private static let path = "/api/mobile/admin/email"

    var body: some View {
        List {
            if let snapshot {
                sections(snapshot)
            } else {
                ResearchToolMessage(title: "Email operations couldn’t load", error: issue) { revision += 1 }
            }
        }
        .navigationTitle("Email operations")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Send me a test", systemImage: "paperplane") { confirmation = true }
                    .disabled(sending || snapshot?.configuration.api != true)
            }
        }
        .confirmationDialog("Send a test email to your account?", isPresented: $confirmation, titleVisibility: .visible) {
            Button(pendingTest == nil ? "Send test email" : "Retry test email") { Task { await sendTest() } }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $selected) { template in
            NavigationStack {
                AdminEmailPreview(title: template.title) {
                    try await api.memberRead(TemplateBody.self, path: Self.path, query: [.init(name: "template", value: template.rawValue)]).html
                }
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { selected = nil } } }
            }.presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder private func sections(_ data: Snapshot) -> some View {
        if sending || sendResult != nil {
            Section {
                if sending { ProgressView("Sending test email") }
                if let sendResult { Text(sendResult).font(.subheadline) }
            }
        }
        Section("Configuration") {
            readiness("Resend API", data.configuration.api)
            readiness("Sender domain", data.configuration.domain)
            readiness("Signed webhooks", data.configuration.webhooks)
            readiness("Auth templates", data.configuration.authTemplates)
        }
        Section("Last 7 days") {
            LabeledContent("Sent", value: data.counts.sent?.formatted() ?? "Unavailable")
            LabeledContent("Delivery failures", value: data.counts.failed?.formatted() ?? "Unavailable")
            LabeledContent("Webhook failures", value: data.counts.webhookFailures?.formatted() ?? "Unavailable")
        }
        Section("Template previews") {
            ForEach(Template.allCases) { template in
                Button { selected = template } label: {
                    Label(template.title, systemImage: template.icon)
                }
            }
        }
        Section("Recent deliveries") {
            if data.recent.isEmpty { Text("No delivery attempts recorded").foregroundStyle(.secondary) }
            ForEach(data.recent) { entry in
                DisclosureGroup {
                    if let providerID = entry.providerMessage { LabeledContent("Message reference", value: providerID + "…") }
                    if let status = entry.providerStatus { LabeledContent("Provider status", value: status.formatted()) }
                    if entry.hasError { Label("Provider reported an error", systemImage: "exclamationmark.circle").font(.caption) }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.status.capitalized).font(.headline)
                        let event = entry.providerEvent ?? (entry.status == "sent" ? "API accepted" : "No provider event")
                        Text(event).font(.subheadline).foregroundStyle(.secondary)
                        if let date = SidelineBoard.timestamp(entry.attemptedAt) {
                            Text(date, format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func readiness(_ label: String, _ ready: Bool) -> some View {
        LabeledContent(label) {
            Label(ready ? "Ready" : "Needs setup", systemImage: ready ? "checkmark.circle.fill" : "exclamationmark.circle")
                .foregroundStyle(ready ? Brand.signal(1, for: scheme) : .orange)
        }
    }

    private func load() async {
        do {
            let result = try await api.memberRead(Snapshot.self, path: Self.path)
            try Task.checkCancellation()
            snapshot = result
            issue = nil
        } catch { if !Task.isCancelled { issue = error } }
    }

    private func sendTest() async {
        guard !sending, let userID = api.userID else { return }
        sending = true
        sendResult = nil
        let attempt = pendingTest ?? UUID()
        pendingTest = attempt
        defer { sending = false }
        do {
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: "/api/admin/email/test", timeout: 30)
            request.httpMethod = "POST"
            request.setValue("Bearer \(try await api.account.accessToken(for: userID))", forHTTPHeaderField: "Authorization")
            request.setValue(attempt.uuidString, forHTTPHeaderField: "Idempotency-Key")
            _ = try await SlipSurgeHTTP.send(request)
            guard api.account.memberID == userID else { return }
            pendingTest = nil
            sendResult = "The provider accepted your test email."
            await load()
        } catch {
            if api.account.memberID == userID { sendResult = "The test email couldn’t be confirmed. You can retry the same send." }
        }
    }
}

private struct AdminEmailPreview: View {
    let title: String
    let load: () async throws -> String
    @State private var html: String?
    @State private var error: (any Error)?
    @State private var revision = 0

    var body: some View {
        Group {
            if let html { EmailDocument(html: html) }
            else { ResearchToolMessage(title: "Email preview couldn’t load", error: error) { revision += 1 }.padding(16) }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) {
            do {
                let value = try await load()
                try Task.checkCancellation()
                html = value
            } catch { if !Task.isCancelled { self.error = error } }
        }
    }
}

private struct EmailDocument: UIViewRepresentable {
    let html: String

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            let url = navigationAction.request.url
            return navigationAction.navigationType == .other && url?.absoluteString == "about:blank" ? .allow : .cancel
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.loadHTMLString(html, baseURL: nil)
        return webView
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}
