import SwiftUI

struct CommunityCreateView: View {
    private struct Draft: Encodable {
        let name: String
        let description: String
        let sport: String?
        let emoji: String
        let isPublic: Bool
        let offerId: UUID?
        let avatarUrl: URL?
        let bannerUrl: URL?
    }

    private struct Receipt: Decodable {
        let id: UUID
        let slug: String
        let existing: Bool
        let artworkSaved: Bool
    }

    let api: CreatorStoreAPI
    var initialOffer: UUID? = nil
    var completed: (() async -> Void)? = nil
    @Environment(\.slipPalette) private var slipPalette
    @State private var page: CreatorStorePage?
    @State private var status: Receipt?
    @State private var problem: String?
    @State private var name = ""
    @State private var description = ""
    @State private var sport = ""
    @State private var emoji = "👥"
    @State private var visible = true
    @State private var offer: UUID?
    @State private var avatar: URL?
    @State private var banner: URL?
    @State private var uploadingAvatar = false
    @State private var uploadingBanner = false
    @State private var saving = false
    @State private var chooseIcon = false
    @State private var revision = 0

    private static let icons = ["👥", "🏆", "🔥", "⚡", "🎯", "💰", "🎲", "🏈", "⚾", "🏀", "🏒", "⚽", "🥊", "🎉", "💎", "🚀", "👑", "🦁", "🎰"]
    private var viewer: DiscoverAPI { .init(account: api.account, userID: api.userID) }
    private var busy: Bool { saving || uploadingAvatar || uploadingBanner }
    private var ready: Bool { (2...60).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count) && description.count <= 280 && !busy && page != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if let status {
                    confirmation(status)
                } else if let page {
                    identity
                    access(page)
                    if let problem { Label(problem, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.secondary) }
                    Button("Create community", systemImage: "plus.circle") { Task { await create() } }
                        .buttonStyle(SlipSurgePrimaryButtonStyle()).disabled(!ready)
                } else if let problem {
                    ContentUnavailableView {
                        Label("Setup couldn’t load", systemImage: "exclamationmark.circle")
                    } description: { Text(problem) } actions: { Button("Retry") { revision += 1 } }
                } else { ProgressView("Loading community setup").frame(maxWidth: .infinity) }
            }.padding(16)
        }
        .navigationTitle("New Community")
        .navigationBarTitleDisplayMode(.inline)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .interactiveDismissDisabled(saving)
        .task(id: revision) { await load() }
    }

    private var identity: some View {
        ResearchToolCard(color: slipPalette.accent) {
            DiscoverIdentityCard(title: name.isEmpty ? "Community name" : name, subtitle: sport.isEmpty ? "General" : LeagueArtwork.label(sport),
                detail: description.isEmpty ? nil : description, avatar: avatar, banner: banner, symbol: "person.2", count: nil)
        } content: {
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
                .onChange(of: name) { if name.count > 60 { name = String(name.prefix(60)) } }
            TextField("What is this community about?", text: $description, axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder)
                .onChange(of: description) { if description.count > 280 { description = String(description.prefix(280)) } }
            ViewThatFits(in: .horizontal) {
                HStack { photos }
                VStack(alignment: .leading) { photos }
            }
            Button { chooseIcon = true } label: { Label("\(emoji) Community icon", systemImage: "face.smiling") }.buttonStyle(.bordered)
                .sheet(isPresented: $chooseIcon) { iconPicker }
        }.disabled(saving)
    }

    @ViewBuilder private var photos: some View {
        NativePhotoPicker(title: "Choose logo", upload: { photo in
            try await NativeMediaUpload.upload(photo, kind: .avatars, account: api.account, userID: api.userID)
        }, url: $avatar, uploading: $uploadingAvatar).buttonStyle(.bordered)
        NativePhotoPicker(title: "Choose cover", upload: { photo in
            try await NativeMediaUpload.upload(photo, kind: .banners, account: api.account, userID: api.userID)
        }, url: $banner, uploading: $uploadingBanner).buttonStyle(.bordered)
    }

    private var iconPicker: some View {
        NavigationStack {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 52), spacing: 8)], spacing: 8) {
                ForEach(Self.icons, id: \.self) { icon in
                    Button {
                        emoji = icon
                        chooseIcon = false
                    } label: { Text(icon).font(.title2).frame(minWidth: 44, minHeight: 44) }.buttonStyle(.bordered)
                        .accessibilityAddTraits(icon == emoji ? .isSelected : [])
                }
            }.padding(16)
                .navigationTitle("Community icon")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { chooseIcon = false } } }
        }.presentationDetents([.medium])
    }

    private func access(_ page: CreatorStorePage) -> some View {
        let sports = ["NFL", "NBA", "NHL", "Soccer", "MMA"] + (page.sports.contains("MLB") ? ["MLB"] : [])
        let choices = [ResearchArtworkPicker.Option(id: "", title: "General", icon: "person.2")] + sports.map {
            .init(id: $0, title: LeagueArtwork.label($0), url: LeagueArtwork.logo($0), icon: $0 == "MMA" ? "figure.boxing" : "sportscourt")
        }
        return ResearchToolCard(color: slipPalette.accent) {
            ResearchSectionTitle(title: "Audience")
        } content: {
            ResearchArtworkPicker(title: "Sport", options: choices, selection: $sport)
            let available = offers(page)
            if !available.isEmpty {
                Picker("Member access", selection: $offer) {
                    Text("Free community").tag(nil as UUID?)
                    ForEach(available) { product in
                        Text(product.title + " · " + product.price.formatted(.currency(code: product.currency ?? "USD"))).tag(Optional(product.id))
                    }
                }
            }
            if offer == nil {
                Toggle("Public community", isOn: $visible)
            } else {
                Label("Requires the selected membership", systemImage: "lock").font(.caption).foregroundStyle(.secondary)
            }
        }.disabled(saving)
    }

    private func confirmation(_ receipt: Receipt) -> some View {
        ContentUnavailableView {
            Label(receipt.existing ? "Community ready" : "Community created", systemImage: "checkmark.circle")
        } description: {
            if !receipt.artworkSaved { Text("Your community is ready. Review its images in settings.") }
        } actions: {
            NavigationLink {
                CommunitySettingsView(api: .init(account: api.account, userID: api.userID, groupID: receipt.id))
            } label: { Label("Set up channels and invitations", systemImage: "person.2.badge.plus") }.buttonStyle(.borderedProminent)
        }
    }

    private func offers(_ page: CreatorStorePage) -> [CreatorStorePage.Offer] {
        page.offers.filter { $0.providerReady && ["draft", "active"].contains($0.status) }
    }

    private func load() async {
        problem = nil
        do {
            let result = try await api.load()
            try Task.checkCancellation()
            if let initialOffer {
                if offers(result).contains(where: { $0.id == initialOffer }) { offer = initialOffer }
                else { problem = "That membership isn’t available for a new community." }
            }
            page = result
        } catch {
            if !Task.isCancelled { problem = "Your community choices are temporarily unavailable." }
        }
    }

    private func create() async {
        guard ready else { return }
        saving = true
        problem = nil
        defer { saving = false }
        do {
            let data = Draft(name: name, description: description, sport: sport.isEmpty ? nil : sport, emoji: emoji,
                isPublic: visible, offerId: offer, avatarUrl: avatar, bannerUrl: banner)
            status = try await viewer.write(Receipt.self, path: "/api/mobile/communities", body: data)
            await completed?()
        } catch let failure as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            problem = (try? JSONDecoder().decode(Details.self, from: failure.data))?.error ?? "The community couldn’t be confirmed."
        } catch { problem = "The community couldn’t be confirmed. Check your communities before retrying." }
    }
}
