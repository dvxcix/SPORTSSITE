import SwiftUI

struct DugoutSlateBreakdown: View {
    private struct Request: Hashable {
        let day: String
        let mode: DugoutMode
        let revision: Int
    }

    let api: DugoutSlateBreakdownAPI
    @State var date: Date
    @State var selectedGame: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var mode = DugoutMode.pregame
    @State private var data: (Request, DugoutSlateBreakdownData)?
    @State private var failure: (any Error)?
    @State private var revision = 0

    var body: some View {
        let request = Request(day: SlateDate.key(date), mode: mode, revision: revision)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                ResearchSlateControls(date: $date)
                Picker("Research mode", selection: $mode) {
                    Label("Pregame", systemImage: "clock").tag(DugoutMode.pregame)
                    Label("Live", systemImage: "dot.radiowaves.left.and.right").tag(DugoutMode.live)
                }
                .pickerStyle(.segmented)
                if let (loaded, slate) = data, loaded == request {
                    content(slate, request: request)
                } else {
                    ResearchToolMessage(title: "Slate Breakdown couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Slate Breakdown")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: request) {
            failure = nil
            do {
                let slate = try await api.games(date: request.day, mode: request.mode)
                try Task.checkCancellation()
                guard slate.date == request.day else { throw URLError(.badServerResponse) }
                data = (request, slate)
            } catch {
                if !Task.isCancelled { failure = error }
            }
        }
        .onChange(of: SlateDate.key(date)) { selectedGame = nil }
        .refreshable { revision += 1 }
    }

    @ViewBuilder
    private func content(_ slate: DugoutSlateBreakdownData, request: Request) -> some View {
        if slate.paused == true {
            ContentUnavailableView("MLB is on its offseason pause", systemImage: "moon.stars",
                description: Text("Choose an earlier date to review its saved slate."))
        } else if slate.liveUnavailable == true {
            ContentUnavailableView("Live is available for today’s slate", systemImage: "calendar.badge.clock")
        } else if slate.games.isEmpty {
            ContentUnavailableView("No games on this slate", systemImage: "calendar")
        } else {
            let game = selectedGame.flatMap { id in slate.games.first { $0.id == id } } ?? (selectedGame == nil ? slate.games.first : nil)
            rail(slate.games, selection: game?.id)
            if let game, game.locked {
                ContentUnavailableView("Advanced access required", systemImage: "lock",
                    description: Text("This plan can open the slate’s featured matchup."))
                if let featured = slate.games.first(where: { !$0.locked }) {
                    Button("Open \(featured.title)") { selectedGame = featured.id }.buttonStyle(.borderedProminent)
                }
            } else if let game {
                DugoutSlateMatchup(api: api, date: request.day, mode: request.mode, game: game).id("\(request.day):\(request.mode.rawValue):\(game.id)")
            } else {
                ContentUnavailableView("Matchup unavailable on this slate", systemImage: "baseball.diamond")
            }
        }
    }

    private func rail(_ games: [DugoutSlateBreakdownData.Game], selection: Int?) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(games) { game in
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.23)) { selectedGame = game.id }
                    } label: {
                        ResearchMatchup(away: game.away.matchup, home: game.home.matchup,
                            subtitle: game.locked ? "Advanced" : game.status, selected: game.id == selection)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel(game.label)
                    .accessibilityValue(game.locked ? "Advanced access" : game.status)
                    .accessibilityAddTraits(game.id == selection ? .isSelected : [])
                }
            }
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

struct DugoutSlateMatchup: View {
    typealias Slate = DugoutSlateBreakdownData

    let api: DugoutSlateBreakdownAPI
    let date: String
    let mode: DugoutMode
    let game: Slate.Game
    var workspaceBatter: Binding<Int?>? = nil
    var workspaceWindow: Int? = nil
    @State private var matchup: Slate.Matchup?
    @State private var side = Slate.Side.away
    @State private var failure: (any Error)?
    @State private var revision = 0

    var body: some View {
        Group {
            if let matchup {
                Label(matchup.archive.label, systemImage: matchup.archive.live ? "dot.radiowaves.left.and.right" : "clock")
                    .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if let roster = matchup.roster {
                    sides(roster)
                    if let starter = roster.starter(side) {
                        DugoutSlateMatchupResearch(api: api, date: date, mode: mode, matchup: matchup, side: side,
                            starter: starter, batters: roster.opponents(side), workspaceBatter: workspaceBatter,
                            workspaceWindow: workspaceWindow).id(side)
                    }
                } else {
                    ContentUnavailableView("No pregame matchup archive", systemImage: "clock.badge.exclamationmark")
                }
            } else {
                ResearchToolMessage(title: "Matchup couldn’t load", error: failure) { revision += 1 }
            }
        }
        .task(id: revision) {
            do {
                let result = try await api.matchup(date: date, mode: mode, game: game.id)
                try Task.checkCancellation()
                guard result.game.id == game.id else { throw URLError(.badServerResponse) }
                matchup = result
                if result.roster?.awayStarter == nil && result.roster?.homeStarter != nil { side = .home }
                if let roster = result.roster, let selected = workspaceBatter?.wrappedValue,
                   let opponent = Slate.Side.allCases.first(where: { roster.opponents($0).contains { $0.id == selected } }),
                   roster.starter(opponent) != nil { side = opponent }
            } catch {
                if !Task.isCancelled { failure = error }
            }
        }
    }

    private func sides(_ roster: Slate.Roster) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 8) { sideCards(roster) }
            VStack(spacing: 8) { sideCards(roster) }
        }
        .sensoryFeedback(.selection, trigger: side)
    }

    @ViewBuilder
    private func sideCards(_ roster: Slate.Roster) -> some View {
        ForEach(Slate.Side.allCases) { option in
            let team = game.team(option)
            let opponent = game.opposition(option)
            let starter = roster.starter(option)
            Button {
                side = option
            } label: {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        ResearchArtwork(urls: [team.logo].compactMap { $0 }, fallback: "baseball.diamond").frame(width: 24, height: 24)
                        Text(team.code).font(.caption.bold())
                        Spacer()
                        if side == option { Image(systemName: "checkmark.circle.fill").font(.caption) }
                    }
                    DugoutOpponentArtwork(name: starter?.name ?? "Starter TBD", subtitle: starter?.hand.map { "\($0)HP" },
                        headshot: starter?.headshot)
                    HStack {
                        ResearchArtwork(urls: [opponent.logo].compactMap { $0 }, fallback: "baseball.diamond").frame(width: 19, height: 19)
                        Text(roster.confirmed(option) ? "Confirmed lineup" : "Projected lineup")
                            .font(.caption2.weight(.medium)).foregroundStyle(.secondary)
                    }
                }
                .padding(9)
                .background(LinearGradient(colors: [team.color.opacity(side == option ? 0.30 : 0.12),
                    team.secondaryColor.opacity(side == option ? 0.22 : 0.08)], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: .rect(cornerRadius: 13))
                .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(team.color.opacity(side == option ? 0.72 : 0.24)) }
            }
            .buttonStyle(SlipSurgePressStyle())
            .disabled(starter == nil)
            .accessibilityAddTraits(side == option ? .isSelected : [])
        }
    }
}
