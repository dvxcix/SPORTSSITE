import SwiftUI
import UIKit

struct DugoutSprayView: View {
    private enum Style: String, CaseIterable { case points, heat }
    private struct Export: Identifiable {
        let url: URL
        var id: URL { url }
    }

    let api: DugoutToolsAPI
    @State var date: Date
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scene
    @State private var slate: DugoutSpraySlate?
    @State private var selectedGame: Int?
    @State private var selectedContact: String?
    @State private var selectedPlayers: Set<Int>?
    @State private var result = DugoutSpraySlate.Result.all
    @State private var style = Style.points
    @State private var choosingPlayers = false
    @State private var revision = 0
    @State private var failure: (any Error)?
    @State private var export: Export?
    @State private var exportFile: URL?
    @State private var exportFailed = false

    init(api: DugoutToolsAPI, date: Date, game: Int? = nil, players: Set<Int>? = nil,
        result: DugoutSpraySlate.Result = .all, heat: Bool = false) {
        self.api = api
        _date = State(initialValue: date)
        _selectedGame = State(initialValue: game)
        _selectedPlayers = State(initialValue: players)
        _result = State(initialValue: result)
        _style = State(initialValue: heat ? .heat : .points)
    }

    var body: some View {
        let key = SlateDate.key(date)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                ResearchSlateControls(date: $date)
                if let slate, slate.date == key {
                    if let selectedGame, !slate.games.contains(where: { $0.id == selectedGame }) {
                        gameRail(slate, selected: selectedGame)
                        ContentUnavailableView("Matchup unavailable on this slate", systemImage: "calendar")
                    } else if let game = slate.games.first(where: { $0.id == selectedGame }) ?? slate.games.first {
                        gameRail(slate, selected: game.id)
                        chart(slate, game: game)
                    } else {
                        ContentUnavailableView("No games on this date", systemImage: "calendar")
                    }
                } else {
                    ResearchToolMessage(title: "Spray Charts couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Spray Charts")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(key):\(revision)") {
            await load(key)
            while !Task.isCancelled, key == SlateDate.key(.now) {
                do { try await Task.sleep(for: .seconds(75)) } catch { return }
                if scene == .active { await load(key) }
            }
        }
        .refreshable { await load(key) }
        .onChange(of: key) { selectedGame = nil; reset(); failure = nil }
        .sheet(item: $export, onDismiss: { removeExport() }) { file in
            SprayShareSheet(url: file.url)
                .presentationDetents([.medium, .large])
        }
        .alert("The image couldn’t be exported", isPresented: $exportFailed) { Button("OK", role: .cancel) {} }
    }

    private func gameRail(_ slate: DugoutSpraySlate, selected: Int) -> some View {
        let counts = Dictionary(grouping: slate.contacts, by: \.gamePk).mapValues(\.count)
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(slate.games) { game in
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) {
                            selectedGame = game.id
                            reset()
                        }
                    } label: {
                        ResearchMatchup(away: game.away.matchup, home: game.home.matchup,
                            subtitle: "\(counts[game.id] ?? 0) batted balls", selected: game.id == selected)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel("\(game.away.name) at \(game.home.name)")
                    .accessibilityValue("\(counts[game.id] ?? 0) batted balls")
                }
            }
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selected)
    }

    private func chart(_ slate: DugoutSpraySlate, game: DugoutSpraySlate.Game) -> some View {
        let gameEvents = slate.contacts.filter { $0.gamePk == game.id }
        let filtered = gameEvents.filter { event in
            (result == .all || event.kind == result) && (selectedPlayers?.contains(event.batterId) ?? true)
        }
        let active = filtered.first { $0.id == selectedContact }
        return VStack(alignment: .leading, spacing: 12) {
            filters(game, events: gameEvents)
            ResearchToolCard(color: game.home.color) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(game.venue).font(.title3.weight(.bold))
                    Text(game.status).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }
            } content: {
                ResearchToolValues(items: [
                    .init(label: "Batted balls", text: filtered.count.formatted()),
                    .init(label: "Home runs", text: filtered.filter { $0.kind == .homeRun }.count.formatted()),
                    .init(label: "Near home runs", text: filtered.filter { $0.kind == .nearHomeRun }.count.formatted()),
                ])
                SprayField(game: game, events: filtered, selection: active, heat: style == .heat) { event in
                    selectedContact = event.id
                }
                if filtered.isEmpty {
                    Text("No captured contact matches these filters").font(.subheadline).foregroundStyle(.secondary)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { shareTools(slate, game: game, events: filtered, active: active) }
                    VStack(alignment: .leading, spacing: 8) { shareTools(slate, game: game, events: filtered, active: active) }
                }
            }
            if let active { eventCard(active, game: game) }
            if !filtered.isEmpty {
                DisclosureGroup("Browse \(filtered.count) batted balls") {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(filtered) { event in
                            Button {
                                selectedContact = event.id
                            } label: {
                                Label("\(event.batterName) · \(event.resultTitle)", systemImage: "baseball")
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }
                            .buttonStyle(SlipSurgePressStyle())
                            .accessibilityAddTraits(event.id == selectedContact ? .isSelected : [])
                        }
                    }
                }.font(.subheadline.weight(.semibold))
            }
            ForEach(slate.notes, id: \.self) { Text($0).font(.caption2).foregroundStyle(.secondary) }
        }
        .sensoryFeedback(.selection, trigger: selectedContact)
    }

    private func filters(_ game: DugoutSpraySlate.Game, events: [DugoutSpraySlate.Event]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button(selectedPlayers.map { "\($0.count) batters" } ?? "All batters", systemImage: "person.2") {
                    choosingPlayers = true
                }
                .buttonStyle(.bordered)
                Spacer()
                Picker("Chart style", selection: $style) {
                    Text("Points").tag(Style.points)
                    Text("Heat").tag(Style.heat)
                }
                .pickerStyle(.segmented)
            }
            ResearchToolRail(title: "Contact result", choices: DugoutSpraySlate.Result.allCases, selection: $result,
                label: \.title, glyph: { result in
                    switch result {
                    case .all: "scope"
                    case .homeRun: "baseball"
                    case .nearHomeRun: "arrow.up.right"
                    case .hit: "checkmark"
                    case .out: "xmark"
                    case .other: "ellipsis"
                    }
                })
        }
        .sheet(isPresented: $choosingPlayers) { playerPicker(game, events: events) }
    }

    private func playerPicker(_ game: DugoutSpraySlate.Game, events: [DugoutSpraySlate.Event]) -> some View {
        let grouped = Dictionary(grouping: events, by: \.batterId)
        let batters = grouped.values.compactMap(\.first).sorted { $0.batterName.localizedStandardCompare($1.batterName) == .orderedAscending }
        return NavigationStack {
            List {
                HStack {
                    Button("Select all") { selectedPlayers = nil; selectedContact = nil }
                    Spacer()
                    Button("Clear") { selectedPlayers = []; selectedContact = nil }
                }
                ForEach(batters, id: \.batterId) { batter in
                    let selected = selectedPlayers?.contains(batter.batterId) ?? true
                    let team = batter.batterTeam == game.away.code ? game.away : game.home
                    Button {
                        var selection = selectedPlayers ?? Set(batters.map(\.batterId))
                        if selected { selection.remove(batter.batterId) } else { selection.insert(batter.batterId) }
                        selectedPlayers = selection
                        selectedContact = nil
                    } label: {
                        HStack {
                            ResearchToolPortrait(name: batter.batterName,
                                subtitle: "\(team.code) · \(grouped[batter.batterId]?.count ?? 0) batted balls",
                                portraits: [batter.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selected ? slipPalette.accent : .secondary)
                                .accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .navigationTitle("Batters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { choosingPlayers = false } } }
        }
        .presentationDragIndicator(.visible)
    }

    private func eventCard(_ event: DugoutSpraySlate.Event, game: DugoutSpraySlate.Game) -> some View {
        let team = event.batterTeam == game.away.code ? game.away : game.home
        return ResearchToolCard(color: team.color) {
            ResearchToolPortrait(name: event.batterName, subtitle: "\(event.resultTitle) · \(event.pitcherName)",
                portraits: [event.headshot], teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
        } content: {
            ResearchToolValues(items: [
                .init(label: "Exit velocity", text: ResearchFormat.decimal(event.exitVelocity, suffix: " mph")),
                .init(label: "Distance", text: ResearchFormat.decimal(event.distance, suffix: " ft")),
                .init(label: "Launch angle", text: ResearchFormat.decimal(event.launchAngle, suffix: "°")),
                .init(label: "Inning", text: event.inning.map { "\(event.half.capitalized) \($0)" } ?? "—"),
                .init(label: "RBI", text: event.rbi.formatted()),
                .init(label: "Pitch", text: [event.pitchType, event.pitchSpeed.map { ResearchFormat.decimal($0, suffix: " mph") }]
                    .compactMap { $0 }.joined(separator: " · ")),
            ])
            if !event.description.isEmpty { Text(event.description).font(.subheadline) }
            Text(event.sourceTitle).font(.footnote).foregroundStyle(.secondary)
            if let parks = event.parksHrCount { Text("Home run in \(parks) parks").font(.subheadline.weight(.semibold)) }
            if let market = event.marketContext, !market.primary.isEmpty || !market.specials.isEmpty {
                ResearchSectionTitle(title: "Archived market")
                ForEach(market.primary + market.specials) { quote in
                    HStack {
                        Text(quote.marketLabel).font(.caption.weight(.medium))
                        Spacer()
                        ResearchToolBook(book: Sportsbook.normalized(quote.book), price: quote.odds)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func shareTools(_ slate: DugoutSpraySlate, game: DugoutSpraySlate.Game, events: [DugoutSpraySlate.Event],
        active: DugoutSpraySlate.Event?) -> some View {
        if let link = shareURL(date: slate.date, game: game.id) {
            ShareLink(item: link) { Label("Share", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered)
            Button("Copy link", systemImage: "link") { UIPasteboard.general.url = link }.buttonStyle(.bordered)
        }
        Button("Export PNG", systemImage: "photo") { exportChart(game, events: events, active: active) }
            .buttonStyle(.bordered)
            .disabled(events.isEmpty)
    }

    private func shareURL(date: String, game: Int) -> URL? {
        var components = URLComponents()
        components.scheme = "https"
        components.host = SlipSurgeHTTP.site
        components.path = "/spray-charts"
        var items: [URLQueryItem] = [.init(name: "date", value: date), .init(name: "game", value: String(game))]
        if let selectedPlayers, !selectedPlayers.isEmpty {
            items.append(.init(name: "players", value: selectedPlayers.sorted().map(String.init).joined(separator: ",")))
        }
        if result != .all { items.append(.init(name: "result", value: result.rawValue)) }
        if style == .heat { items.append(.init(name: "view", value: style.rawValue)) }
        components.queryItems = items
        return components.url
    }

    private func exportChart(_ game: DugoutSpraySlate.Game, events: [DugoutSpraySlate.Event], active: DugoutSpraySlate.Event?) {
        removeExport()
        let renderer = ImageRenderer(content: VStack(alignment: .leading, spacing: 8) {
            Text(game.venue).font(.title.weight(.bold))
            Text("\(game.away.name) at \(game.home.name) · \(SlateDate.key(date))").font(.subheadline)
            SprayField(game: game, events: events, selection: active, heat: style == .heat, choose: { _ in })
        }
        .padding(22)
        .frame(width: 520)
        .foregroundStyle(slipPalette.text)
        .background(slipPalette.background)
        .environment(\.colorScheme, scheme))
        renderer.scale = 2
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("SlipSurge-Spray-\(UUID().uuidString).png")
        do {
            guard let data = renderer.uiImage?.pngData() else { throw URLError(.cannotDecodeContentData) }
            try data.write(to: url, options: .atomic)
            exportFile = url
            export = .init(url: url)
        } catch {
            exportFailed = true
        }
    }

    private func removeExport() {
        if let exportFile { try? FileManager.default.removeItem(at: exportFile) }
        exportFile = nil
    }

    private func load(_ key: String) async {
        do {
            let value = try await api.spray(date: key)
            guard !Task.isCancelled, SlateDate.key(date) == key else { return }
            slate = value
            failure = nil
        } catch {
            guard !Task.isCancelled, SlateDate.key(date) == key else { return }
            if let status = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(status.code) { slate = nil }
            failure = error
        }
    }

    private func reset() {
        selectedPlayers = nil
        selectedContact = nil
        result = .all
    }
}

private struct SprayField: View {
    let game: DugoutSpraySlate.Game
    let events: [DugoutSpraySlate.Event]
    let selection: DugoutSpraySlate.Event?
    let heat: Bool
    let choose: (DugoutSpraySlate.Event) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var flight = 1.0

    var body: some View {
        GeometryReader { proxy in
            let bounds = game.shape?.bounds ?? CGRect(x: 0, y: 0, width: 250, height: 250)
            let transform = DugoutParkField.transform(bounds: bounds, in: proxy.size)
            ZStack {
                if game.shape != nil, let logo = game.home.logo {
                    ResearchArtwork(urls: [logo], fallback: "baseball.diamond")
                        .frame(width: 130, height: 130)
                        .opacity(0.15)
                }
                DugoutParkField(shape: game.shape, team: game.home)
                Canvas { context, _ in
                    for event in events {
                        let point = location(event, transform: transform)
                        let tone = contactColor(event.kind)
                        let radius = min(6, max(3.1, 3.1 + ((event.exitVelocity ?? 86) - 80) / 15))
                        if heat {
                            let halo = marker(at: point, radius: 13)
                            context.fill(halo, with: .radialGradient(Gradient(colors: [tone.opacity(0.46), .clear]),
                                center: point, startRadius: 0, endRadius: 13))
                        }
                        if event.kind == .nearHomeRun {
                            context.stroke(marker(at: point, radius: radius + 2), with: .color(tone),
                                style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                        }
                        let active = selection?.id == event.id
                        let dot = marker(at: point, radius: active ? radius + 2 : radius)
                        context.fill(dot, with: .color(tone))
                        if active { context.stroke(dot, with: .color(.white), lineWidth: 1.5) }
                    }
                }
                if let selection {
                    flightPath(selection, transform: transform)
                        .trim(from: 0, to: flight)
                        .stroke(contactColor(selection.kind), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .allowsHitTesting(false)
                }
            }
            .contentShape(.rect)
            .gesture(SpatialTapGesture().onEnded { tap in
                let nearest = events.min { distance(of: $0, to: tap.location, transform: transform) < distance(of: $1, to: tap.location, transform: transform) }
                if let nearest, distance(of: nearest, to: tap.location, transform: transform) <= 24 { choose(nearest) }
            })
        }
        .frame(height: 222)
        .background(.black.opacity(0.17), in: .rect(cornerRadius: 14))
        .accessibilityLabel("Batted-ball spray chart at \(game.venue)")
        .accessibilityValue("\(events.count) contacts. Use Browse batted balls to select a play.")
        .onChange(of: selection?.id) {
            guard selection != nil, !reduceMotion else { flight = 1; return }
            flight = 0
            withAnimation(.easeOut(duration: 0.45)) { flight = 1 }
        }
    }

    private func location(_ event: DugoutSpraySlate.Event, transform: CGAffineTransform) -> CGPoint {
        CGPoint(x: event.hcX, y: event.hcY).applying(transform)
    }

    private func distance(of event: DugoutSpraySlate.Event, to point: CGPoint, transform: CGAffineTransform) -> CGFloat {
        let position = location(event, transform: transform)
        return hypot(position.x - point.x, position.y - point.y)
    }

    private func marker(at point: CGPoint, radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
    }

    private func flightPath(_ event: DugoutSpraySlate.Event, transform: CGAffineTransform) -> Path {
        Path { path in
            path.move(to: CGPoint(x: 125, y: 203).applying(transform))
            let control = CGPoint(x: 125 + (event.hcX - 125) * 0.34, y: max(24, min(event.hcY, 203) - 72))
            path.addQuadCurve(to: location(event, transform: transform), control: control.applying(transform))
        }
    }

    private func contactColor(_ result: DugoutSpraySlate.Result) -> Color {
        switch result {
        case .homeRun: Color(rgb: 0xB4FF4D)
        case .nearHomeRun: Color(rgb: 0xFFB65D)
        case .hit: Color(rgb: 0x71CFFF)
        case .out: Color(rgb: 0xF78091)
        case .all, .other: Color(rgb: 0xCEC5EC)
        }
    }
}

private struct SprayShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
