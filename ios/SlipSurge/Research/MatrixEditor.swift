import SwiftUI

struct ResearchMatrixEditor: View {
    private static let colors = [("#a7ff3f", "Lime"), ("#35d7ff", "Cyan"), ("#ffbd45", "Amber"),
        ("#ff667e", "Rose"), ("#a78bfa", "Violet"), ("#4de2a1", "Mint")]

    let api: MatricesAPI
    let catalog: ResearchMatrixCatalog
    let original: ResearchMatrix?
    let gameID: Int?
    let mode: CourtResearchMode
    let didSave: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var name = ""
    @State private var color = "#a7ff3f"
    @State private var kind = "classic"
    @State private var match = "all"
    @State private var matchCount = 1
    @State private var pipelineScope = "team"
    @State private var factors: [ResearchMatrix.Rule] = [.init()]
    @State private var steps: [ResearchMatrix.Rule] = [.step]
    @State private var busy = false
    @State private var configured = false
    @State private var error: String?
    @State private var trackingFields: [ResearchMatrixCatalog.Field] = []

    private var pipeline: Bool { kind == "pipeline" }
    private var rules: Binding<[ResearchMatrix.Rule]> { pipeline ? $steps : $factors }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Matrix name", text: $name)
                    HStack(spacing: 8) {
                        ForEach(Self.colors, id: \.0) { choice, title in
                            Button {
                                color = choice
                            } label: {
                                Circle().fill(Color(hex: choice) ?? .secondary)
                                    .overlay {
                                        if color == choice { Image(systemName: "checkmark").font(.footnote.bold()).foregroundStyle(.black) }
                                    }
                                    .frame(width: 29, height: 29)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                            }.buttonStyle(.plain)
                                .accessibilityLabel("\(title) Matrix color")
                                .accessibilityAddTraits(color == choice ? .isSelected : [])
                        }
                    }
                    Picker("Matrix type", selection: $kind) {
                        Text("Classic").tag("classic")
                        Text("Pipeline").tag("pipeline")
                    }
                    if pipeline {
                        Picker("Pipeline scope", selection: $pipelineScope) {
                            Text("Team").tag("team")
                            Text("Game").tag("game")
                        }
                    } else {
                        Picker("Match", selection: $match) {
                            Text("All conditions").tag("all")
                            Text("Any conditions").tag("any")
                        }
                        if match == "any" {
                            Stepper("Minimum \(matchCount)", value: $matchCount, in: 1...max(1, factors.count))
                        }
                    }
                }.listRowBackground(slipPalette.surface)
                ForEach(rules) { $rule in
                    ResearchMatrixRuleEditor(league: api.league, catalog: catalog, trackingFields: trackingFields,
                        pipeline: pipeline, rule: $rule)
                }
                .onDelete { offsets in
                    rules.wrappedValue.remove(atOffsets: offsets)
                    matchCount = min(matchCount, max(1, factors.count))
                }
                .onMove { indices, offset in rules.wrappedValue.move(fromOffsets: indices, toOffset: offset) }
                Button(pipeline ? "Add step" : "Add condition", systemImage: "plus.circle") {
                    rules.wrappedValue.append(api.league.rule(pipeline: pipeline))
                }.disabled(rules.wrappedValue.count >= 40)
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(slipPalette.background)
            .foregroundStyle(slipPalette.text)
            .scrollDismissesKeyboard(.interactively)
            .keyboardDone()
            .navigationTitle(original == nil ? "New \(api.league.title) Matrix" : "Edit \(api.league.title) Matrix")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItemGroup(placement: .confirmationAction) {
                    EditButton()
                    Button("Save") { Task { await save() } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || rules.wrappedValue.isEmpty)
                }
            }
            .disabled(busy)
        }
        .interactiveDismissDisabled(busy)
        .onAppear {
            guard !configured else { return }
            configured = true
            factors = original?.definition.factors ?? [api.league.rule(pipeline: false)]
            steps = original?.definition.steps ?? [api.league.rule(pipeline: true)]
            guard let original else { return }
            name = original.name
            color = original.color
            kind = original.matrixType
            match = original.matchMode
            matchCount = min(original.matchAnyCount ?? 1, max(1, original.definition.factors?.count ?? 0))
            pipelineScope = original.pipelineScope ?? "team"
        }
        .task(id: gameID) {
            guard api.league == .nba, let gameID else { return }
            let fields = try? await api.nbaTrackingFields(gameID: gameID, mode: mode)
            if !Task.isCancelled { trackingFields = fields ?? [] }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        let definition = pipeline ? ResearchMatrix.Definition(steps: steps) : .init(factors: factors)
        do {
            try await api.save(.init(name: name, color: color, matrix_type: kind, match_mode: match,
                match_any_count: matchCount, pipeline_scope: pipelineScope, definition: definition, expected_updated_at: original?.updatedAt), id: original?.id)
            await didSave()
            dismiss()
        } catch let failure as SlipSurgeHTTP.Status {
            struct Issue: Decodable { let error: String }
            error = (try? JSONDecoder().decode(Issue.self, from: failure.data))?.error ?? "The Matrix couldn’t be saved."
        } catch { self.error = "The Matrix couldn’t be saved. Your edits are still here." }
    }
}

private struct ResearchMatrixRuleEditor: View {
    private static let operators = [
        ("gte", "At least"), ("lte", "At most"), ("eq", "Exactly"), ("up", "Moved up"),
        ("down", "Moved down"), ("flat", "Stayed flat"), ("is_available", "Is posted"),
    ]
    private static let scopes = [("team", "Team"), ("game", "Game")]

    let league: MatrixLeague
    let catalog: ResearchMatrixCatalog
    let trackingFields: [ResearchMatrixCatalog.Field]
    let pipeline: Bool
    @Binding var rule: ResearchMatrix.Rule
    @Environment(\.slipPalette) private var slipPalette

    private var basketball: Bool { league == .nba }
    private var isMarket: Bool { rule.category == "market" }
    private var isPicks: Bool { rule.category == "picks" }
    private var showsMarket: Bool { isMarket || isPicks || (basketball && rule.category == "score") }
    private var showsContract: Bool { basketball ? isMarket || rule.category == "score" : isMarket || isPicks }
    private var halfPoint: Bool { catalog.markets.first { $0.value == rule.propType }?.halfPoint == true }
    private var windows: [(String, String)] {
        let numbers = [1, 3, 5, 10] + (basketball ? [20] : [])
        return (basketball && rule.category == "tracking" ? [] : [("season", "Season")]) + numbers.map { ("l\($0)", "L\($0)") }
    }

    private var categories: [(String, String)] {
        [("score", "SlipSurge Score"), basketball ? ("stats", "Player stats") : ("usage", "Usage"),
         ("tracking", "\(league.title) tracking"), ("team", "Team context")]
            + (basketball ? [] : [("baseline", "TD baseline")]) + [("market", "Sportsbook market"), ("picks", "Public picks")]
    }

    private var movements: [(String, String)] {
        let common = [("current", "Current odds"), ("opening", "Opening odds"), ("move", "Current minus opening odds"),
                      ("line", "Prop line"), ("probability_move", "Implied probability change")]
        if basketball {
            let hasHitRate = !halfPoint && rule.propType?.hasSuffix("first3min") != true
            return common + [("probability", "Implied probability")] + (hasHitRate ? [("hit_rate", "Hit rate")] : [])
        }
        return common + [("ratio", "ATD to contract ratio"), ("ratio_move", "ATD to contract ratio change"), ("estimated_picks", "Estimated over picks")]
    }

    var body: some View {
        Section {
            if pipeline {
                let kinds = [("filter", "Filter"), ("rank", "Rank")] + (basketball ? [("group", "Group"), ("unless", "Unless")] : [])
                choice("Step", selection: value($rule.kind, fallback: "filter"), options: kinds)
            }
            if pipeline && rule.kind == "group" {
                choice("Group by", selection: value($rule.scope, fallback: "team"), options: Self.scopes)
            } else {
                choice("Category", selection: $rule.category, options: categories)
                if !isMarket && !isPicks { fieldControls }
                if showsMarket { marketControls }
                conditionControls
            }
        }
        .listRowBackground(slipPalette.surface)
        .onChange(of: rule.category) { _, category in
            rule.field = isMarket ? "market" : isPicks ? "public_picks" : catalog.fields.first { $0.category == category }?.field ?? "index"
            rule.vendor = isMarket || (basketball && category == "score") ? "fanduel" : nil
            rule.marketValue = isMarket ? (basketball ? "probability_move" : "current") : nil
            rule.propType = showsMarket ? league.defaultMarket : nil
            rule.marketLine = basketball && showsContract ? 15 : nil
            rule.marketKind = basketball && showsContract ? "milestone" : nil
            rule.marketSide = nil
            if basketball && category == "tracking" { rule.window = "l10" }
        }
    }

    private var fieldControls: some View {
        let fields = catalog.fields.filter { $0.category == rule.category }
        let known = Set(fields.map(\.field))
        let extra = rule.category == "tracking" ? trackingFields.filter { !known.contains($0.field) } : []
        let available = (fields + extra).map { ($0.field, $0.label) }
        let options = available.contains { $0.0 == rule.field } ? available : available + [(rule.field, rule.field.replacingOccurrences(of: "_", with: " ").capitalized)]
        return Group {
            choice("Field", selection: $rule.field, options: options)
            if basketball && ["stats", "tracking"].contains(rule.category) {
                choice("Window", selection: $rule.window, options: windows)
                choice("Venue", selection: value($rule.location, fallback: "all"), options: [("all", "All games"), ("home", "Home"), ("away", "Away")])
            } else if !basketball && rule.category != "baseline" {
                choice("Window", selection: $rule.window, options: windows)
            }
        }
    }

    private var marketControls: some View {
        let markets = basketball && !isMarket ? catalog.markets.filter { catalog.scoreMarkets?.contains($0.value) == true } : catalog.markets
        return Group {
            ResearchArtworkPicker(title: "Market", options: markets.map { .init(id: $0.value, title: $0.title, icon: "chart.bar") },
                selection: Binding(get: { rule.propType ?? league.defaultMarket }, set: setMarket))
            if showsContract {
                if basketball {
                    ResearchArtworkPicker(title: "Sportsbook", options: [.init(id: "", title: "Best available", icon: "books.vertical")]
                        + catalog.books.map(ResearchArtworkPicker.Option.sportsbook), selection: value($rule.vendor, fallback: ""))
                } else if isMarket {
                    SportsbookPicker(books: catalog.books, selection: value($rule.vendor, fallback: "fanduel"))
                }
            }
            if isMarket { choice("Market value", selection: value($rule.marketValue, fallback: basketball ? "probability_move" : "current"), options: movements) }
            if showsContract { contractControls }
        }
    }

    @ViewBuilder
    private var contractControls: some View {
        if !halfPoint {
            let contracts = (basketball ? [] : [("", "Primary contract")]) + [("milestone", "Milestone (+)"), ("over_under", "Over or under line")]
            choice("Contract", selection: value($rule.marketKind, fallback: basketball ? "milestone" : ""), options: contracts)
                .onChange(of: rule.marketKind) { _, _ in
                    if basketball && !halfPoint { rule.marketSide = nil }
                }
            TextField("Exact threshold", value: $rule.marketLine, format: .number).keyboardType(.numbersAndPunctuation)
        }
        if halfPoint || !basketball || rule.marketKind == "over_under" {
            choice("Side", selection: value($rule.marketSide, fallback: "over"), options: [("over", halfPoint ? "Yes" : "Over"), ("under", halfPoint ? "No" : "Under")])
        }
        if basketball && rule.marketValue == "hit_rate" { choice("Hit rate window", selection: $rule.window, options: windows) }
    }

    @ViewBuilder
    private var conditionControls: some View {
        if pipeline && rule.kind == "rank" {
            Stepper("Keep \(rule.keep ?? 1)", value: Binding(get: { rule.keep ?? 1 }, set: { rule.keep = $0 }), in: 1...(basketball ? 50 : 20))
            choice("Direction", selection: value($rule.direction, fallback: "highest"), options: [("highest", "Highest"), ("lowest", "Lowest")])
            choice("Scope", selection: value($rule.scope, fallback: "team"), options: Self.scopes)
        } else {
            if pipeline && rule.kind == "filter" { choice("Join", selection: value($rule.join, fallback: "and"), options: [("and", "AND"), ("or", "OR")]) }
            if pipeline && rule.kind == "unless" { choice("Exclude", selection: value($rule.scope, fallback: "team"), options: Self.scopes) }
            choice("Condition", selection: $rule.operator, options: Self.operators)
            if ["gte", "lte", "eq"].contains(rule.operator) {
                TextField("Value", value: $rule.value, format: .number).keyboardType(.numbersAndPunctuation)
            }
        }
    }

    private func setMarket(_ market: String) {
        rule.propType = market
        guard basketball else { return }
        rule.marketLine = halfPoint ? 0.5 : nil
        rule.marketKind = halfPoint ? "over_under" : "milestone"
        rule.marketSide = nil
        if rule.marketValue == "hit_rate" && (halfPoint || market.hasSuffix("first3min")) { rule.marketValue = "probability_move" }
    }

    private func value(_ binding: Binding<String?>, fallback: String) -> Binding<String> {
        Binding(get: { binding.wrappedValue ?? fallback }, set: { binding.wrappedValue = $0.isEmpty ? nil : $0 })
    }

    private func choice(_ title: String, selection: Binding<String>, options: [(String, String)]) -> some View {
        Picker(title, selection: selection) {
            ForEach(options, id: \.0) { key, label in Text(label).tag(key) }
        }
    }
}
