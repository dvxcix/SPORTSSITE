import SwiftUI

struct NativeMarketplaceTarget: Hashable {
    enum League: String, CaseIterable {
        case mlb, nfl, nba
        var title: String { rawValue.uppercased() }
    }

    enum Publication: Hashable {
        case chooser, matrix(UUID)
    }

    var league: League?
    var listing: UUID?
    var author: UUID?
    var publication: Publication?
}

struct NativeMarketplaceView: View {
    let api: DiscoverAPI
    let userID: UUID
    let target: NativeMarketplaceTarget
    @Environment(\.colorScheme) private var scheme
    @State private var league: NativeMarketplaceTarget.League
    @State private var allowedMLB: Bool?
    @State private var personSelectedLeague = false

    init(api: DiscoverAPI, userID: UUID, target: NativeMarketplaceTarget) {
        self.api = api
        self.userID = userID
        self.target = target
        _league = State(initialValue: target.league ?? .nfl)
    }

    var body: some View {
        VStack(spacing: 0) {
            if allowedMLB != nil {
                ResearchArtworkPicker(title: "League", options: options.map {
                    .init(id: $0.rawValue, title: $0.title, url: LeagueArtwork.logo($0.rawValue), icon: "sportscourt")
                }, selection: Binding(get: { league.rawValue }, set: { raw in
                    if let selected = NativeMarketplaceTarget.League(rawValue: raw) {
                        personSelectedLeague = true
                        league = selected
                    }
                }))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
            }
            switch league {
            case .mlb: baseball
            case .nfl: MatricesView(api: .init(league: .nfl, account: api.account, userID: userID),
                opensCommunity: true, showsDone: false, didChange: {}).id(league)
            case .nba: MatricesView(api: .init(league: .nba, account: api.account, userID: userID),
                opensCommunity: true, showsDone: false, didChange: {}).id(league)
            }
        }
        .navigationTitle("Matrix Marketplace")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: userID) {
            let permitted = (try? await DugoutAPI(account: api.account, userID: userID).available()) == true
            guard !Task.isCancelled, api.account.memberID == userID else { return }
            allowedMLB = permitted
            if permitted, target.league == nil, !personSelectedLeague { league = .mlb }
        }
    }

    private var options: [NativeMarketplaceTarget.League] {
        NativeMarketplaceTarget.League.allCases.filter { $0 != .mlb || allowedMLB == true || league == .mlb }
    }

    @ViewBuilder private var baseball: some View {
        if allowedMLB == true {
            let matrices = DugoutMatricesAPI(account: api.account, userID: userID)
            if let publication = target.publication {
                DugoutMatricesView(api: matrices, opensPublication: publication)
            } else {
                DugoutMatrixMarketplace(api: matrices, author: target.author, opensListing: target.listing) {}
            }
        } else if allowedMLB == false {
            ContentUnavailableView("MLB Matrices unavailable", systemImage: "lock")
        } else {
            ProgressView("Checking marketplace access").frame(maxHeight: .infinity)
        }
    }
}
