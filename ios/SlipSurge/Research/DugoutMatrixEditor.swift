import SwiftUI

struct DugoutMatrixEditor: View {
    let original: DugoutMatrix?
    let onSave: (DugoutMatrix.Draft) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: DugoutMatrix.Draft
    @State private var factors: [DugoutMatrix.Rule]
    @State private var steps: [DugoutMatrix.Rule]
    @State private var saving = false
    @State private var failure: String?

    private static let colors = ["#A3F03B", "#F6BE4F", "#FA6A81", "#AF85FB", "#53B5FF", "#22D6AC", "#D5DFEC", "#FF8F4F"]

    init(original: DugoutMatrix?, onSave: @escaping (DugoutMatrix.Draft) async throws -> Void) {
        self.original = original
        self.onSave = onSave
        _draft = State(initialValue: original.map(DugoutMatrix.Draft.init) ?? .init())
        _factors = State(initialValue: original?.factors.isEmpty == false ? original?.factors ?? [] : [.init()])
        _steps = State(initialValue: original?.pipeline_steps.isEmpty == false ? original?.pipeline_steps ?? [] : [.step()])
    }

    private var pipeline: Bool { draft.matrix_type == "pipeline" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Matrix name", text: $draft.name)
                    ColorPicker("Color", selection: Binding(get: { Color(hex: draft.color) ?? .green }, set: { draft.color = Self.hex($0) }), supportsOpacity: false)
                    colorSwatches
                    if original != nil { Toggle("Enabled", isOn: $draft.enabled) }
                    if original == nil {
                        Picker("Type", selection: $draft.matrix_type) {
                            Text("Classic").tag("classic"); Text("Pipeline").tag("pipeline")
                        }.pickerStyle(.segmented)
                    }
                    Stepper("Priority \(draft.priority)", value: $draft.priority, in: 1...100)
                }
                if pipeline {
                    Section("Pipeline") {
                        DugoutMatrixRuleEditor.optionalPicker("Initial pool", selection: $draft.pipeline_scope,
                            options: [("team", "One team"), ("game", "Both teams")], fallback: "team")
                        DugoutMatrixRules(rules: $steps, pipe: true, nested: false, anchorAllowed: false)
                    }
                } else {
                    Section("Factors") {
                        Picker("Match", selection: $draft.match_mode) {
                            Text("All factors").tag("all"); Text("At least a number of factors").tag("any")
                        }
                        if draft.match_mode == "any" {
                            Stepper("At least \(draft.match_any_count ?? 1)", value: Binding(get: { draft.match_any_count ?? 1 },
                                set: { draft.match_any_count = $0 }), in: 1...max(1, factors.count))
                        }
                        DugoutMatrixRules(rules: $factors, pipe: false, nested: false, anchorAllowed: false)
                    }
                }
                if let failure { Text(failure).foregroundStyle(.red) }
            }
            .scrollDismissesKeyboard(.interactively)
            .keyboardDone()
            .navigationTitle(original == nil ? "New MLB Matrix" : "Edit MLB Matrix")
            .navigationBarTitleDisplayMode(.inline)
            .disabled(saving)
            .interactiveDismissDisabled(saving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(saving || draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (pipeline ? steps.isEmpty : factors.isEmpty))
                }
            }
        }
    }

    private var colorSwatches: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.colors, id: \.self) { hex in
                    Button { draft.color = hex } label: {
                        Circle().fill(Color(hex: hex) ?? .green).frame(width: 29, height: 29)
                            .overlay { if draft.color == hex { Image(systemName: "checkmark").foregroundStyle(.black) } }
                            .frame(width: 43, height: 43)
                    }.buttonStyle(.plain)
                        .accessibilityLabel(Text(hex)).accessibilityAddTraits(draft.color == hex ? .isSelected : [])
                }
            }
        }.scrollIndicators(.hidden)
    }

    private static func hex(_ color: Color) -> String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, opacity: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &opacity) else { return "#A3F03B" }
        return String(format: "#%02X%02X%02X", Int((red * 255).rounded()), Int((green * 255).rounded()), Int((blue * 255).rounded()))
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        failure = nil
        defer { saving = false }
        var changes = draft
        changes.factors = pipeline ? nil : factors
        changes.pipeline_steps = pipeline ? steps : nil
        if changes.match_mode == "any" { changes.match_any_count = min(changes.match_any_count ?? 1, max(1, factors.count)) }
        do {
            try await onSave(changes)
            dismiss()
        } catch { failure = dugoutMatrixError(error) }
    }
}

struct DugoutMatrixRules: View {
    @Binding var rules: [DugoutMatrix.Rule]
    let pipe: Bool
    let nested: Bool
    let anchorAllowed: Bool

    private var kinds: [String] { nested ? ["filter", "group", "rank"] : ["filter", "group", "rank", "unless"] }

    var body: some View {
        ForEach($rules) { $rule in
            NavigationLink {
                DugoutMatrixRuleEditor(rule: $rule, pipe: pipe, nested: nested, anchorAllowed: anchorAllowed)
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(DugoutMatrixCatalog.field(rule.category, rule.field_key)?.label ?? rule.field_key).fontWeight(.medium)
                    if let kind = rule.kind {
                        Text(kind.capitalized).font(.caption).foregroundStyle(.secondary)
                    } else if let comparator = rule.operator {
                        Text(DugoutMatrixRuleEditor.operations.first { $0.0 == comparator }?.1 ?? comparator)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .onDelete { rules.remove(atOffsets: $0) }
        .onMove { rules.move(fromOffsets: $0, toOffset: $1) }
        if pipe {
            Menu("Add step", systemImage: "plus") {
                ForEach(kinds, id: \.self) { kind in
                    Button(kind.capitalized) { rules.append(.step(kind, previous: rules.last)) }
                }
            }.disabled(rules.count >= 50)
        } else {
            Button("Add factor", systemImage: "plus") { rules.append(.init()) }.disabled(rules.count >= 40)
        }
    }
}

struct DugoutMatrixRuleEditor: View {
    @Binding var rule: DugoutMatrix.Rule
    let pipe: Bool
    let nested: Bool
    let anchorAllowed: Bool

    static let operations = [
        ("gte", "At least"), ("lte", "At most"), ("eq", "Exactly"), ("is_null", "Missing"), ("is_not_null", "Present"),
        ("up", "Moved up since open"), ("down", "Moved down since open"), ("flat", "Unchanged since open"),
        ("up_or_flat", "Moved up or held"), ("down_or_flat", "Moved down or held"), ("positive", "Positive"),
        ("negative", "Negative"), ("zero", "Zero"), ("tied", "Tied"), ("mm_trend", "MM trend"),
        ("lt_anchor", "Below the anchor"), ("gt_anchor", "Above the anchor"),
    ]
    static let directions = [("highest", "Highest"), ("lowest", "Lowest"), ("closest_zero", "Closest to zero"), ("farthest_zero", "Farthest from zero")]
    static let books = ["fanduel", "caesars", "betmgm", "betrivers", "fanatics"]
    private static let windows = [("l1", "L1"), ("l3", "L3"), ("l5", "L5"), ("l10", "L10")]
    private static let recency = [("game", "Last 1"), ("l3", "Last 3"), ("l5", "Last 5"), ("l10", "Last 10"), ("season", "Season")]
    private static let deltas = [("game_delta", "Last 1 vs. season"), ("l3_delta", "Last 3 vs. season"), ("l5_delta", "Last 5 vs. season"), ("l10_delta", "Last 10 vs. season")]
    private static let trend = [("increased", "Increased"), ("decreased", "Decreased"), ("moved", "Moved"),
        ("crossed_positive", "Turned positive"), ("crossed_negative", "Turned negative"), ("flat", "Held")]
    private var field: DugoutMatrixCatalog.Field? { DugoutMatrixCatalog.field(rule.category, rule.field_key) }
    private var threshold: Bool { !pipe || rule.kind == "filter" }

    var body: some View {
        Form {
            if pipe {
                Section {
                    Text(rule.kind?.capitalized ?? "Filter").font(.headline)
                    if rule.kind == "filter" {
                        Self.optionalPicker("Join", selection: $rule.join_mode, options: [("and", "All previous conditions"), ("or", "Any condition")], fallback: "and")
                    }
                }
            }
            if threshold || rule.kind != "unless" || rule.uses_anchor == true { fieldControls }
            if threshold { thresholdControls }
            if rule.kind == "rank" { rankControls }
            if rule.kind == "unless", !nested { unlessControls }
        }
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .navigationTitle(pipe ? (rule.kind?.capitalized ?? "Step") : "Factor")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { EditButton() } }
    }

    private var fieldControls: some View {
        Section("Field") {
            Picker("Category", selection: $rule.category) {
                ForEach(DugoutMatrixCatalog.categories) { Text($0.title).tag($0.id) }
            }
            Picker("Metric", selection: $rule.field_key) {
                let fields = DugoutMatrixCatalog.fields(rule.category).filter { threshold || !$0.boolean }
                if !fields.contains(where: { $0.id == rule.field_key }) { Text(rule.field_key).tag(rule.field_key) }
                ForEach(fields) { Text($0.label).tag($0.id) }
            }
            if rule.category == "pitchlog_stat" || rule.category == "savant_stat" || ["mm", "bk_rk", "pp_rk"].contains(rule.field_key) {
                Self.optionalPicker("Window", selection: $rule.recency, options: availableRecency, fallback: "l5")
                if rule.recency == "custom", !pipe {
                    TextField("Start date (YYYY-MM-DD)", text: Self.string($rule.recency_start)).keyboardType(.numbersAndPunctuation)
                    TextField("End date (YYYY-MM-DD)", text: Self.string($rule.recency_end)).keyboardType(.numbersAndPunctuation)
                }
            }
            if rule.category == "odds", ["fhr", "hr"].contains(rule.field_key) {
                if threshold { bookChoices } else { Self.bookPicker($rule.book) }
            }
            if rule.field_key == "mm_move" { Self.mmWindows(base: $rule.mm_base_window, others: $rule.mm_compare_windows) }
        }
        .onChange(of: rule.category) { _, category in
            if let first = DugoutMatrixCatalog.fields(category).first(where: { threshold || !$0.boolean }) { rule.field_key = first.id }
        }
        .onChange(of: rule.field_key) {
            rule.recency = rule.category == "pitchlog_stat" || rule.category == "savant_stat" || ["mm", "bk_rk", "pp_rk"].contains(rule.field_key) ? "l5" : nil
            if threshold { rule.operator = field?.boolean == true ? "eq" : "gte"; rule.value = field?.boolean == true ? 1 : nil }
            rule.book = nil
            rule.books = nil
        }
    }

    private var availableRecency: [(String, String)] {
        if rule.category == "dugout_specs" { return Array(Self.recency.prefix(4)) }
        let deltaKeys = ["bspd", "sweetspot", "swlen", "atk", "tilt", "brl", "hh", "avgev", "la", "sq", "hardsw", "blast", "idlaa", "timing", "miss", "pullair", "fb"]
        let choices = Self.recency + (deltaKeys.contains(rule.field_key) ? Self.deltas : [])
        return choices + (!pipe && rule.category == "pitchlog_stat" ? [("custom", "Custom date range")] : [])
    }

    private var bookChoices: some View {
        DisclosureGroup("Sportsbooks") {
            ForEach(Self.books, id: \.self) { book in
                Button {
                    if rule.books == nil { rule.books = ["fanduel"] }
                    Self.toggle(book, in: $rule.books)
                } label: {
                    HStack {
                        if let asset = Sportsbook.artwork(Sportsbook.normalized(book)) {
                            Image(asset).resizable().scaledToFit().frame(width: 21, height: 21).accessibilityHidden(true)
                        }
                        Text(Sportsbook.name(Sportsbook.normalized(book)))
                        Spacer()
                        if (rule.books ?? ["fanduel"]).contains(book) { Image(systemName: "checkmark.circle.fill") }
                    }
                }.buttonStyle(.plain)
            }
            if let books = rule.books, books.count > 1 {
                Toggle("Require a minimum number", isOn: Binding(get: { rule.books_min_count != nil }, set: { rule.books_min_count = $0 ? 1 : nil }))
                if let count = rule.books_min_count {
                    Stepper("At least \(count) books", value: Binding(get: { count }, set: { rule.books_min_count = $0 }), in: 1...books.count)
                }
            }
        }
        .onChange(of: rule.books) { _, allowed in if let count = rule.books_min_count, count > (allowed?.count ?? 1) { rule.books_min_count = nil } }
    }

    @ViewBuilder
    private var thresholdControls: some View {
        Section("Condition") {
            if field?.boolean == true {
                Picker("Matches", selection: Binding(get: { rule.value == 1 }, set: { rule.operator = "eq"; rule.value = $0 ? 1 : 0 })) {
                    Text("Yes").tag(true); Text("No").tag(false)
                }
            } else {
                Self.optionalPicker("Operator", selection: $rule.operator, options: validOperations, fallback: "gte")
                if ["gte", "lte", "eq"].contains(rule.operator ?? "gte") {
                    TextField("Value", value: $rule.value, format: .number).keyboardType(.numbersAndPunctuation)
                }
                if rule.operator == "mm_trend" {
                    Self.mmWindows(base: $rule.mm_base_window, others: $rule.mm_compare_windows)
                    Self.optionalPicker("Direction", selection: $rule.mm_direction, options: Self.trend, fallback: "moved")
                    Self.optionalPicker("Comparison windows", selection: $rule.mm_match_mode,
                        options: [("any", "Any window"), ("all", "Every window")], fallback: "any")
                    if rule.mm_direction == "increased" || rule.mm_direction == "decreased" || rule.mm_direction == "moved" {
                        Self.optionalPicker("Amount", selection: $rule.mm_amount_mode,
                            options: [("at_least", "At least"), ("exactly", "Exactly")], fallback: "at_least")
                        TextField("MM change", value: $rule.value, format: .number).keyboardType(.numbersAndPunctuation)
                    }
                }
            }
        }
        .onChange(of: rule.operator) { _, option in
            if option == "mm_trend", rule.mm_direction == nil { rule.mm_direction = "moved" }
        }
        if rule.operator == "tied", !pipe { tieControls }
    }

    private var validOperations: [(String, String)] {
        var allowed: Set<String> = ["gte", "lte", "eq", "is_null", "is_not_null"]
        if rule.category == "odds", !["booksfhr", "bookshr"].contains(rule.field_key) {
            allowed.formUnion(["up", "down", "flat", "up_or_flat", "down_or_flat"])
        }
        if field?.signed == true || rule.recency?.hasSuffix("_delta") == true { allowed.formUnion(["positive", "negative", "zero"]) }
        if !pipe { allowed.insert("tied") }
        if rule.field_key == "mm" { allowed.insert("mm_trend") }
        if anchorAllowed { allowed.formUnion(["lt_anchor", "gt_anchor"]) }
        return Self.operations.filter { allowed.contains($0.0) }
    }

    private var tieControls: some View {
        Section("Tiebreakers") {
            Self.optionalPicker("Compare", selection: $rule.tie_scope, options: [("team", "One team"), ("game", "Both teams")], fallback: "team")
            Self.optionalPicker("Tie groups", selection: $rule.tie_direction,
                options: [("", "Every tied value"), ("highest", "Highest tied value"), ("lowest", "Lowest tied value")], fallback: "")
            let ties = Self.list($rule.tiebreakers)
            ForEach(ties) { $tie in
                NavigationLink {
                    DugoutMatrixTieEditor(tie: $tie)
                } label: { Text(DugoutMatrixCatalog.field(tie.category, tie.field_key)?.label ?? tie.field_key) }
            }
            .onDelete { ties.wrappedValue.remove(atOffsets: $0) }
            .onMove { ties.wrappedValue.move(fromOffsets: $0, toOffset: $1) }
            Button("Add tiebreaker", systemImage: "plus") { ties.wrappedValue.append(.init()) }.disabled(ties.wrappedValue.count >= 5)
        }
    }

    private var rankControls: some View {
        Section("Keep") {
            Self.optionalPicker("Direction", selection: $rule.direction, options: Self.directions, fallback: "highest")
            TextField("Tolerance", value: $rule.tolerance, format: .number).keyboardType(.numbersAndPunctuation)
            if rule.direction == "closest_zero" { Toggle("Include zero", isOn: Self.boolean($rule.zero_eligible, fallback: false)) }
        }
    }

    private var unlessControls: some View {
        Group {
            Section("If these conditions match") {
                Self.optionalPicker("Search", selection: $rule.condition_scope, options: [("team", "One team"), ("game", "Both teams")], fallback: "game")
                Toggle("Compare against an anchor", isOn: Self.boolean($rule.uses_anchor, fallback: false))
                DugoutMatrixRules(rules: Self.list($rule.condition_steps), pipe: true, nested: true, anchorAllowed: rule.uses_anchor == true)
            }
            Section("Then") {
                Self.optionalPicker("Result", selection: $rule.unless_mode,
                    options: [("replace", "Replace matches"), ("add", "Add matches"), ("suppress", "Suppress matches")], fallback: "replace")
                if rule.unless_mode != "suppress" {
                    DugoutMatrixRules(rules: Self.list($rule.then_steps), pipe: true, nested: true, anchorAllowed: false)
                }
            }
        }
    }

    static func optionalPicker(_ title: String, selection: Binding<String?>, options: [(String, String)], fallback: String) -> some View {
        Picker(title, selection: Binding(get: { selection.wrappedValue ?? fallback }, set: { selection.wrappedValue = $0.isEmpty ? nil : $0 })) {
            if let current = selection.wrappedValue, !options.contains(where: { $0.0 == current }) { Text(current).tag(current) }
            ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
        }
    }

    static func bookPicker(_ selection: Binding<String?>) -> some View {
        ResearchArtworkPicker(title: "Sportsbook", options: Self.books.map { book in
            .init(id: book, title: Sportsbook.name(Sportsbook.normalized(book)), asset: Sportsbook.artwork(Sportsbook.normalized(book)), icon: "chart.bar")
        }, selection: Binding(get: { selection.wrappedValue ?? "fanduel" }, set: { selection.wrappedValue = $0 }))
    }

    static func mmWindows(base: Binding<String?>, others: Binding<[String]?>) -> some View {
        Group {
            optionalPicker("From", selection: base, options: windows, fallback: "l1")
            DisclosureGroup("Compare to") {
                ForEach(windows.filter { $0.0 != (base.wrappedValue ?? "l1") }, id: \.0) { key, label in
                    Toggle(label, isOn: Binding(get: { others.wrappedValue?.contains(key) == true }, set: { _ in toggle(key, in: others) }))
                }
            }
        }
        .onChange(of: base.wrappedValue) { _, next in
            if let next { others.wrappedValue?.removeAll { $0 == next } }
        }
        .onAppear { if base.wrappedValue == nil { base.wrappedValue = "l1" } }
    }

    static func string(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 })
    }

    static func list<T>(_ value: Binding<[T]?>) -> Binding<[T]> {
        Binding(get: { value.wrappedValue ?? [] }, set: { value.wrappedValue = $0 })
    }

    static func boolean(_ value: Binding<Bool?>, fallback: Bool) -> Binding<Bool> {
        Binding(get: { value.wrappedValue ?? fallback }, set: { value.wrappedValue = $0 })
    }

    private static func toggle(_ key: String, in value: Binding<[String]?>) {
        var list = value.wrappedValue ?? []
        if list.contains(key) { list.removeAll { $0 == key } } else { list.append(key) }
        value.wrappedValue = list
    }
}

private struct DugoutMatrixTieEditor: View {
    @Binding var tie: DugoutMatrix.Tie

    var body: some View {
        Form {
            Picker("Category", selection: $tie.category) {
                ForEach(DugoutMatrixCatalog.categories) { Text($0.title).tag($0.id) }
            }
            Picker("Metric", selection: $tie.field_key) {
                ForEach(DugoutMatrixCatalog.fields(tie.category).filter { !$0.boolean }) { Text($0.label).tag($0.id) }
            }
            DugoutMatrixRuleEditor.optionalPicker("Direction", selection: Binding(get: { tie.direction }, set: { tie.direction = $0 ?? "highest" }),
                options: DugoutMatrixRuleEditor.directions, fallback: "highest")
            TextField("Tolerance", value: $tie.tolerance, format: .number).keyboardType(.numbersAndPunctuation)
            if tie.direction == "closest_zero" {
                Toggle("Include zero", isOn: DugoutMatrixRuleEditor.boolean($tie.zero_eligible, fallback: false))
            }
            if tie.field_key == "mm_move" {
                DugoutMatrixRuleEditor.mmWindows(base: $tie.mm_base_window, others: $tie.mm_compare_windows)
            } else if ["pitchlog_stat", "savant_stat"].contains(tie.category) || ["mm", "bk_rk", "pp_rk"].contains(tie.field_key) {
                DugoutMatrixRuleEditor.optionalPicker("Window", selection: $tie.recency,
                    options: [("game", "Last 1"), ("l3", "Last 3"), ("l5", "Last 5"), ("l10", "Last 10"), ("season", "Season")], fallback: "l5")
            }
            if tie.category == "odds", ["fhr", "hr"].contains(tie.field_key) { DugoutMatrixRuleEditor.bookPicker($tie.book) }
        }
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .navigationTitle("Tiebreaker")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: tie.category) { _, category in
            if let field = DugoutMatrixCatalog.fields(category).first(where: { !$0.boolean }) { tie.field_key = field.id }
        }
    }
}

func dugoutMatrixError(_ error: any Error) -> String {
    struct Failure: Decodable { let error: String? }
    if let status = error as? SlipSurgeHTTP.Status, let message = (try? JSONDecoder().decode(Failure.self, from: status.data))?.error {
        return message
    }
    return "The Matrix change couldn’t be confirmed. Refresh before trying again."
}
