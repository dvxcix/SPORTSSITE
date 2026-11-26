import SwiftUI

struct CommunityPageEditor: View {
    let api: CommunityPagesAPI
    @State var draft: CommunityPagesAPI.Draft
    let saved: (CommunityPagesAPI.Page) -> Void
    let deleted: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @State private var busy = false
    @State private var confirmingDelete = false
    @State private var issue: String?

    private let categories = ["", "Team", "Athlete", "Media", "Brand", "Community", "Podcast", "Other"]
    private let sports = ["", "MLB", "NFL", "NBA", "NHL", "Soccer", "MMA"]
    private let icons = ["⭐", "🏈", "⚾", "🏀", "🏒", "⚽", "🎯", "🔥", "💰", "📊"]

    private var canSave: Bool {
        !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.name.utf16.count <= 60
            && draft.description.utf16.count <= 280 && draft.avatar.utf16.count <= 500 && draft.banner.utf16.count <= 500
    }

    var body: some View {
        Form {
            Section("Page details") {
                TextField("Page name", text: $draft.name)
                TextField("Description", text: $draft.description, axis: .vertical).lineLimit(2...5)
                ResearchArtworkPicker(title: "Category", options: categories.map { category in
                    .init(id: category, title: category.isEmpty ? "Choose a category" : category, icon: CommunityPagesView.icon(category))
                }, selection: $draft.category)
                ResearchArtworkPicker(title: "Sport", options: sports.map { sport in
                    .init(id: sport, title: sport.isEmpty ? "General" : sport, url: LeagueArtwork.logo(sport), icon: "sportscourt")
                }, selection: $draft.sport)
            }
            Section("Page icon") {
                LazyVGrid(columns: [.init(.adaptive(minimum: 46), spacing: 6)], spacing: 6) {
                    ForEach(icons, id: \.self) { icon in
                        Button { draft.emoji = icon } label: {
                            Text(icon).font(.title2).frame(maxWidth: .infinity, minHeight: 44)
                                .background(draft.emoji == icon ? slipPalette.accent.opacity(0.16) : Color.clear, in: .rect(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Page icon \(icon)")
                        .accessibilityAddTraits(draft.emoji == icon ? .isSelected : [])
                    }
                }
            }
            if draft.page != nil {
                Section("Images") {
                    TextField("Avatar image link", text: $draft.avatar)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let url = URL(string: draft.avatar), url.scheme == "https" { ArticleCover(url: url, height: 92).clipShape(.rect(cornerRadius: 10)) }
                    TextField("Banner image link", text: $draft.banner)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let url = URL(string: draft.banner), url.scheme == "https" { ArticleCover(url: url, height: 128).clipShape(.rect(cornerRadius: 10)) }
                }
                Section("Visibility") { Toggle("Published", isOn: $draft.published) }
                Section {
                    Button("Delete page", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                }
            }
            if let issue { Section { Text(issue).font(.subheadline).foregroundStyle(.secondary) } }
        }
        .disabled(busy)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .navigationTitle(draft.page == nil ? "Create page" : "Manage page")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(busy) }
            ToolbarItem(placement: .confirmationAction) {
                if busy { ProgressView() }
                else { Button(draft.page == nil ? "Create" : "Save") { Task { await save() } }.disabled(!canSave) }
            }
        }
        .sensoryFeedback(.selection, trigger: draft.emoji)
        .interactiveDismissDisabled(busy)
        .confirmationDialog("Delete \(draft.page?.name ?? "this page")?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete page", role: .destructive) { Task { await deletePage() } }
        }
    }

    private func save() async {
        guard canSave, !busy else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do { saved(try await api.save(draft)) }
        catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            issue = draft.page == nil ? "This name is already in use." : "This page changed elsewhere. Reopen it before saving."
        } catch { issue = "The page couldn’t be saved. Your changes are still here." }
    }

    private func deletePage() async {
        guard let id = draft.page?.id, !busy else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do { try await api.delete(id); deleted() }
        catch { issue = "The page couldn’t be deleted. Reload to confirm its current state." }
    }
}
