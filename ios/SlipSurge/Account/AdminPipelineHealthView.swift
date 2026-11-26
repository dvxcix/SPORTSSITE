import SwiftUI

struct AdminPipelineHealthView: View {
    private struct Health: Decodable {
        struct Job: Decodable, Identifiable {
            struct Run: Decodable, Identifiable {
                let id: Int
                let status: String
                let startedAt: String
                let finishedAt: String?
                let duration: Int?
                let http: Int?
                let stage: String?
            }

            let id: String
            let name: String
            let schedule: String
            let section: String
            let paused: Bool
            let state: String
            let runs: [Run]
        }

        struct Queue: Decodable, Identifiable { let id: String; let count: Int? }
        struct Audit: Decodable {
            let status: String
            let through: String
            let createdAt: String
            let failures: Int?
            let warnings: Int?
            let pitches: Int?
            let games: Int?
            let homeRuns: Int?
        }

        struct Budget: Decodable {
            struct Workflow: Decodable, Identifiable {
                let name: String
                let sessions: Int
                let browserMinutes: Double
                let proxyBytes: Double
                let errors: Int
                let timedOut: Int
                var id: String { name }
            }

            let browserHours: Double
            let browserHoursRemaining: Double
            let proxyGigabytes: Double
            let proxyGigabytesRemaining: Double
            let runningSessions: Int
            let workflows: [Workflow]
        }

        let jobs: [Job]
        let queues: [Queue]
        let audit: Audit?
        let budget: Budget?
        let checkedAt: String
    }

    private struct Action: Encodable, Identifiable {
        let jobName: String
        let action: String
        var gameId: String?
        var id: String { "\(jobName):\(action)" }
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var health: Health?
    @State private var error: (any Error)?
    @State private var query = ""
    @State private var filter = ""
    @State private var revision = 0
    @State private var selection: Health.Job?
    @State private var action: Action?
    @State private var gameID = ""
    @State private var running = false
    @State private var queued = Set<String>()
    @State private var feedback: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 11) {
                if let health {
                    overview(health)
                    list(health.jobs)
                } else if let error = error as? SlipSurgeHTTP.Status, [401, 403].contains(error.code) {
                    ContentUnavailableView("Admin access required", systemImage: "lock")
                } else {
                    ResearchToolMessage(title: "Pipeline health couldn’t load", error: error) { revision += 1 }
                }
            }.padding(16)
        }
        .navigationTitle("Pipeline Health")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .searchable(text: $query, prompt: "Find a pipeline")
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(item: $selection) { job in
            NavigationStack {
                runDetail(job)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { selection = nil }.disabled(running) } }
            }
        }
    }

    private func overview(_ data: Health) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ResearchToolValues(items: [
                .init(label: "Healthy", text: data.jobs.filter { $0.state == "succeeded" }.count.formatted(), tone: .green),
                .init(label: "Waiting upstream", text: data.jobs.filter { $0.state == "deferred" }.count.formatted(), tone: .orange),
                .init(label: "Needs attention", text: data.jobs.filter { ["failed", "stale", "timed_out"].contains($0.state) }.count.formatted()),
            ])
            if let checked = SidelineBoard.timestamp(data.checkedAt) {
                Label("Updated \(checked.formatted(date: .omitted, time: .standard))", systemImage: "clock")
                    .font(.caption).foregroundStyle(.secondary)
            }
            DisclosureGroup("Operational queues") {
                ForEach(data.queues) { queue in LabeledContent(queueTitle(queue.id), value: queue.count?.formatted() ?? "—") }
            }.font(.subheadline)
            if let audit = data.audit {
                DisclosureGroup("Statcast Integrity · \(pretty(audit.status))") {
                    Text("Through \(audit.through)").font(.caption).foregroundStyle(.secondary)
                    if let checked = SidelineBoard.timestamp(audit.createdAt) {
                        Text("Audited \(checked.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                    }
                    ResearchToolValues(items: [
                        .init(label: "Pitches", text: audit.pitches?.formatted() ?? "—"),
                        .init(label: "Games", text: audit.games?.formatted() ?? "—"),
                        .init(label: "Home runs", text: audit.homeRuns?.formatted() ?? "—"),
                        .init(label: "Failures", text: audit.failures?.formatted() ?? "—"),
                        .init(label: "Warnings", text: audit.warnings?.formatted() ?? "—"),
                    ])
                }.font(.subheadline)
            }
            if let budget = data.budget { browserUsage(budget) }
        }
    }

    private func browserUsage(_ budget: Health.Budget) -> some View {
        DisclosureGroup("Browserbase Usage") {
            ResearchToolValues(items: [
                .init(label: "Browser time", text: ResearchFormat.decimal(budget.browserHours, suffix: " h")),
                .init(label: "Proxy transfer", text: ResearchFormat.decimal(budget.proxyGigabytes, suffix: " GB")),
                .init(label: "Running sessions", text: budget.runningSessions.formatted()),
            ])
            Text("\(ResearchFormat.decimal(budget.browserHoursRemaining, suffix: " h")) browser time and \(ResearchFormat.decimal(budget.proxyGigabytesRemaining, suffix: " GB")) proxy transfer remaining.")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(budget.workflows) { workflow in
                VStack(alignment: .leading, spacing: 3) {
                    LabeledContent(workflow.name, value: "\(workflow.sessions) runs · \(workflow.errors + workflow.timedOut) failed")
                    Text("\(ResearchFormat.decimal(workflow.browserMinutes / 60, suffix: " h")) · \(ResearchFormat.decimal(workflow.proxyBytes / 1_000_000_000, suffix: " GB"))")
                        .foregroundStyle(.secondary)
                }.font(.caption)
            }
            NavigationLink("Browser automation details") { AdminBrowserAutomationView(api: api) }
        }.font(.subheadline)
    }

    @ViewBuilder private func list(_ jobs: [Health.Job]) -> some View {
        let sections = Set(jobs.map(\.section)).sorted()
        let matching = jobs.filter { job in
            (filter.isEmpty || filter == job.section) && (query.isEmpty || job.name.localizedStandardContains(query))
        }
        Picker("Pipeline area", selection: $filter) {
            Text("All areas").tag("")
            ForEach(sections, id: \.self) { Text($0).tag($0) }
        }
        if matching.isEmpty { ContentUnavailableView("No matching pipelines", systemImage: "waveform.path") }
        ForEach(matching) { job in
            Button {
                gameID = ""
                feedback = nil
                selection = job
            } label: {
                ResearchToolCard(color: tone(job.state)) {
                    HStack {
                        Text(job.name).font(.headline)
                        Spacer()
                        Text(pretty(job.state)).font(.caption.weight(.semibold)).foregroundStyle(tone(job.state))
                    }
                } content: {
                    Text(job.schedule).font(.caption).foregroundStyle(.secondary)
                    if let run = job.runs.first, let date = SidelineBoard.timestamp(run.startedAt) {
                        Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption)
                    }
                }
            }.buttonStyle(SlipSurgePressStyle())
        }
    }

    private func runDetail(_ original: Health.Job) -> some View {
        let job = health?.jobs.first(where: { $0.id == original.id }) ?? original
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(job.schedule).font(.subheadline).foregroundStyle(.secondary)
                if !job.paused {
                    Button(job.id == "market-dna-maintenance" ? "Archive" : "Run pipeline", systemImage: "play.circle") { select(job, action: "run") }
                        .buttonStyle(.borderedProminent).disabled(running || queued.contains(job.id + ":run"))
                    if job.id == "market-dna-maintenance" {
                        Button("Fit model", systemImage: "chart.xyaxis.line") { select(job, action: "fit") }
                            .buttonStyle(.bordered).disabled(running || queued.contains(job.id + ":fit"))
                    }
                    if job.id == "slate-drop" {
                        Button("Preview slate", systemImage: "eye") { Task { await send(.init(jobName: job.id, action: "preview")) } }
                            .buttonStyle(.bordered).disabled(running)
                    }
                    if job.id == "poll-pikkit-nfl-picks" {
                        TextField("NFL game ID", text: $gameID).textFieldStyle(.roundedBorder).autocorrectionDisabled().textInputAutocapitalization(.characters)
                        Button("Refresh NFL matchup", systemImage: "arrow.clockwise") { select(job, action: "nfl-game", game: gameID) }
                            .buttonStyle(.bordered).disabled(running || gameID.range(of: #"^\d{4}_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}$"#, options: .regularExpression) == nil)
                    }
                }
                if let feedback { Text(feedback).font(.caption).foregroundStyle(.secondary) }
                if running { ProgressView() }
                ForEach(job.runs) { run in
                    ResearchToolCard(color: tone(run.status)) {
                        Text(pretty(run.status)).font(.headline)
                    } content: {
                        if let date = SidelineBoard.timestamp(run.startedAt) { Text(date.formatted(date: .abbreviated, time: .standard)).font(.caption) }
                        if let end = run.finishedAt.flatMap(SidelineBoard.timestamp) {
                            Text("Finished \(end.formatted(date: .omitted, time: .standard))").font(.caption).foregroundStyle(.secondary)
                        }
                        ResearchToolValues(items: [
                            .init(label: "Duration", text: ResearchFormat.decimal(run.duration.map { Double($0) / 1000 }, suffix: " s")),
                            .init(label: "HTTP", text: run.http.map(String.init) ?? "—"),
                        ])
                        if let stage = run.stage { Text(pretty(stage)).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }.padding(16)
        }
        .navigationTitle(job.name)
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .interactiveDismissDisabled(running)
        .confirmationDialog("Confirm pipeline action", isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } }),
            titleVisibility: .visible, presenting: action) { request in
            Button("Confirm", role: .destructive) { Task { await send(request) } }
        } message: { _ in Text(job.name) }
    }

    private func queueTitle(_ id: String) -> String {
        switch id {
        case "webhooks": "Failed webhooks"
        case "stalledWebhooks": "Stalled webhooks"
        case "push": "Push failures, 24h"
        case "reports": "Pending reports"
        case "applications": "Creator applications"
        case "exports": "Open data exports"
        case "failedExports": "Failed data exports"
        case "recap": "Active contact recap exports"
        case "failedRecap": "Failed contact recap exports"
        case "retries": "Pending delivery retries"
        default: "Exhausted delivery retries"
        }
    }

    private func pretty(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }

    private func tone(_ value: String) -> Color {
        switch value {
        case "succeeded": slipPalette.accent
        case "failed", "timed_out": .red
        case "stale", "deferred": .orange
        default: .secondary
        }
    }

    private func select(_ job: Health.Job, action: String, game: String? = nil) {
        self.action = .init(jobName: job.id, action: action, gameId: game)
    }

    private func send(_ request: Action) async {
        struct Receipt: Decodable { let ok: Bool?; let games: Int?; let markets: Int?; let capturedAt: String? }
        struct Failure: Decodable { let error: String }
        guard !running else { return }
        running = true
        feedback = nil
        defer { running = false }
        do {
            let receipt = try await api.write(Receipt.self, path: "/api/admin/pipeline-retry", body: request,
                timeout: request.action == "nfl-game" ? 320 : 35)
            if request.action == "preview" {
                feedback = receipt.games.map { "\($0) games in slate preview" } ?? "Slate preview unavailable."
            } else if let markets = receipt.markets, let capture = receipt.capturedAt.flatMap(SidelineBoard.timestamp) {
                feedback = "\(markets) markets refreshed at \(capture.formatted(date: .omitted, time: .shortened))."
            } else if receipt.ok == true {
                queued.insert(request.id)
                feedback = "Pipeline queued."
            } else { feedback = "Pipeline request could not be confirmed." }
            await load()
        } catch let status as SlipSurgeHTTP.Status {
            feedback = (try? JSONDecoder().decode(Failure.self, from: status.data))?.error ?? "Pipeline request could not be confirmed."
        } catch { feedback = "Pipeline request could not be confirmed." }
    }

    private func load() async {
        error = nil
        do {
            let result = try await api.readPublic(Health.self, path: "/api/mobile/admin/pipeline-health")
            try Task.checkCancellation()
            health = result
        } catch {
            if !Task.isCancelled { self.error = error }
        }
    }
}
