import SwiftUI

struct ResearchSavedFilters<Filters: Codable & Equatable>: View {
    private struct Preset: Codable, Identifiable {
        var id = UUID()
        var name: String
        var filters: Filters
    }

    private enum Sheet: String, Identifiable {
        case save, manage
        var id: Self { self }
    }

    private let current: Filters
    private let apply: (Filters) -> Void
    @AppStorage private var data: Data
    @State private var sheet: Sheet?

    init(account: UUID, board: String, current: Filters, apply: @escaping (Filters) -> Void) {
        self.current = current
        self.apply = apply
        _data = AppStorage(wrappedValue: Data(), "research.presets.v1.\(account.uuidString).\(board)")
    }

    private var presets: [Preset] {
        (try? JSONDecoder().decode([Preset].self, from: data)) ?? []
    }

    var body: some View {
        Menu {
            ForEach(presets) { preset in
                Button {
                    apply(preset.filters)
                } label: {
                    Label(preset.name, systemImage: preset.filters == current ? "checkmark" : "line.3.horizontal.decrease")
                }
            }
            Button("Save current filters", systemImage: "bookmark.badge.plus") { sheet = .save }
                .disabled(presets.count >= 24)
            Button("Manage saved filters", systemImage: "slider.horizontal.3") { sheet = .manage }
        } label: {
            Label("Saved filters", systemImage: "bookmark")
                .font(.subheadline.weight(.semibold))
                .frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .sheet(item: $sheet) { destination in
            Settings(data: $data, current: current, startNaming: destination == .save, apply: apply)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private struct Settings: View {
        @Binding var data: Data
        let current: Filters
        let apply: (Filters) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var naming: Bool
        @State private var name = ""
        @State private var renaming: UUID?
        @State private var message: String?

        init(data: Binding<Data>, current: Filters, startNaming: Bool, apply: @escaping (Filters) -> Void) {
            _data = data
            self.current = current
            self.apply = apply
            _naming = State(initialValue: startNaming)
        }

        private var presets: [Preset] {
            (try? JSONDecoder().decode([Preset].self, from: data)) ?? []
        }

        var body: some View {
            NavigationStack {
                Form {
                    if naming {
                        Section(renaming == nil ? "Name this filter" : "Rename filter") {
                            TextField("Filter name", text: $name)
                                .submitLabel(.done)
                                .onSubmit(save)
                            Button("Save", action: save).fontWeight(.semibold)
                            Button("Cancel", role: .cancel) { naming = false; message = nil }
                        }
                    } else {
                        if presets.isEmpty {
                            Text("Save the current filters to use them on another matchup.")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(presets) { preset in presetRow(preset) }
                        Button("Save current filters", systemImage: "bookmark.badge.plus") { beginNaming() }
                            .disabled(presets.count >= 24)
                    }
                    if let message { Text(message).foregroundStyle(.secondary) }
                }
                .navigationTitle("Saved filters")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                }
            }
        }

        private func presetRow(_ preset: Preset) -> some View {
            HStack {
                Button(preset.name) {
                    apply(preset.filters)
                    dismiss()
                }
                .buttonStyle(.borderless)
                Spacer()
                Menu("Actions for \(preset.name)", systemImage: "ellipsis") {
                    Button("Rename", systemImage: "pencil") { beginNaming(preset) }
                    Button("Update with current filters", systemImage: "arrow.clockwise") {
                        let updated = presets.map { item in
                            guard item.id == preset.id else { return item }
                            var result = item
                            result.filters = current
                            return result
                        }
                        persist(updated)
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) {
                        persist(presets.filter { $0.id != preset.id })
                    }
                }
                .labelStyle(.iconOnly)
            }
        }

        private func beginNaming(_ preset: Preset? = nil) {
            renaming = preset?.id
            name = preset?.name ?? ""
            message = nil
            naming = true
        }

        private func save() {
            let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...40).contains(clean.count), !clean.contains(where: \.isNewline) else {
                message = "Enter a filter name from 1 to 40 characters."
                return
            }
            var items = presets
            guard !items.contains(where: { $0.id != renaming && $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) else {
                message = "A saved filter already has that name."
                return
            }
            if let renaming, let index = items.firstIndex(where: { $0.id == renaming }) {
                items[index].name = clean
            } else if items.count < 24 {
                items.append(Preset(name: clean, filters: current))
            } else {
                message = "You can save up to 24 filters per board."
                return
            }
            persist(items)
            if message == nil { naming = false }
        }

        private func persist(_ items: [Preset]) {
            guard let encoded = try? JSONEncoder().encode(items) else {
                message = "Couldn’t save filters."
                return
            }
            data = encoded
            message = nil
        }
    }
}
