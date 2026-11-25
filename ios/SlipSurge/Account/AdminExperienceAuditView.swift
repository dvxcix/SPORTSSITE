import SwiftUI

struct AdminExperienceAuditView: View {
    private enum Page: String, CaseIterable { case traffic = "Traffic", routes = "Routes", roadmap = "Roadmap" }

    private struct Snapshot: Decodable {
        let routes: [Route]
        let roadmap: Roadmap
        let telemetry: Telemetry
    }

    private enum RouteState: String, Decodable {
        case complete, partial, missing

        var title: String { self == .complete ? "Shared" : rawValue.capitalized }
        var icon: String {
            switch self {
            case .complete: "checkmark.circle.fill"
            case .partial: "circle.dashed"
            case .missing: "exclamationmark.triangle"
            }
        }
        var color: Color {
            switch self {
            case .complete: .green
            case .partial: .orange
            case .missing: .red
            }
        }
    }

    private struct Route: Decodable, Identifiable {
        let route: String
        let label: String
        let family: String
        let priority: String
        let completion: Int
        let shell: RouteState
        let responsive: RouteState
        let states: RouteState
        let interaction: RouteState
        let accessibility: RouteState
        var id: String { route }
    }

    private struct Roadmap: Decodable {
        struct Phase: Decodable, Identifiable {
            let id: String
            let label: String
            let status: String
            let progress: Int
            let shipped: [String]
            let remaining: [String]
        }
        let phases: [Phase]
        let completion: Int
    }

    private struct Telemetry: Decodable {
        struct Health: Decodable, Identifiable {
            let route: String
            let events: Int
            let failures: Int
            let slow: Int
            let p95Ms: Int
            let devices: Int
            let lastSeen: String?
            var id: String { route }
        }
        let events: Int
        let measuredRoutes: Int
        let failures: Int
        let slowInteractions: Int
        let p95ReadyMs: Int
        let deviceCoverage: Int
        let routeHealth: [Health]
    }

    private enum Sort: String, CaseIterable {
        case original = "Original order", route = "Route", priority = "Priority", progress = "Progress"
        case shell = "Shell", responsive = "Responsive", states = "States", interaction = "Interaction", accessibility = "Accessibility"

        func value(_ route: Route) -> String {
            switch self {
            case .original, .route, .progress: route.label
            case .priority: route.priority
            case .shell: route.shell.rawValue
            case .responsive: route.responsive.rawValue
            case .states: route.states.rawValue
            case .interaction: route.interaction.rawValue
            case .accessibility: route.accessibility.rawValue
            }
        }
    }

    let api: DiscoverAPI
    @Environment(\.colorScheme) private var scheme
    @State private var data: Snapshot?
    @State private var issue: (any Error)?
    @State private var revision = 0
    @State private var page = Page.traffic
    @State private var search = ""
    @State private var priority = ""
    @State private var family = ""
    @State private var sort = Sort.original
    @State private var descending = false

    var body: some View {
        Group {
            if page == .routes {
                list.searchable(text: $search, prompt: "Route, page or family")
            } else {
                list
            }
        }
        .navigationTitle("Experience audit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if page == .routes, let data {
                ToolbarItem(placement: .topBarTrailing) { filters(data.routes) }
            }
        }
        .task(id: revision) { await load() }
    }

    private var list: some View {
        List {
            Section {
                Picker("Experience audit", selection: $page) {
                    ForEach(Page.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if let data {
                switch page {
                case .traffic: traffic(data.telemetry)
                case .routes: routes(data.routes)
                case .roadmap: roadmap(data.roadmap)
                }
            } else {
                ResearchToolMessage(title: "Experience audit couldn’t load", error: issue) { revision += 1 }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
        .tint(Brand.accent(for: scheme))
        .refreshable { await load() }
    }

    private func filters(_ routes: [Route]) -> some View {
        Menu("Filter and sort", systemImage: "line.3.horizontal.decrease") {
            Picker("Priority", selection: $priority) {
                Text("All priorities").tag("")
                ForEach(["P0", "P1", "P2"], id: \.self) { Text($0).tag($0) }
            }
            Picker("Family", selection: $family) {
                Text("All families").tag("")
                ForEach(Set(routes.map(\.family)).sorted(), id: \.self) { Text($0).tag($0) }
            }
            Picker("Sort by", selection: $sort) {
                ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            Toggle("Descending", isOn: $descending).disabled(sort == .original)
        }
    }

    @ViewBuilder private func traffic(_ telemetry: Telemetry) -> some View {
        Section("Website traffic sample") {
            LabeledContent("Measured events", value: telemetry.events.formatted())
            LabeledContent("Measured routes", value: telemetry.measuredRoutes.formatted())
            LabeledContent("Action failures", value: telemetry.failures.formatted())
            LabeledContent("Slow interactions", value: telemetry.slowInteractions.formatted())
            LabeledContent("95th percentile ready time", value: "\(telemetry.p95ReadyMs.formatted()) ms")
            LabeledContent("Device classes", value: "\(telemetry.deviceCoverage) of 5")
        }
        Section("Routes needing attention") {
            if telemetry.routeHealth.isEmpty {
                ContentUnavailableView("No route telemetry yet", systemImage: "waveform.path")
            }
            ForEach(telemetry.routeHealth) { health in
                NavigationLink {
                    Form {
                        Section {
                            LabeledContent("Events", value: health.events.formatted())
                            LabeledContent("Failures", value: health.failures.formatted())
                            LabeledContent("Slow interactions", value: health.slow.formatted())
                            LabeledContent("95th percentile ready time", value: "\(health.p95Ms.formatted()) ms")
                            LabeledContent("Device classes", value: health.devices.formatted())
                            if let date = health.lastSeen.flatMap(SidelineBoard.timestamp) {
                                LabeledContent("Last seen", value: date.formatted(date: .abbreviated, time: .shortened))
                            }
                        } header: { Text(health.route).textCase(nil) }
                    }
                    .navigationTitle("Route traffic")
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(health.route).font(.subheadline.monospaced())
                        Text("\(health.events) events · \(health.failures) failed · \(health.p95Ms) ms p95")
                            .font(.caption).foregroundStyle(health.failures > 0 ? Color.red : .secondary)
                    }
                }
            }
        }
    }

    @ViewBuilder private func routes(_ all: [Route]) -> some View {
        let visible = filtered(all)
        Section("Website route audit") {
            LabeledContent("Tracked routes", value: all.count.formatted())
            LabeledContent("P0 surfaces", value: all.filter { $0.priority == "P0" }.count.formatted())
            LabeledContent("Shared shell", value: all.filter { $0.shell == .complete }.count.formatted())
            LabeledContent("Missing state systems", value: all.filter { $0.states == .missing }.count.formatted())
        }
        Section {
            if visible.isEmpty { ContentUnavailableView("No matching routes", systemImage: "magnifyingglass") }
            ForEach(visible) { route in
                NavigationLink {
                    routeDetails(route)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(route.label).font(.subheadline.weight(.semibold))
                        Text(route.route).font(.caption.monospaced()).foregroundStyle(.secondary)
                        Text("\(route.family) · \(route.priority) · \(route.completion)%")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        } header: {
            Text("Matching routes (\(visible.count.formatted()))")
        }
    }

    private func filtered(_ routes: [Route]) -> [Route] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = routes.filter { route in
            (priority.isEmpty || priority == route.priority) && (family.isEmpty || family == route.family) &&
            (term.isEmpty || [route.label, route.route, route.family].contains { $0.localizedCaseInsensitiveContains(term) })
        }
        guard sort != .original else { return matches }
        return matches.sorted { a, b in
            if sort == .progress, a.completion != b.completion {
                return descending ? a.completion > b.completion : a.completion < b.completion
            }
            let order = sort.value(a).localizedStandardCompare(sort.value(b))
            return order == .orderedSame ? a.route < b.route : (descending ? order == .orderedDescending : order == .orderedAscending)
        }
    }

    private func routeDetails(_ route: Route) -> some View {
        Form {
            Section {
                Text(route.route).font(.subheadline.monospaced())
                LabeledContent("Family", value: route.family)
                LabeledContent("Priority", value: route.priority)
                ProgressView(value: Double(route.completion), total: 100) {
                    LabeledContent("Shared experience", value: "\(route.completion)%")
                }
            }
            Section("Dimensions") {
                status("Shell", route.shell)
                status("Responsive", route.responsive)
                status("States", route.states)
                status("Interaction", route.interaction)
                status("Accessibility", route.accessibility)
            }
        }
        .navigationTitle(route.label)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func status(_ label: String, _ value: RouteState) -> some View {
        LabeledContent(label) {
            Label(value.title, systemImage: value.icon).symbolRenderingMode(.monochrome)
                .foregroundStyle(value.color)
        }
    }

    @ViewBuilder private func roadmap(_ roadmap: Roadmap) -> some View {
        Section("Website roadmap") {
            ProgressView(value: Double(roadmap.completion), total: 100) {
                LabeledContent("Overall progress", value: "\(roadmap.completion)%")
            }
            ForEach(roadmap.phases) { phase in
                NavigationLink {
                    List {
                        Section {
                            LabeledContent("Progress", value: "\(phase.progress)%")
                            LabeledContent("Status", value: phase.status.capitalized)
                        }
                        if !phase.shipped.isEmpty {
                            Section("Shipped") { ForEach(phase.shipped, id: \.self) { Text($0) } }
                        }
                        if !phase.remaining.isEmpty {
                            Section("Remaining") { ForEach(phase.remaining, id: \.self) { Text($0) } }
                        }
                    }
                    .navigationTitle(phase.label)
                    .navigationBarTitleDisplayMode(.inline)
                } label: {
                    LabeledContent(phase.label, value: "\(phase.progress)%")
                }
            }
        }
    }

    private func load() async {
        do {
            let snapshot = try await api.memberRead(Snapshot.self, path: "/api/mobile/admin/product-audit")
            try Task.checkCancellation()
            data = snapshot
            issue = nil
        } catch is CancellationError {
            return
        } catch {
            data = nil
            issue = error
        }
    }
}
