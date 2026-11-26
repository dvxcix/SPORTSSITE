import SwiftUI

struct AccountDeletionView: View {
    let account: AccountStore
    let userID: UUID
    let hasPaidPlan: Bool

    @Environment(\.slipPalette) private var slipPalette
    @State private var current: Request?
    @State private var loaded = false
    @State private var busy = false
    @State private var confirmation = ""
    @State private var reason = ""
    @State private var submitting = false
    @State private var failure: String?

    private static let path = "/api/account/deletion"

    private struct Request: Decodable {
        let status: String
        let requested_at: String
        let scheduled_for: String?
        let resolution_note: String?

        var isOpen: Bool { ["pending", "reviewing", "scheduled", "blocked"].contains(status) }
    }

    var body: some View {
        Form {
            if let current {
                Section("Deletion request") {
                    LabeledContent("Status", value: current.status.capitalized)
                    if let requested = SidelineBoard.timestamp(current.requested_at) {
                        LabeledContent("Requested", value: requested.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let scheduled = current.scheduled_for.flatMap(SidelineBoard.timestamp) {
                        LabeledContent("Scheduled", value: scheduled.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let note = current.resolution_note { Text(verbatim: note).foregroundStyle(.secondary) }
                    if current.status != "scheduled" {
                        Button("Cancel deletion request") { Task { await cancel() } }
                    }
                }.listRowBackground(slipPalette.surface)
            } else if loaded {
                Section {
                    if hasPaidPlan {
                        Label("Manage your paid membership before deleting your account. Deletion does not cancel billing.", systemImage: "exclamationmark.triangle")
                    }
                    TextField("Optional reason", text: $reason, axis: .vertical).lineLimit(2...5)
                        .onChange(of: reason) { _, value in reason = String(value.prefix(1000)) }
                    TextField("Type DELETE to confirm", text: $confirmation)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Button("Request account deletion", role: .destructive) { submitting = true }
                        .disabled(confirmation != "DELETE")
                } header: { Text("Permanent deletion") }
                footer: { Text("SlipSurge will confirm by email before removing your account and data.") }
                .listRowBackground(slipPalette.surface)
            } else if failure == nil {
                ProgressView("Checking deletion status")
            } else {
                Button("Retry") { Task { await load() } }
            }
            if let failure { Label(failure, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(busy)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Request permanent account deletion?", isPresented: $submitting, titleVisibility: .visible) {
            Button("Request deletion", role: .destructive) { Task { await requestDeletion() } }
        }
    }

    private func load() async {
        struct Result: Decodable { let requests: [Request] }
        do {
            let data = try await SlipSurgeHTTP.memberData(Self.path, account: account, userID: userID)
            current = try JSONDecoder().decode(Result.self, from: data).requests.first(where: \.isOpen)
            loaded = true
            failure = nil
        } catch { if !Task.isCancelled { failure = "Deletion status couldn’t load." } }
    }

    private func requestDeletion() async {
        guard !busy, confirmation == "DELETE" else { return }
        busy = true
        defer { busy = false }
        do {
            let body = try JSONEncoder().encode(["confirmation": confirmation, "reason": reason])
            _ = try await AccountPrivacyRequest.send(Self.path, method: "POST", account: account, userID: userID, body: body)
            confirmation = ""
            reason = ""
            await load()
        } catch { failure = "The deletion request couldn’t be confirmed. Refresh the status and try again." }
    }

    private func cancel() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await AccountPrivacyRequest.send(Self.path, method: "DELETE", account: account, userID: userID)
            await load()
        } catch { failure = "The cancellation couldn’t be confirmed. Refresh the status and try again." }
    }
}
