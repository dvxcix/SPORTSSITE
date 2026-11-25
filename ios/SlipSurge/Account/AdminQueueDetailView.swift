import SwiftUI

struct AdminQueueDetailView: View {
    let account: AccountStore
    let userID: UUID
    let queue: AdminQueue
    let entry: AdminQueueRecord
    let didChange: () -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var action: Decision?
    @State private var result: String?

    private struct Decision: Identifiable {
        let id: String
        let label: String
        var destructive = false
    }

    private var status: String { result ?? entry.status }
    private var decisions: [Decision] {
        switch queue {
        case .reports:
            status == "pending" ? [.init(id: "actioned", label: "Record moderation action"), .init(id: "dismissed", label: "Dismiss report")] : []
        case .applications:
            status == "pending" ? [.init(id: "approved", label: "Approve application"), .init(id: "rejected", label: "Reject application", destructive: true)] : []
        case .deletions:
            if ["pending", "reviewing", "blocked"].contains(status) {
                (status == "pending" ? [.init(id: "reviewing", label: "Start review")] : []) + [
                    .init(id: "blocked", label: "Block request"), .init(id: "scheduled", label: "Schedule deletion", destructive: true),
                    .init(id: "canceled", label: "Cancel deletion request"),
                ]
            } else { [] }
        }
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("Status", value: status.capitalized)
                if let date = entry.date { LabeledContent("Submitted", value: date.formatted(date: .abbreviated, time: .shortened)) }
                if let kind = entry.targetType { LabeledContent("Content", value: kind.capitalized) }
                if let reason = entry.reason { Text(verbatim: reason).font(.headline) }
                if let context = entry.context, context != entry.reason { Text(verbatim: context) }
                if let preview = entry.preview { Text(verbatim: preview).font(.subheadline).foregroundStyle(.secondary) }
                if let id = entry.linkedPostId {
                    NavigationLink {
                        FeedThreadView(api: .init(account: account, userID: userID), id: id)
                    } label: { Label("Open post", systemImage: "bubble.left") }
                }
                if let username = entry.linkedUsername {
                    NavigationLink {
                        MemberProfileView(api: .init(account: account, userID: userID), target: username)
                    } label: { Label("Open reported profile", systemImage: "person.crop.circle") }
                }
            }.listRowBackground(Brand.surface(for: scheme))
            Section(queue == .reports ? "Reporter" : "Member") {
                LabeledContent("Name", value: entry.name)
                if let username = entry.person?.username { LabeledContent("Username", value: "@\(username)") }
                if let email = entry.person?.email { LabeledContent("Email", value: email).privacySensitive() }
                if let tier = entry.person?.tier { LabeledContent("Membership", value: tier.capitalized) }
                if let role = entry.person?.accountType { LabeledContent("Role", value: role.capitalized) }
                if let commerce = entry.person?.creatorCommerceStatus {
                    LabeledContent("Creator payments", value: commerce.replacingOccurrences(of: "_", with: " ").capitalized)
                }
            }.listRowBackground(Brand.surface(for: scheme))
            if let note = entry.resolutionNote ?? entry.rejectionReason {
                Section("Resolution") { Text(verbatim: note) }.listRowBackground(Brand.surface(for: scheme))
            }
            if let planned = entry.scheduledFor.flatMap(SidelineBoard.timestamp) {
                Section { LabeledContent("Scheduled", value: planned.formatted(date: .abbreviated, time: .shortened)) }
                    .listRowBackground(Brand.surface(for: scheme))
            }
            if !decisions.isEmpty {
                Section {
                    ForEach(decisions) { decision in
                        Button(decision.label, role: decision.destructive ? .destructive : nil) { action = decision }
                    }
                } footer: {
                    if queue == .deletions { Text("Review active subscriptions, creator payouts and retained records before scheduling deletion.") }
                }.listRowBackground(Brand.surface(for: scheme))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle(queue == .reports ? "Report" : entry.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $action) { decision in
            DecisionForm(title: decision.label, schedulesDeletion: decision.id == "scheduled", destructive: decision.destructive) { note, date in
                try await submit(decision, note: note, date: date)
            }
        }
    }

    private func submit(_ decision: Decision, note: String, date: Date) async throws {
        let id = entry.id.uuidString.lowercased()
        var path: String
        var body: [String: String]
        switch queue {
        case .reports:
            path = "/api/admin/reports/\(id)"
            body = ["status": decision.id, "resolutionNote": note]
        case .applications:
            guard let applicant = entry.userId else { throw URLError(.cannotParseResponse) }
            path = "/api/admin/creators/\(id)/decision"
            body = ["decision": decision.id, "userId": applicant.uuidString.lowercased(), "reason": note]
        case .deletions:
            path = "/api/admin/account-deletions/\(id)"
            body = ["status": decision.id, "note": note]
            if decision.id == "scheduled" { body["scheduledFor"] = date.ISO8601Format() }
        }
        _ = try await AccountPrivacyRequest.send(path, method: "POST", account: account, userID: userID, body: JSONEncoder().encode(body))
        result = decision.id
        didChange()
    }
}

private struct DecisionForm: View {
    let title: String
    let schedulesDeletion: Bool
    let destructive: Bool
    let save: (String, Date) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var note = ""
    @State private var date = Date.now.addingTimeInterval(86_400)
    @State private var confirm = false
    @State private var busy = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Resolution note", text: $note, axis: .vertical).lineLimit(5...10)
                    if schedulesDeletion { DatePicker("Schedule for", selection: $date, in: Date.now...) }
                }.listRowBackground(Brand.surface(for: scheme))
                if let issue { Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Review") { confirm = true } }
            }
            .disabled(busy)
            .confirmationDialog(title, isPresented: $confirm, titleVisibility: .visible) {
                Button("Confirm", role: destructive ? .destructive : nil) { Task { await apply() } }
            }
        }
        .interactiveDismissDisabled(busy)
    }

    private func apply() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await save(note, date)
            dismiss()
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            issue = "This entry changed. Reopen it from the queue."
        } catch { issue = "The decision couldn’t be confirmed. Check the queue and try again." }
    }
}
