import SwiftUI

struct DugoutWeatherView: View {
    let api: DugoutToolsAPI
    @State var date: Date
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scene
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var slate: DugoutWeather?
    @State private var selectedGame: Int?
    @State private var selectedHour = ""
    @State private var history: DugoutWeather.Game?
    @State private var revision = 0
    @State private var error: (any Error)?

    var body: some View {
        let key = SlateDate.key(date)
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                ResearchSlateControls(date: $date)
                if let slate, slate.date == key {
                    if let game = slate.games.first(where: { $0.id == selectedGame }) ?? slate.games.first {
                        games(slate, selected: game.id)
                        weather(game)
                    } else {
                        ContentUnavailableView("No park conditions for this date", systemImage: "cloud.sun")
                    }
                } else {
                    ResearchToolMessage(title: "Weather couldn’t load", error: error) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .navigationTitle("Weather Lab")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(key):\(revision)") {
            await load(key)
            while !Task.isCancelled, key == SlateDate.key(.now), let slate {
                do { try await Task.sleep(for: .seconds(max(60, slate.refreshSeconds))) } catch { return }
                if scene == .active { await load(key) }
            }
        }
        .refreshable { await load(key) }
        .onChange(of: key) { selectedGame = nil; selectedHour = ""; error = nil }
        .sheet(item: $history) { game in
            NavigationStack { DugoutParkHistoryView(api: api, game: game) }
                .presentationDragIndicator(.visible)
        }
    }

    private func games(_ slate: DugoutWeather, selected: Int) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(slate.games) { game in
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) {
                            selectedGame = game.id
                            selectedHour = ""
                        }
                    } label: {
                        ResearchMatchup(away: game.away.matchup, home: game.home.matchup, subtitle: game.park, selected: selected == game.id)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                    .accessibilityLabel("\(game.away.name) at \(game.home.name), \(game.park)")
                }
            }
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selected)
    }

    @ViewBuilder
    private func weather(_ game: DugoutWeather.Game) -> some View {
        if let hour = game.hours.first(where: { $0.id == selectedHour }) ?? game.hours.first {
            ResearchToolCard(color: game.home.color) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(game.park).font(.title2.weight(.bold))
                    Text("\(game.city) · \(game.roofTitle)").font(.subheadline).foregroundStyle(.secondary)
                }
            } content: {
                ResearchToolRail(title: "Conditions by hour", choices: game.hours.map(\.id),
                    selection: Binding(get: { hour.id }, set: { selectedHour = $0 }),
                    label: { id in game.hours.first(where: { $0.id == id })?.title ?? id },
                    glyph: { id in game.hours.first(where: { $0.id == id })?.isCurrent == true ? "dot.radiowaves.left.and.right" : "clock" },
                    compact: true)
                ZStack {
                    if let logo = game.home.logo {
                        ResearchArtwork(urls: [logo], fallback: "baseball.diamond")
                            .frame(width: 126, height: 126).opacity(0.19)
                    }
                    DugoutParkField(shape: game.shape, team: game.home)
                    if let bearing = hour.windAngle, let speed = hour.windMph, speed > 0 {
                        ParkWindMotion(degrees: bearing, mph: speed).padding(17)
                    }
                }
                .frame(height: 196)
                .accessibilityHidden(true)
                Label(hour.conditions ?? (hour.isCurrent == true ? "Current observation" : "Hourly conditions"),
                    systemImage: hour.isCurrent == true ? "dot.radiowaves.left.and.right" : "cloud.sun")
                    .font(.subheadline.weight(.semibold))
                ResearchToolValues(items: [
                    .init(label: "Temperature", text: ResearchFormat.decimal(hour.tempF, suffix: "°F")),
                    .init(label: "Wind", text: ResearchFormat.decimal(hour.windMph, suffix: " mph")),
                    .init(label: "Gusts", text: ResearchFormat.decimal(hour.windGustMph, suffix: " mph")),
                    .init(label: "Humidity", text: ResearchFormat.decimal(hour.humidity, suffix: "%")),
                    .init(label: "Field direction", text: hour.windField ?? "—"),
                    .init(label: "Compass", text: hour.compass.map { "\($0.from) → \($0.to)" } ?? "—"),
                ])
                Label(hour.carry.label, systemImage: "baseball")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(hour.carry.score > 0.5 ? Brand.accent(for: scheme) : .secondary)
                Text(game.source).font(.caption2).foregroundStyle(.secondary)
            }
            Button("Park home run history", systemImage: "clock.arrow.circlepath") { history = game }
                .buttonStyle(.bordered)
        }
    }

    private func load(_ key: String) async {
        do {
            let value = try await api.weather(date: key)
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            slate = value
            error = nil
        } catch {
            guard !Task.isCancelled, key == SlateDate.key(date) else { return }
            if let status = error as? SlipSurgeHTTP.Status, [401, 403, 404].contains(status.code) { slate = nil }
            self.error = error
        }
    }
}

private struct ParkWindMotion: View {
    let degrees: Double
    let mph: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { timeline in
            Canvas { context, size in
                let radius = min(size.width, size.height) / 2
                guard radius > 0 else { return }
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let angle = degrees * .pi / 180
                let dx = sin(angle)
                let dy = -cos(angle)
                let time = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                let speed = min(34, max(4, mph * 1.55))
                let length = min(16, 5 + mph * 0.32)
                for index in 0..<20 {
                    let lateral = Double((index * 47) % 91) / 91 * radius * 1.9 - radius
                    let offset = (time * speed + Double(index * 59)).truncatingRemainder(dividingBy: radius * 2) - radius
                    let a = CGPoint(x: center.x + dx * offset - dy * lateral, y: center.y + dy * offset + dx * lateral)
                    guard hypot(a.x - center.x, a.y - center.y) <= radius else { continue }
                    let b = CGPoint(x: a.x + dx * length, y: a.y + dy * length)
                    var trail = Path()
                    trail.move(to: a)
                    trail.addLine(to: b)
                    context.stroke(trail, with: .linearGradient(Gradient(colors: [.clear, .white.opacity(0.63)]),
                        startPoint: a, endPoint: b), style: StrokeStyle(lineWidth: 1.35, lineCap: .round))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct DugoutParkHistoryView: View {
    let api: DugoutToolsAPI
    let game: DugoutWeather.Game
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var data: DugoutParkHistory?
    @State private var error: (any Error)?
    @State private var retry = 0
    @State private var allBatters = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ResearchMatchup(away: game.away.matchup, home: game.home.matchup, subtitle: game.park, fullWidth: true)
                if let data {
                    Text(data.confirmed ? "Confirmed lineups" : "Projected rosters").font(.subheadline.weight(.semibold))
                    Text("Career totals since 2015 · \(data.season) season shown separately")
                        .font(.caption).foregroundStyle(.secondary)
                    Toggle("Include batters with zero home runs", isOn: $allBatters)
                        .font(.subheadline)
                    let batters = allBatters ? data.batters : data.batters.filter { $0.career > 0 }
                    if batters.isEmpty { ContentUnavailableView("No home runs for this lineup", systemImage: "baseball") }
                    ForEach(batters) { batter in
                        let team = data.teams.first { $0.code == batter.team } ?? game.home
                        ResearchToolCard(color: team.color) {
                            ResearchToolPortrait(name: batter.name, subtitle: "\(batter.team) · \(batter.position)", portraits: [batter.headshot],
                                teamLogo: team.logo, primary: team.color, secondary: team.secondaryColor)
                        } content: {
                            ResearchToolValues(items: [.init(label: "Career HR", text: batter.career.formatted()),
                                .init(label: "\(data.season) HR", text: batter.season.formatted())])
                        }
                    }
                } else {
                    ResearchToolMessage(title: "Park home run history couldn’t load", error: error) { retry += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Park home run history")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        }
        .task(id: retry) {
            do { data = try await api.parkHistory(game: game.id); error = nil }
            catch { if !Task.isCancelled { self.error = error } }
        }
    }
}
