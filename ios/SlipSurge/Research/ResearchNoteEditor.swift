import SwiftUI

struct ResearchNoteEditor: View {
    let original: ResearchLibraryData.Note?
    let showMlb: Bool
    let save: (String, String, String?) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var bodyText = ""
    @State private var sport = ""
    @State private var busy = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                TextEditor(text: $bodyText).frame(minHeight: 125).accessibilityLabel("Note text")
                if original == nil {
                    ResearchArtworkPicker(title: "Sport", options: [.init(id: "", title: "Any sport", icon: "sportscourt")]
                        + (showMlb ? ["NFL", "NBA", "MLB"] : ["NFL", "NBA"]).map {
                            .init(id: $0, title: $0, url: LeagueArtwork.logo($0), icon: "sportscourt")
                        }, selection: $sport)
                }
                if failed { Text("The note couldn’t be saved.").foregroundStyle(.secondary) }
            }
            .navigationTitle(original == nil ? "New note" : "Edit note")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if let original, title.isEmpty { title = original.title; bodyText = original.body; sport = original.sport ?? "" }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await submit() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.utf16.count > 100 || bodyText.utf16.count > 10_000)
                }
            }
        }
        .interactiveDismissDisabled(busy)
    }

    private func submit() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await save(title, bodyText, sport.isEmpty ? nil : sport); dismiss() }
        catch { failed = true }
    }
}
