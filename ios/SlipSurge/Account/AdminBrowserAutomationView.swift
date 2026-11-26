import Charts
import SwiftUI

struct AdminBrowserAutomationView: View {
    enum Page: String, CaseIterable {
        case overview = "Overview", extractors = "Extractors", sessions = "Sessions"

        var glyph: String {
            switch self {
            case .overview: "rectangle.3.group"
            case .extractors: "arrow.down.document"
            case .sessions: "clock.arrow.circlepath"
            }
        }
    }

    private struct Snapshot: Decodable {
        struct Usage: Decodable {
            struct Day: Decodable, Identifiable {
                let date: String
                let sessions: Int
                let proxyBytes: Double
                let errors: Int
                var id: String { date }
            }
            struct Extractor: Decodable, Identifiable {
                let name: String
                let sessions: Int
                let proxyBytes: Double
                let browserMinutes: Double
                let errors: Int
                let timedOut: Int
                let lastSeenAt: String
                var id: String { name }
            }
            struct Session: Decodable, Identifiable {
                let idSuffix: String
                let workflow: String
                let status: String
                let createdAt: String
                let browserMinutes: Double
                let proxyBytes: Double
                let region: String
                let keepAlive: Bool
                var id: String { idSuffix + createdAt }
            }
            let generatedAt: String
            let runningSessions: Int
            let retainedSessionCount: Int
            let cycleSessionCount: Int
            let attributedProxyBytes: Double
            let unaccountedProxyBytes: Double
            let untaggedSessions: Int
            let byWorkflow: [Extractor]
            let byDay: [Day]
            let byStatus: [String: Int]
            let byRegion: [String: Int]
            let recentSessions: [Session]
        }

        struct Plan: Decodable {
            let concurrentBrowsers: Int
            let includedBrowserMinutes: Int
            let includedAgentRuns: Int
            let includedSearchCalls: Int
            let includedFetchCalls: Int
            let includedProxyBytes: Double
        }

        struct Totals: Decodable {
            let browserHours: Double
            let browserOverageHours: Double
            let browserOverageUsd: Double
            let proxyGigabytes: Double
            let proxyPercent: Double
            let proxyOverageUsd: Double
            let estimatedCurrentBillUsd: Double
        }

        struct Alerts: Decodable {
            let browserMinutes: Double
            let proxyBytes: Double
            let browserExceeded: Bool
            let proxyExceeded: Bool
        }

        let usage: Usage
        let plan: Plan
        let totals: Totals
        let alerts: Alerts
    }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @State private var page = Page.overview
    @State private var snapshot: Snapshot?
    @State private var error: (any Error)?
    @State private var query = ""
    @State private var status = ""
    @State private var revision = 0

    var body: some View {
        List {
            if let snapshot {
                switch page {
                case .overview: overview(snapshot)
                case .extractors: extractors(snapshot.usage.byWorkflow)
                case .sessions: sessions(snapshot.usage.recentSessions)
                }
            } else {
                ResearchToolMessage(title: "Browser usage couldn’t load", error: error) { revision += 1 }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            ResearchToolRail(title: "Browser automation section", choices: Page.allCases, selection: $page, label: \.rawValue, glyph: \.glyph)
                .padding(.vertical, 6).background(.bar)
        }
        .navigationTitle("Browser automation")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func overview(_ data: Snapshot) -> some View {
        let usage = data.usage, totals = data.totals, plan = data.plan, alerts = data.alerts
        Section {
            let exceeded = alerts.proxyExceeded || alerts.browserExceeded
            Label(exceeded ? "Alert threshold exceeded" : "Usage is below the alert thresholds",
                systemImage: exceeded ? "exclamationmark.triangle.fill" : "checkmark.shield")
                .foregroundStyle(exceeded ? Brand.signal(-1, for: scheme) : Brand.signal(1, for: scheme))
            LabeledContent("Proxy threshold", value: gigabytes(alerts.proxyBytes))
            LabeledContent("Browser threshold", value: hours(alerts.browserMinutes / 60))
        } header: {
            Text("Spending alerts")
        } footer: {
            Text("Alerts monitor usage. Individual workflows may apply their own limits.")
        }
        Section {
            LabeledContent("Proxy transfer", value: decimal(totals.proxyGigabytes) + " GB")
            LabeledContent("Plan proxy allowance", value: gigabytes(plan.includedProxyBytes))
            LabeledContent("Allowance used", value: decimal(totals.proxyPercent) + "%")
            LabeledContent("Estimated proxy overage", value: currency(totals.proxyOverageUsd))
            LabeledContent("Plan + project estimate", value: currency(totals.estimatedCurrentBillUsd))
            LabeledContent("Browser overage", value: hours(totals.browserOverageHours) + " · " + currency(totals.browserOverageUsd))
            LabeledContent("Sessions this month", value: usage.cycleSessionCount.formatted())
            LabeledContent("Retained sessions", value: usage.retainedSessionCount.formatted())
        } header: {
            Text("Costs and activity")
        } footer: {
            Text("The estimate excludes other projects and API charges. The provider’s billing period may differ from the UTC month.")
        }
        if !usage.byDay.isEmpty {
            Section("Proxy by day") {
                Chart(usage.byDay) { day in
                    BarMark(x: .value("UTC day", day.date), y: .value("Gigabytes", day.proxyBytes / 1_000_000_000))
                        .foregroundStyle(day.errors > 0 ? .orange : Brand.accent(for: scheme))
                        .accessibilityLabel(day.date)
                        .accessibilityValue("\(gigabytes(day.proxyBytes)), \(day.sessions) sessions, \(day.errors) failures")
                }.chartXAxis(.hidden).frame(height: 120)
                DisclosureGroup("Daily totals") {
                    ForEach(usage.byDay) { day in
                        LabeledContent(day.date, value: "\(gigabytes(day.proxyBytes)) · \(day.sessions) runs · \(day.errors) failed")
                    }
                }
            }
        }
        Section("Billing reconciliation") {
            LabeledContent("Provider-reported proxy", value: decimal(totals.proxyGigabytes) + " GB")
            LabeledContent("Proxy in retained sessions", value: gigabytes(usage.attributedProxyBytes))
            LabeledContent("Unattributed usage", value: gigabytes(usage.unaccountedProxyBytes))
            LabeledContent("Untagged sessions", value: usage.untaggedSessions.formatted())
        }
        Section("Plan coverage") {
            LabeledContent("Concurrent browsers", value: "\(usage.runningSessions) / \(plan.concurrentBrowsers)")
            LabeledContent("Browser time", value: "\(hours(totals.browserHours)) / \(hours(Double(plan.includedBrowserMinutes) / 60))")
            quota("Agent runs", plan.includedAgentRuns)
            quota("Search calls", plan.includedSearchCalls)
            quota("Fetch calls", plan.includedFetchCalls)
        }
        distribution("Session outcomes", usage.byStatus)
        distribution("Regions", usage.byRegion)
        if let date = SidelineBoard.timestamp(usage.generatedAt) {
            Text("Refreshed \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
        }
    }

    private func extractors(_ rows: [Snapshot.Usage.Extractor]) -> some View {
        Section {
            if rows.isEmpty { ContentUnavailableView("No workflow metadata", systemImage: "gearshape.2") }
            ForEach(rows) { row in
                DisclosureGroup {
                    LabeledContent("Per run", value: megabytes(row.proxyBytes / Double(max(1, row.sessions))))
                    LabeledContent("Browser time", value: hours(row.browserMinutes / 60))
                    LabeledContent("Failed or timed out", value: (row.errors + row.timedOut).formatted())
                    if let date = SidelineBoard.timestamp(row.lastSeenAt) {
                        LabeledContent("Last run", value: date.formatted(date: .abbreviated, time: .shortened))
                    }
                } label: {
                    detailHeading(row.name, detail: "\(row.sessions) sessions · \(gigabytes(row.proxyBytes))", glyph: "gearshape.2")
                }
            }
        } header: {
            Text("Usage by extractor")
        } footer: {
            Text("Usage is attributed from retained sessions since the start of the UTC month.")
        }
    }

    @ViewBuilder private func sessions(_ rows: [Snapshot.Usage.Session]) -> some View {
        Section {
            TextField("Find a workflow, region or session", text: $query).autocorrectionDisabled()
            Picker("Status", selection: $status) {
                Text("All statuses").tag("")
                ForEach(Set(rows.map(\.status)).sorted(), id: \.self) { Text(pretty($0)).tag($0) }
            }
        }
        Section("Recent sessions") {
            let matches = rows.filter { row in
                (status.isEmpty || row.status == status) && (query.isEmpty ||
                    [row.workflow, row.region, row.idSuffix].contains { $0.localizedStandardContains(query) })
            }
            if matches.isEmpty { ContentUnavailableView("No matching sessions", systemImage: "list.bullet.rectangle") }
            ForEach(matches) { row in
                DisclosureGroup {
                    LabeledContent("Session", value: "…" + row.idSuffix)
                    if let date = SidelineBoard.timestamp(row.createdAt) {
                        LabeledContent("Started", value: date.formatted(date: .abbreviated, time: .shortened))
                    }
                    LabeledContent("Duration", value: decimal(row.browserMinutes) + " min")
                    LabeledContent("Proxy", value: megabytes(row.proxyBytes))
                    LabeledContent("Region", value: row.region)
                    LabeledContent("Keep alive", value: row.keepAlive ? "Yes" : "No")
                } label: {
                    detailHeading(row.workflow, detail: "\(pretty(row.status)) · \(megabytes(row.proxyBytes))", glyph: "rectangle.on.rectangle")
                }
            }
        }
    }

    private func distribution(_ title: String, _ counts: [String: Int]) -> some View {
        Section(title) {
            if counts.isEmpty { Text("No activity recorded").foregroundStyle(.secondary) }
            ForEach(counts.keys.sorted(), id: \.self) { key in LabeledContent(pretty(key), value: counts[key, default: 0].formatted()) }
        }
    }

    private func detailHeading(_ title: String, detail: String, glyph: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: glyph).foregroundStyle(Brand.accent(for: scheme))
        }
    }

    private func quota(_ title: String, _ count: Int) -> some View {
        LabeledContent(title, value: count.formatted() + " included · Unused by SlipSurge")
    }

    private func pretty(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
    private func decimal(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...2))) }
    private func gigabytes(_ bytes: Double) -> String { decimal(bytes / 1_000_000_000) + " GB" }
    private func megabytes(_ bytes: Double) -> String { decimal(bytes / 1_000_000) + " MB" }
    private func hours(_ amount: Double) -> String { decimal(amount) + " h" }
    private func currency(_ amount: Double) -> String { amount.formatted(.currency(code: "USD")) }

    private func load() async {
        do {
            let data = try await api.memberRead(Snapshot.self, path: "/api/mobile/admin/browserbase")
            try Task.checkCancellation()
            snapshot = data
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
