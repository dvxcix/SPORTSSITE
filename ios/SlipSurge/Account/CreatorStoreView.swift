import SwiftUI

struct CreatorStoreView: View {
    let api: CreatorStoreAPI
    var startsPaid = false
    @Environment(\.slipPalette) private var slipPalette
    @State private var page: CreatorStorePage?
    @State private var error: (any Error)?
    @State private var retry = 0

    var body: some View {
        Group {
            if let page { CreatorStoreEditor(api: api, page: page, startsPaid: startsPaid) }
            else { ResearchToolMessage(title: "Storefront couldn’t load", error: error) { retry += 1 } }
        }
        .navigationTitle("Storefront")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task(id: retry) {
            error = nil
            do { page = try await api.load() }
            catch { if !Task.isCancelled { self.error = error } }
        }
    }
}

private struct CreatorStoreEditor: View {
    private enum SectionName: Int, CaseIterable {
        case brand, audience, access, publish
        var title: String {
            switch self {
            case .brand: "Brand"
            case .audience: "Audience"
            case .access: "Access"
            case .publish: "Publish"
            }
        }
        var icon: String {
            switch self {
            case .brand: "photo"
            case .audience: "person.2"
            case .access: "lock.open"
            case .publish: "arrow.up.circle"
            }
        }
    }

    let api: CreatorStoreAPI
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.openURL) private var openURL
    @State private var page: CreatorStorePage
    @State private var saved: CreatorStorePage.Store?
    @State private var draft: CreatorStoreDraft
    @State private var section: SectionName
    @State private var payment: CreatorStoreAPI.Payment?
    @State private var busy = false
    @State private var uploadingLogo = false
    @State private var uploadingCover = false
    @State private var showOffer = false
    @State private var confirmPublish = false
    @State private var groupChoice = ""
    @State private var customTag = ""
    @State private var feedback: String?
    @State private var issue = false

    init(api: CreatorStoreAPI, page: CreatorStorePage, startsPaid: Bool) {
        self.api = api
        _page = State(initialValue: page)
        _saved = State(initialValue: page.store)
        var initialDraft = CreatorStoreDraft(page)
        if startsPaid, page.store == nil { initialDraft.access = "paid" }
        _draft = State(initialValue: initialDraft)
        _section = State(initialValue: startsPaid && page.store != nil
            ? .access : SectionName(rawValue: page.store?.setupStep ?? 0) ?? .brand)
    }

    private var blocked: Bool { busy || uploadingLogo || uploadingCover }
    private var accessLocked: Bool { saved?.status == "published" && saved?.communityId != nil }
    private var communityCandidates: [CreatorStorePage.Community] {
        page.groups.filter { $0.accessType == draft.access && $0.creatorProductId == (draft.access == "paid" ? draft.product : nil) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                DiscoverIdentityCard(title: draft.name.isEmpty ? "Your storefront" : draft.name,
                    subtitle: saved?.status == "published" ? "Published" : "Draft", detail: draft.bio.isEmpty ? nil : draft.bio,
                    avatar: artwork(draft.logo), banner: artwork(draft.cover), symbol: "person.crop.circle", count: nil)
                ResearchToolRail(title: "Store setup", choices: SectionName.allCases, selection: $section, label: \.title, glyph: \.icon)
                switch section {
                case .brand: brandPanel
                case .audience: audiencePanel
                case .access: accessPanel
                case .publish: publishPanel
                }
                if let feedback {
                    Label(feedback, systemImage: issue ? "exclamationmark.circle" : "checkmark.circle")
                        .font(.subheadline).foregroundStyle(issue ? Color.red : .secondary)
                }
            }.padding(16).disabled(blocked)
        }
        .scrollDismissesKeyboard(.interactively)
        .keyboardDone()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if busy { ProgressView() }
                else { Button("Save draft") { Task { await run { try await save(); feedback = "Draft saved." } } }.disabled(blocked) }
            }
        }
        .sheet(isPresented: $showOffer) {
            CreatorOfferEditor(api: api) { offered in
                draft.product = offered
                if let refreshed = try? await api.load() { page = refreshed }
            }
        }
        .confirmationDialog("Publish storefront?", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("Publish") {
                Task { await run { draft.step = 4; saved = try await api.save(draft, publish: true); feedback = "Storefront published." } }
            }
        } message: { Text("Your storefront and linked community use the access selected in the draft.") }
    }

    private var brandPanel: some View {
        ResearchToolCard(color: slipPalette.accent) { Text("Brand").font(.headline) } content: {
            TextField("Storefront name", text: $draft.name).textFieldStyle(.roundedBorder)
            TextField("Introduce your storefront", text: $draft.bio, axis: .vertical).lineLimit(3...8).textFieldStyle(.roundedBorder)
            NativePhotoPicker(title: "Choose logo", upload: { photo in
                try await NativeMediaUpload.upload(photo, kind: .avatars, account: api.account, userID: api.userID)
            }, url: photo($draft.logo), uploading: $uploadingLogo).buttonStyle(.bordered)
            NativePhotoPicker(title: "Choose cover", upload: { photo in
                try await NativeMediaUpload.upload(photo, kind: .banners, account: api.account, userID: api.userID)
            }, url: photo($draft.cover), uploading: $uploadingCover).buttonStyle(.bordered)
        }
    }

    private var audiencePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            ResearchToolCard(color: slipPalette.accent) { Text("Sports").font(.headline) } content: {
                ForEach(page.sports, id: \.self) { sport in
                    Toggle(isOn: selection(sport, in: $draft.sports)) {
                        HStack(spacing: 9) {
                            ResearchArtwork(urls: [LeagueArtwork.logo(sport)].compactMap { $0 }, fallback: "sportscourt")
                                .frame(width: 26, height: 26)
                            Text(LeagueArtwork.label(sport))
                        }
                    }
                }
            }
            ResearchToolCard(color: slipPalette.accent) { Text("Topics").font(.headline) } content: {
                ForEach(Array(Set(page.tags + draft.tags)).sorted(), id: \.self) { tag in
                    Toggle(tag, isOn: selection(tag, in: $draft.tags))
                }
                HStack {
                    TextField("Custom topic", text: $customTag).textFieldStyle(.roundedBorder)
                    Button("Add") {
                        let tag = customTag.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !draft.tags.contains(tag), !tag.isEmpty, tag.count <= 30, draft.tags.count < 8 { draft.tags.append(tag) }
                        customTag = ""
                    }.buttonStyle(.bordered).disabled(customTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || customTag.count > 30 || draft.tags.count >= 8)
                }
            }
        }
    }

    private var accessPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Community access", selection: $draft.access) {
                Text("Free").tag("free")
                Text("Paid").tag("paid")
            }.pickerStyle(.segmented).disabled(accessLocked)
            if draft.access == "paid" { offerPanel }
            communityPanel
        }
        .onChange(of: draft.access) { _, _ in groupChoice = "" }
        .onChange(of: draft.product) { _, _ in groupChoice = "" }
    }

    private var offerPanel: some View {
        ResearchToolCard(color: Color(rgb: 0xF96630)) {
            Image("sign-in-whop").renderingMode(.template).resizable().scaledToFit().frame(width: 19, height: 19)
                .foregroundStyle(Color(rgb: 0xF96630)).accessibilityHidden(true)
            Text("Whop payments").font(.headline)
        } content: {
            if let state = payment?.state ?? page.paymentStatus {
                Text(state.replacingOccurrences(of: "_", with: " ").capitalized).font(.subheadline)
            }
            if page.canOnboard {
                Button("Open Whop setup", systemImage: "arrow.up.right.square") {
                    Task { await run {
                        openURL(try await api.paymentSetup())
                        if let refreshed = try? await api.load() { page = refreshed }
                    } }
                }.buttonStyle(.borderedProminent).tint(Color(rgb: 0xF96630))
            }
            if page.paymentConnected || payment != nil {
                Button("Check payment status", systemImage: "arrow.clockwise") {
                    Task { await run { payment = try await api.payment(); page = try await api.load() } }
                }.buttonStyle(.bordered)
            }
            ForEach(payment?.actions ?? []) { action in
                Label(action.title, systemImage: action.pending ? "clock" : "circle").font(.caption)
            }
            if !page.offers.isEmpty {
                Picker("Membership offer", selection: $draft.product) {
                    Text("Choose an offer").tag(UUID?.none)
                    ForEach(page.offers.filter(\.providerReady)) { offer in
                        Text("\(offer.title) · \(offer.price.formatted(.currency(code: offer.currency ?? "USD")))").tag(Optional(offer.id))
                    }
                }.disabled(accessLocked)
            }
            if page.paymentConnected && !accessLocked { Button("New paid offer", systemImage: "plus") { showOffer = true }.buttonStyle(.bordered) }
        }
    }

    private var communityPanel: some View {
        ResearchToolCard(color: slipPalette.accent) { Text("Member community").font(.headline) } content: {
            if let id = saved?.communityId, let group = page.groups.first(where: { $0.id == id }) {
                NavigationLink {
                    CommunitySettingsView(api: .init(account: api.account, userID: api.userID, groupID: group.id))
                } label: {
                    HStack(spacing: 8) {
                        ResearchArtwork(urls: [group.avatarUrl].compactMap { $0 }, fallback: "person.2").frame(width: 25, height: 25)
                        Text(group.name)
                    }
                }
            }
            if !accessLocked {
                ResearchArtworkPicker(title: "Community", options: [.init(id: "new", title: "Create a community", icon: "plus.circle")]
                    + communityCandidates.map { .init(id: $0.id.uuidString.lowercased(), title: $0.name, url: $0.avatarUrl, icon: "person.2") },
                    selection: $groupChoice)
                Button(groupChoice == "new" ? "Create community" : "Link community") {
                    Task { await run {
                        try await save()
                        _ = try await api.attachCommunity(groupChoice)
                        page = try await api.load()
                        saved = page.store
                        feedback = "Community linked."
                    } }
                }.buttonStyle(.borderedProminent)
                    .disabled(groupChoice.isEmpty || draft.access == "paid" && draft.product == nil)
            }
        }
    }

    private var publishPanel: some View {
        ResearchToolCard(color: slipPalette.accent) { Text("Publish storefront").font(.headline) } content: {
            LabeledContent("Access", value: draft.access.capitalized)
            LabeledContent("Community", value: page.groups.first { $0.id == saved?.communityId }?.name ?? "Choose in Access")
            Button(saved?.status == "published" ? "Publish changes" : "Publish", systemImage: "arrow.up.circle") { confirmPublish = true }
                .buttonStyle(.borderedProminent)
                .disabled(saved?.communityId == nil || draft.name.count < 2 || draft.bio.count < 10 || draft.sports.isEmpty)
        }
    }

    private func selection(_ value: String, in list: Binding<[String]>) -> Binding<Bool> {
        Binding(get: { list.wrappedValue.contains(value) }, set: { enabled in
            if enabled && list.wrappedValue.count < 8 { list.wrappedValue.append(value) }
            else if !enabled { list.wrappedValue.removeAll { $0 == value } }
        })
    }

    private func artwork(_ string: String?) -> URL? {
        guard let string, let site = URL(string: "https://\(SlipSurgeHTTP.site)"),
            let url = URL(string: string, relativeTo: site)?.absoluteURL, FeedPostCard.allowedMedia(url) else { return nil }
        return url
    }

    private func photo(_ field: Binding<String?>) -> Binding<URL?> {
        Binding(get: { artwork(field.wrappedValue) }, set: { field.wrappedValue = $0?.absoluteString })
    }

    private func save() async throws {
        draft.step = section.rawValue
        saved = try await api.save(draft, publish: false)
    }

    private func run(_ action: () async throws -> Void) async {
        guard !blocked else { return }
        busy = true
        feedback = nil
        issue = false
        defer { busy = false }
        do { try await action() }
        catch let error as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            feedback = (try? JSONDecoder().decode(Details.self, from: error.data))?.error ?? "This change couldn’t be confirmed."
            issue = true
        } catch { feedback = "This change couldn’t be confirmed."; issue = true }
    }
}
