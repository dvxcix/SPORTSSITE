import SwiftUI

struct ArticleEditorLoader: View {
    let api: ArticlesAPI
    let id: UUID
    let saved: (ArticlesAPI.Receipt) -> Void
    @State private var article: ArticlesAPI.Article?
    @State private var issue: (any Error)?
    @State private var revision = 0

    var body: some View {
        Group {
            if let article {
                ArticleEditor(api: api, draft: .init(article: article), saved: saved)
            } else if let requirement = CommunityMembershipNotice.Requirement(issue) {
                CommunityMembershipNotice(requirement: requirement, subject: "Article editor", account: api.viewer.account)
            } else if (issue as? SlipSurgeHTTP.Status)?.code == 404 {
                ContentUnavailableView("Article unavailable", systemImage: "text.document")
            } else {
                ResearchToolMessage(title: "Article couldn’t load", error: issue) { revision += 1 }
            }
        }
        .task(id: revision) {
            do { article = try await api.editor(id) }
            catch { if !Task.isCancelled { issue = error } }
        }
    }
}

struct ArticleEditor: View {
    let api: ArticlesAPI
    @State var draft: ArticlesAPI.Draft
    var opensAssistant = false
    let saved: (ArticlesAPI.Receipt) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var preview = false
    @State private var showingAI = false
    @State private var publishing = false
    @State private var saving = false
    @State private var issue: String?

    private let categories = ["", "Analysis", "Picks", "News", "Opinion", "Preview", "Recap", "Fantasy", "Betting Strategy", "AI Generated"]
    private var words: Int { draft.content.split(whereSeparator: \.isWhitespace).count }
    private var cover: URL? { URL(string: draft.cover).flatMap { $0.scheme == "https" ? $0 : nil } }
    private var valid: Bool {
        !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.title.utf16.count <= 140 &&
            draft.excerpt.utf16.count <= 280 && draft.content.utf16.count <= 50_000 && draft.cover.utf16.count <= 500
    }

    var body: some View {
        Group {
            if preview { review }
            else { form }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            Picker("Editor view", selection: $preview) {
                Label("Write", systemImage: "pencil").tag(false)
                Label("Preview", systemImage: "eye").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16).padding(.vertical, 6)
            .background(.bar)
        }
        .navigationTitle(draft.article == nil ? "Write an article" : "Edit article")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(saving) }
            if draft.article == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Draft with AI", systemImage: "sparkles") { showingAI = true }.disabled(saving)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
                HStack {
                    Button("Save draft", systemImage: "square.and.arrow.down") { Task { await save(.draft) } }
                        .buttonStyle(.bordered)
                    Spacer()
                    if saving { ProgressView().accessibilityLabel("Saving article") }
                    Button(draft.article == nil ? "Publish" : "Save & publish", systemImage: "arrow.up.right") { publishing = true }
                        .buttonStyle(.borderedProminent)
                }
                .disabled(!valid || saving)
            }
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(.bar)
        }
        .confirmationDialog("Publish this article?", isPresented: $publishing, titleVisibility: .visible) {
            Button("Publish") { Task { await save(.published) } }
        }
        .sheet(isPresented: $showingAI) {
            NavigationStack {
                ArticleDraftAssistant(api: api) { generated, sport in
                    draft.title = generated.title
                    draft.excerpt = generated.excerpt
                    draft.content = generated.content
                    draft.sport = sport
                    draft.category = "AI Generated"
                    showingAI = false
                }
            }
        }
        .interactiveDismissDisabled(saving)
        .task {
            if opensAssistant { showingAI = true }
        }
    }

    private var form: some View {
        Form {
            Section("Article details") {
                TextField("Title", text: $draft.title)
                TextField("Subtitle", text: $draft.excerpt, axis: .vertical).lineLimit(1...3)
                Picker("Category", selection: $draft.category) {
                    ForEach(categories, id: \.self) { Text($0.isEmpty ? "Choose a category" : $0).tag($0) }
                }
                ArticleSportPicker(selection: $draft.sport)
                TextField("Cover image link", text: $draft.cover).keyboardType(.URL)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if let cover { ArticleCover(url: cover, height: 140).clipShape(.rect(cornerRadius: 12)) }
            }
            Section {
                TextEditor(text: $draft.content)
                    .frame(minHeight: 210)
                    .accessibilityLabel("Article body")
            } header: { Text("Article") } footer: { Text("\(words.formatted()) words · \(draft.content.utf16.count.formatted()) / 50,000 characters") }
        }
        .scrollContentBackground(.hidden)
        .background(Brand.background(for: scheme))
    }

    private var review: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let cover { ArticleCover(url: cover, height: 200).clipShape(.rect(cornerRadius: 16)) }
                Text(draft.title.isEmpty ? "Untitled article" : draft.title).font(.largeTitle.bold())
                if !draft.excerpt.isEmpty { Text(draft.excerpt).font(.title3).foregroundStyle(.secondary) }
                Text("\(max(1, (words + 219) / 220)) min read").font(.caption).foregroundStyle(.secondary)
                ArticleParagraphs(content: draft.content)
            }
            .padding(16).frame(maxWidth: 650).frame(maxWidth: .infinity)
        }
        .background(Brand.background(for: scheme))
    }

    private func save(_ status: ArticlesAPI.Draft.Status) async {
        guard !saving && valid else { return }
        saving = true
        issue = nil
        defer { saving = false }
        do {
            draft.status = status
            let receipt = try await api.save(draft)
            dismiss()
            saved(receipt)
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            issue = "The article changed elsewhere. Copy any unsaved text, then reopen it to see the current version."
        } catch {
            issue = "The article couldn’t be saved. Your text is still here."
        }
    }
}

private struct ArticleSportPicker: View {
    @Binding var selection: String

    var body: some View {
        ResearchArtworkPicker(title: "Sport", options: [
            .init(id: "", title: "All sports", icon: "sportscourt"),
        ] + ["MLB", "NFL", "NBA", "NHL", "Soccer", "MMA"].map { sport in
            .init(id: sport, title: sport == "Soccer" ? sport : LeagueArtwork.label(sport), url: LeagueArtwork.logo(sport), icon: "sportscourt")
        }, selection: $selection)
    }
}

private struct ArticleDraftAssistant: View {
    let api: ArticlesAPI
    let use: (ArticlesAPI.GeneratedDraft, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var prompt = ""
    @State private var sport = ""
    @State private var tone = "analytical"
    @State private var draft: ArticlesAPI.GeneratedDraft?
    @State private var loading = false
    @State private var problem: String?
    private let suggestions = ["Best MLB picks for the week ahead", "How to handicap NFL totals", "Top five mistakes beginner bettors make",
        "Breaking down current sportsbook promotions", "What went wrong in my 10-game parlay"]
    private let tones = [("Analytical", "analytical"), ("Casual", "conversational"), ("Hype", "hype"),
        ("Educational", "educational"), ("Opinion", "opinion")]

    var body: some View {
        Form {
            if let draft {
                Section("Generated draft") {
                    Text(draft.title).font(.headline)
                    Text(draft.excerpt).foregroundStyle(.secondary)
                    ArticleParagraphs(content: draft.content)
                }
                Button("Edit in article writer", systemImage: "pencil") { use(draft, sport) }
                Button("Start over", systemImage: "arrow.counterclockwise") { self.draft = nil }
            } else {
                Section("Topic") {
                    TextField("What should the article be about?", text: $prompt, axis: .vertical).lineLimit(2...5)
                    ArticleSportPicker(selection: $sport)
                    Picker("Tone", selection: $tone) {
                        ForEach(tones, id: \.1) { Text($0.0).tag($0.1) }
                    }
                }
                Section("Starting points") {
                    ForEach(suggestions, id: \.self) { example in Button(example) { prompt = example } }
                }
                Button("Generate draft", systemImage: "sparkles") { Task { await generate() } }
                    .disabled(loading || prompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || prompt.utf16.count > 500)
            }
            if loading { ProgressView("Generating draft") }
            if let problem { Text(problem).font(.subheadline).foregroundStyle(.secondary) }
        }
        .navigationTitle("Article assistant")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
    }

    private func generate() async {
        loading = true
        problem = nil
        defer { loading = false }
        do { draft = try await api.generate(prompt: prompt, sport: sport, tone: tone) }
        catch let status as SlipSurgeHTTP.Status where status.code == 429 { problem = "You’ve reached the hourly article limit." }
        catch { problem = "The draft couldn’t be generated. Try again." }
    }
}
