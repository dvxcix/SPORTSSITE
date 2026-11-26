import SwiftUI

struct MemberProgressView: View {
    private struct Mastery: Decodable {
        struct Mission: Decodable, Identifiable {
            let key: String
            let title: String
            let current: Int
            let target: Int
            let period: String
            let points: Int
            var id: String { key }
            var complete: Bool { target > 0 && current >= target }
            var fraction: Double { min(1, Double(max(0, current)) / Double(max(1, target))) }
        }

        let points: Int
        let level: Int
        let missions: [Mission]
        let achievements: [String]

        private var floor: Double { pow(Double(max(0, level - 1)), 2) * 100 }
        private var ceiling: Double { pow(Double(level), 2) * 100 }
        var fraction: Double { min(1, max(0, (Double(points) - floor) / max(1, ceiling - floor))) }
        var remaining: Double { max(0, ceiling - Double(points)) }
    }

    private struct Achievement: Identifiable {
        let id: String
        let title: String
        let detail: String
        let icon: String
    }

    private static let achievements: [Achievement] = [
        .init(id: "first_signal", title: "First Signal", detail: "Shared a first post or pick.", icon: "sparkles"),
        .init(id: "ten_picks", title: "Board Builder", detail: "Tracked 10 picks.", icon: "scope"),
        .init(id: "ten_wins", title: "Proven Read", detail: "Recorded 10 graded wins.", icon: "trophy"),
        .init(id: "conversation_starter", title: "In the Mix", detail: "Joined 25 conversations.", icon: "bubble.left.and.bubble.right"),
        .init(id: "clubhouse_regular", title: "Clubhouse Regular", detail: "Joined three communities.", icon: "flame"),
        .init(id: "research_routine", title: "Research Routine", detail: "Saved 10 research notes.", icon: "note.text"),
    ]

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var mastery: Mastery?
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let mastery {
                    levelCard(mastery)
                    Text("Mission board").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    ForEach(mastery.missions) { mission in missionCard(mission) }
                    Text("Achievements").font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    ForEach(Self.achievements) { achievement in
                        achievementRow(achievement, earned: mastery.achievements.contains(achievement.id))
                    }
                } else if failed {
                    ContentUnavailableView {
                        Label("Progress unavailable", systemImage: "trophy")
                    } actions: {
                        Button("Retry") { Task { await load() } }
                    }
                } else {
                    ProgressView("Loading missions").frame(maxWidth: .infinity)
                }
            }
            .padding(16)
        }
        .navigationTitle("Missions")
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(destination: DiscoverView(api: api, opensDestination: .constant(.leaderboard))) {
                    Label("Leaderboard", systemImage: "chart.bar.xaxis")
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func levelCard(_ value: Mastery) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Level \(value.level)", systemImage: "trophy.fill")
                .font(.subheadline.weight(.heavy)).foregroundStyle(slipPalette.accent)
            Text("\(value.points.formatted()) points").font(.largeTitle.weight(.heavy)).monospacedDigit()
            ProgressView(value: value.fraction).tint(slipPalette.accent)
                .accessibilityLabel("Progress to level \(value.level + 1)")
            Text("\(value.remaining.formatted(.number.precision(.fractionLength(0)))) points to Level \(value.level + 1)")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .topLeading) {
            let shape = RoundedRectangle(cornerRadius: 22)
            shape.fill(slipPalette.surface).overlay {
                shape.fill(.linearGradient(colors: [slipPalette.accent.opacity(0.18), .clear],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
    }

    private func missionCard(_ mission: Mastery.Mission) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(mission.period.capitalized).foregroundStyle(.secondary)
                Spacer()
                Text("+\(mission.points)").foregroundStyle(slipPalette.accent).monospacedDigit()
            }.font(.subheadline.weight(.semibold))
            Text(verbatim: mission.title).font(.headline)
            ProgressView(value: mission.fraction).tint(slipPalette.accent)
                .accessibilityLabel(mission.title)
            if mission.complete {
                Label("Complete", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.bold)).foregroundStyle(slipPalette.accent)
            } else {
                Text("\(mission.current) / \(mission.target)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(slipPalette.surface, in: .rect(cornerRadius: 15))
    }

    private func achievementRow(_ achievement: Achievement, earned: Bool) -> some View {
        HStack(spacing: 11) {
            Image(systemName: achievement.icon)
                .frame(width: 38, height: 38)
                .foregroundStyle(earned ? slipPalette.accent : .secondary)
                .background(slipPalette.background, in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: achievement.title).font(.headline)
                Text(verbatim: achievement.detail).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: earned ? "checkmark.circle.fill" : "lock")
                .foregroundStyle(earned ? slipPalette.accent : .secondary)
                .accessibilityLabel(earned ? "Earned" : "Locked")
        }
        .padding(12)
        .background(slipPalette.surface, in: .rect(cornerRadius: 15))
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        do {
            mastery = try await api.readPublic(Mastery.self, path: "/api/mobile/member-progress", query: [.init(name: "view", value: "missions")])
            failed = false
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}

struct ActivityReplayView: View {
    private struct Page: Decodable { let events: [Event] }

    private struct Event: Decodable, Identifiable {
        let id: Int64
        let activityType: String
        let targetPath: String
        let label: String
        let occurredAt: String

        var date: Date? { SidelineBoard.timestamp(occurredAt) }

        var destination: URL? {
            guard targetPath.utf8.count <= 900, targetPath.hasPrefix("/"), !targetPath.hasPrefix("//"),
                  !targetPath.contains("\\"), let url = URL(string: "https://" + SlipSurgeHTTP.site + targetPath),
                  NativeSiteLink(url) != nil || ResearchDeepLink(url) != nil else { return nil }
            return url
        }

        var symbol: String {
            switch activityType {
            case "post": "text.bubble"
            case "pick": "scope"
            case "reply": "arrowshape.turn.up.left"
            case "reaction": "heart"
            case "follow": "person.badge.plus"
            case "community": "person.2"
            case "research": "note.text"
            default: "clock"
            }
        }
    }

    private struct Day: Identifiable {
        let id: Date
        let events: [Event]
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.openURL) private var openURL
    @State private var events: [Event]?
    @State private var failed = false

    var body: some View {
        List {
            if let events {
                if events.isEmpty {
                    ContentUnavailableView {
                        Label("No recent activity", systemImage: "clock.arrow.circlepath")
                    } actions: {
                        if let url = URL(string: "https://" + SlipSurgeHTTP.site + "/feed") {
                            Button("Open the feed") { openURL(url) }
                        }
                    }
                    .listRowBackground(slipPalette.surface)
                }
                ForEach(days(events)) { day in
                    Section(dayLabel(day.id)) {
                        ForEach(day.events) { event in
                            if let destination = event.destination {
                                Button { openURL(destination) } label: {
                                    HStack {
                                        row(event)
                                        Spacer()
                                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                    }
                                }.buttonStyle(.plain)
                            } else {
                                row(event)
                            }
                        }
                    }.listRowBackground(slipPalette.surface)
                }
            } else if failed {
                ContentUnavailableView {
                    Label("Activity unavailable", systemImage: "clock")
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else {
                ProgressView("Loading activity")
            }
        }
        .navigationTitle("Activity Replay")
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ event: Event) -> some View {
        HStack(spacing: 11) {
            Image(systemName: event.symbol).foregroundStyle(slipPalette.accent)
                .frame(width: 36, height: 36)
                .background(slipPalette.background, in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: event.label).font(.headline)
                HStack(spacing: 5) {
                    Text(event.activityType.capitalized)
                    if let date = event.date { Text(date, style: .time) }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }.accessibilityElement(children: .combine)
    }

    private func days(_ events: [Event]) -> [Day] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: events) { event in
            event.date.map { calendar.startOfDay(for: $0) } ?? .distantPast
        }
        return grouped.keys.sorted(by: >).map { Day(id: $0, events: grouped[$0] ?? []) }
    }

    private func dayLabel(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        if day == .distantPast { return "Date unavailable" }
        return day.formatted(date: .abbreviated, time: .omitted)
    }

    private func load() async {
        do {
            events = try await api.readPublic(Page.self, path: "/api/mobile/member-progress", query: [.init(name: "view", value: "activity")]).events
            failed = false
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}
