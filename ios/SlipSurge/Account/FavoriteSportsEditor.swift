import SwiftUI

struct FavoriteSportsEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var selected: Set<String>
    @State private var issue = false
    @State private var saving = false
    private let choices: [String]
    private let save: ([String]) async throws -> Void

    init(sports: [String], allowMLB: Bool, save: @escaping ([String]) async throws -> Void) {
        _selected = State(initialValue: Set(sports))
        let standard = ["NFL", "NBA", "MLB", "NHL", "Soccer", "MMA", "Golf", "Tennis", "Boxing", "College Football", "College Basketball"]
        choices = (standard + sports.filter { !standard.contains($0) }).filter { allowMLB || $0.uppercased() != "MLB" }
        self.save = save
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(choices, id: \.self) { sport in
                    Toggle(isOn: Binding(get: { selected.contains(sport) }, set: { enabled in
                        if enabled { selected.insert(sport) } else { selected.remove(sport) }
                    })) {
                        HStack(spacing: 12) {
                            ResearchArtwork(urls: LeagueArtwork.logo(sport).map { [$0] } ?? [], fallback: "sportscourt")
                                .frame(width: 25, height: 25)
                            Text(verbatim: sport)
                        }
                    }.listRowBackground(slipPalette.surface)
                }
                if issue { Text("Sports couldn’t be saved. Try again.").foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(slipPalette.background)
            .navigationTitle("Favorite sports")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await apply() } } }
            }
            .disabled(saving)
        }
    }

    private func apply() async {
        saving = true
        issue = false
        defer { saving = false }
        do {
            try await save(choices.filter(selected.contains))
            dismiss()
        } catch { issue = true }
    }
}
