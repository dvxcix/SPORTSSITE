import SwiftUI

struct NflMatrixEditor: View {
    private static let colors = [("#a7ff3f", "Lime"), ("#35d7ff", "Cyan"), ("#ffbd45", "Amber"),
        ("#ff667e", "Rose"), ("#a78bfa", "Violet"), ("#4de2a1", "Mint")]

    let api: NflMatricesAPI
    let catalog: NflMatrixCatalog
    let original: NflMatrix?
    let didSave: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var name = ""
    @State private var color = "#a7ff3f"
    @State private var kind = "classic"
    @State private var match = "all"
    @State private var matchCount = 1
    @State private var pipelineScope = "team"
    @State private var factors: [NflMatrix.Rule] = [.init()]
    @State private var steps: [NflMatrix.Rule] = [.step]
    @State private var busy = false
    @State private var configured = false
    @State private var error: String?

    private var pipeline: Bool { kind == "pipeline" }
    private var rules: Binding<[NflMatrix.Rule]> { pipeline ? $steps : $factors }

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
                }.listRowBackground(Brand.surface(for: scheme))
                ForEach(rules) { $rule in
                    NflMatrixRuleEditor(catalog: catalog, pipeline: pipeline, rule: $rule)
                }
                .onDelete { offsets in
                    rules.wrappedValue.remove(atOffsets: offsets)
                    matchCount = min(matchCount, max(1, factors.count))
                }
                .onMove { indices, offset in rules.wrappedValue.move(fromOffsets: indices, toOffset: offset) }
                Button(pipeline ? "Add step" : "Add condition", systemImage: "plus.circle") {
                    rules.wrappedValue.append(pipeline ? .step : .init())
                }.disabled(rules.wrappedValue.count >= 40)
                if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .navigationTitle(original == nil ? "New NFL Matrix" : "Edit NFL Matrix")
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
            guard !configured, let original else { return }
            configured = true
            name = original.name
            color = original.color
            kind = original.matrixType
            match = original.matchMode
            matchCount = min(original.matchAnyCount ?? 1, max(1, original.definition.factors?.count ?? 0))
            pipelineScope = original.pipelineScope ?? "team"
            factors = original.definition.factors ?? [.init()]
            steps = original.definition.steps ?? [.step]
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        let definition = pipeline ? NflMatrix.Definition(steps: steps) : .init(factors: factors)
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

private struct NflMatrixRuleEditor: View {
    private static let categories = [
        ("score", "SlipSurge Score"), ("usage", "Usage"), ("tracking", "NFL tracking"), ("team", "Team context"),
        ("baseline", "TD baseline"), ("market", "Sportsbook market"), ("picks", "Public picks"),
    ]
    private static let operators = [
        ("gte", "At least"), ("lte", "At most"), ("eq", "Exactly"), ("up", "Moved up"),
        ("down", "Moved down"), ("flat", "Stayed flat"), ("is_available", "Is posted"),
    ]
    private static let movements = [
        ("current", "Current odds"), ("opening", "Opening odds"), ("move", "Current minus opening odds"),
        ("line", "Prop line"), ("probability_move", "Implied probability change"), ("ratio", "ATD to contract ratio"),
        ("ratio_move", "ATD to contract ratio change"), ("estimated_picks", "Estimated over picks"),
    ]

    let catalog: NflMatrixCatalog
    let pipeline: Bool
    @Binding var rule: NflMatrix.Rule
    @Environment(\.colorScheme) private var scheme

    private var inMarket: Bool { rule.category == "market" || rule.category == "picks" }

    var body: some View {
        Section {
            if pipeline { choice("Step", selection: value($rule.kind, fallback: "filter"), options: [("filter", "Filter"), ("rank", "Rank")]) }
            choice("Category", selection: $rule.category, options: Self.categories)
            if inMarket {
                ResearchArtworkPicker(title: "Market", options: catalog.markets.map { .init(id: $0.value, title: $0.title, icon: "chart.bar") },
                    selection: value($rule.propType, fallback: "anytime_td"))
                if rule.category == "market" {
                    SportsbookPicker(books: catalog.books, selection: value($rule.vendor, fallback: "fanduel"))
                    choice("Market value", selection: value($rule.marketValue, fallback: "current"), options: Self.movements)
                }
                TextField("Exact threshold", value: $rule.marketLine, format: .number).keyboardType(.numbersAndPunctuation)
                choice("Market side", selection: value($rule.marketSide, fallback: "over"), options: [("over", "Over or milestone"), ("under", "Under")])
                choice("Contract", selection: value($rule.marketKind, fallback: ""), options: [("", "Primary contract"), ("milestone", "Milestone (+)"), ("over_under", "Over or under line")])
            } else {
                choice("Field", selection: $rule.field, options: catalog.fields.filter { $0.category == rule.category }.map { ($0.field, $0.label) })
                if rule.category != "baseline" {
                    choice("Window", selection: $rule.window, options: [("season", "Season"), ("l1", "L1"), ("l3", "L3"), ("l5", "L5"), ("l10", "L10")])
                }
            }
            if pipeline && rule.kind == "rank" {
                Stepper("Keep \(rule.keep ?? 1)", value: Binding(get: { rule.keep ?? 1 }, set: { rule.keep = $0 }), in: 1...20)
                choice("Direction", selection: value($rule.direction, fallback: "highest"), options: [("highest", "Highest"), ("lowest", "Lowest")])
                choice("Scope", selection: value($rule.scope, fallback: "team"), options: [("team", "Per team"), ("game", "Whole game")])
            } else {
                if pipeline { choice("Join", selection: value($rule.join, fallback: "and"), options: [("and", "AND"), ("or", "OR")]) }
                choice("Condition", selection: $rule.operator, options: Self.operators)
                if ["gte", "lte", "eq"].contains(rule.operator) {
                    TextField("Value", value: $rule.value, format: .number).keyboardType(.numbersAndPunctuation)
                }
            }
        }.listRowBackground(Brand.surface(for: scheme))
            .onChange(of: rule.category) { _, category in
                rule.field = category == "market" ? "market" : category == "picks" ? "public_picks" : catalog.fields.first { $0.category == category }?.field ?? "index"
                rule.vendor = category == "market" ? "fanduel" : nil
                rule.marketValue = category == "market" ? "current" : nil
                rule.propType = inMarket ? "anytime_td" : nil
                rule.marketLine = nil
                rule.marketKind = nil
                rule.marketSide = nil
            }
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
