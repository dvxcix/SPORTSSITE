import SwiftUI

struct ResearchPreferencesView: View {
    let api: MemberResearchPreferencesAPI
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.openURL) private var openURL
    @Environment(\.memberResearchPreferences) private var store
    @State private var options: MemberResearchOptions?
    @State private var draft: MemberResearchPreferences?
    @State private var loading = false
    @State private var saving = false
    @State private var problem: String?
    @State private var uncertain = false
    @State private var saved = false

    var body: some View {
        Form {
            if let options, let draft {
                launchSection(options, draft: draft)
                booksSection(options, draft: draft)
                actions(options, draft: draft)
            } else if !loading, problem != nil {
                Button("Reload settings") { Task { await load() } }
            } else {
                ProgressView("Loading your preferences")
            }
            if let problem { Text(problem).foregroundStyle(.red) }
            if saved { Label("Preferences saved", systemImage: "checkmark.circle").foregroundStyle(slipPalette.accent) }
        }
        .navigationTitle("Research preferences")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task { await load() }
        .sensoryFeedback(.success, trigger: saved) { _, value in value }
    }

    private func launchSection(_ options: MemberResearchOptions, draft: MemberResearchPreferences) -> some View {
        let groups = ["Workspace", "Community", "NBA", "NFL"]
        return Section {
            let selected = options.launchPages.first { $0.id == draft.launchPage }
            Menu {
                ForEach(groups, id: \.self) { group in
                    let pages = options.launchPages.filter { $0.group == group && $0.destination != nil }
                    if !pages.isEmpty {
                        Section(group) {
                            ForEach(pages) { page in
                                Button {
                                    edit { $0.launchPage = page.id }
                                } label: {
                                    let icon = page.id == draft.launchPage ? "checkmark" : page.eligible ? "arrow.up.forward" : "lock"
                                    Label(page.label, systemImage: icon)
                                }
                                .disabled(!page.eligible)
                            }
                        }
                    }
                }
            } label: {
                LabeledContent("Open SlipSurge to", value: selected?.label ?? "Feed")
            }
            .disabled(saving || uncertain)
        } header: { Text("Launch page") }
        .listRowBackground(slipPalette.surface)
    }

    private func booksSection(_ options: MemberResearchOptions, draft: MemberResearchPreferences) -> some View {
        Section {
            ForEach(options.books) { book in
                let item = ResearchArtworkPicker.Option.sportsbook(book.id)
                let selected = draft.books.contains(book.id)
                Button {
                    edit {
                        if selected { $0.books.removeAll { $0 == book.id } }
                        else { $0.books.append(book.id) }
                        if let primary = $0.primaryBook, $0.books.contains(primary) { return }
                        $0.primaryBook = $0.books.first
                    }
                } label: {
                    HStack {
                        if let asset = item.asset {
                            Image(asset).resizable().scaledToFit().frame(width: 23, height: 23).accessibilityHidden(true)
                        } else {
                            ResearchArtwork(urls: item.url.map { [$0] } ?? [], fallback: item.icon)
                                .frame(width: 23, height: 23).accessibilityHidden(true)
                        }
                        Text(verbatim: book.label)
                        Spacer()
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(selected ? slipPalette.accent : Color.secondary)
                            .accessibilityHidden(true)
                    }
                    .contentShape(.rect)
                }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
            }
            if draft.books.isEmpty {
                LabeledContent("Primary book", value: "Tool defaults")
            } else {
                ResearchArtworkPicker(title: "Primary book", options: draft.books.map(ResearchArtworkPicker.Option.sportsbook),
                    selection: Binding(get: { self.draft?.primaryBook ?? "" }, set: { value in edit { $0.primaryBook = value } }))
            }
        } header: { Text("Sportsbooks") }
        .listRowBackground(slipPalette.surface)
        .disabled(saving || uncertain)
    }

    private func actions(_ options: MemberResearchOptions, draft: MemberResearchPreferences) -> some View {
        Section {
            Button {
                Task { await save(draft, options: options) }
            } label: {
                if saving { ProgressView() }
                else { Label("Save preferences", systemImage: "checkmark") }
            }
            .disabled(saving || uncertain || options.preferences == draft)
            Button("Reset defaults", systemImage: "arrow.counterclockwise") { edit { $0 = options.defaults } }
                .disabled(saving || uncertain || draft == options.defaults)
            if let launch = options.launch {
                Button("Open my launch page", systemImage: "arrow.up.forward.app") { openURL(launch) }
                    .disabled(saving)
            }
            if uncertain { Button("Reload settings") { Task { await load() } }.disabled(loading) }
        }.listRowBackground(slipPalette.surface)
    }

    private func edit(_ change: (inout MemberResearchPreferences) -> Void) {
        guard var draft else { return }
        change(&draft)
        self.draft = draft
        saved = false
        problem = nil
    }

    private func load() async {
        guard !loading, !saving else { return }
        loading = true
        defer { loading = false }
        do {
            let options = try await api.load()
            guard !Task.isCancelled, api.account.memberID == api.userID else { return }
            self.options = options
            draft = options.preferences
            store?.apply(options, for: api.userID)
            uncertain = false
            problem = nil
        } catch {
            if !Task.isCancelled { problem = "Your saved preferences couldn’t load." }
        }
    }

    private func save(_ value: MemberResearchPreferences, options: MemberResearchOptions) async {
        guard !saving, !loading, !uncertain else { return }
        saving = true
        problem = nil
        saved = false
        defer { saving = false }
        do {
            try await api.save(value, expected: options.preferences)
            guard api.account.memberID == api.userID else { return }
            var result = options
            result.preferences = value
            self.options = result
            store?.apply(result, for: api.userID)
            saved = true
        } catch let error as SlipSurgeHTTP.Status where error.code == 409 {
            uncertain = true
            problem = "These preferences changed on another device. Reload to see the saved version."
        } catch {
            uncertain = true
            problem = "The save couldn’t be confirmed. Reload to see your current preferences."
        }
    }
}
