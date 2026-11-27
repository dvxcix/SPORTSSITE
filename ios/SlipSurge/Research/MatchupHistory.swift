import SwiftUI

struct MatchupHistory: View {
    let archive: MatchupArchive
    let away: ResearchMatchup.Team
    let home: ResearchMatchup.Team
    let benchmark: String
    @Environment(\.slipPalette) private var palette
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var showAway = false
    @State private var showHome = false

    var body: some View {
        let layout = sizeClass == .regular && !textSize.isAccessibilitySize
            ? AnyLayout(HStackLayout(alignment: .top, spacing: 10))
            : AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
        let benchmarkName = benchmark == "consensus" ? "Consensus" : Sportsbook.name(Sportsbook.normalized(benchmark))
        VStack(alignment: .leading, spacing: 9) {
            Text("\(benchmarkName) · Pregame archive").font(.subheadline.weight(.semibold))
            Text("ATS is cover–miss–push. Totals are over–under–push. Coverage counts the games with an archived line.")
                .font(.caption).foregroundStyle(.secondary)
            layout {
                teamHistory(archive.away, artwork: away, opened: $showAway)
                teamHistory(archive.home, artwork: home, opened: $showHome)
            }
            if (archive.away.games + archive.home.games).contains(where: \.readFailed) {
                Text("Some archived lines couldn’t load. Pull to refresh for another try.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func teamHistory(_ team: MatchupArchive.Team, artwork: ResearchMatchup.Team, opened: Binding<Bool>) -> some View {
        let grades = MatchupArchive.grades(team, benchmark: benchmark, normalize: Sportsbook.normalized)
        let spread = MatchupArchive.Record(grades, result: \.spreadResult)
        let total = MatchupArchive.Record(grades, result: \.totalResult)
        return ResearchToolCard(color: artwork.color) {
            HStack(spacing: 9) {
                ResearchArtwork(urls: artwork.logo.map { [$0] } ?? [], fallback: "shield")
                    .frame(width: 26, height: 26).accessibilityHidden(true)
                Text(artwork.name).font(.headline)
                Spacer()
                Text("\(grades.count) of 10 games").font(.caption).foregroundStyle(.secondary)
            }
        } content: {
            ResearchToolValues(items: [
                .init(label: "ATS · \(spread.count)/\(grades.count)", text: spread.display),
                .init(label: "O/U · \(total.count)/\(grades.count)", text: total.display)
            ], preferredColumns: 2)
            if grades.isEmpty {
                Text("No verified finals before this matchup.").font(.caption).foregroundStyle(.secondary)
            } else {
                DisclosureGroup("Game log", isExpanded: opened) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(grades, id: \.game.id) { grade in gradeRow(grade) }
                    }
                    .padding(.top, 8)
                }
                .accessibilityLabel("\(artwork.name) game log")
            }
        }
    }

    private func gradeRow(_ grade: MatchupArchive.Grade) -> some View {
        let game = grade.game
        return VStack(alignment: .leading, spacing: 5) {
            Divider()
            HStack(alignment: .firstTextBaseline) {
                Text("\(game.home ? "vs" : "at") \(game.opponent)").font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(game.scored)–\(game.allowed)").font(.subheadline.monospacedDigit())
            }
            if let date = SlateDate.fromKey(game.date) {
                Text(SlateDate.label(date, year: game.season != archive.season)).font(.caption2).foregroundStyle(.secondary)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { spreadGrade(grade); totalGrade(grade) }.fixedSize(horizontal: true, vertical: false)
                VStack(alignment: .leading, spacing: 4) { spreadGrade(grade); totalGrade(grade) }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func spreadGrade(_ grade: MatchupArchive.Grade) -> some View {
        let line = grade.spread.map { ($0 > 0 ? "+" : "") + ResearchFormat.decimal($0) }
        let result = grade.spreadResult.map { $0 == 0 ? "Push" : ($0 > 0 ? "Cover" : "Miss") }
        return Text([line, result].compactMap { $0 }.joined(separator: " · ").isEmpty
            ? "No spread archived" : "ATS " + [line, result].compactMap { $0 }.joined(separator: " · "))
            .font(.caption).foregroundStyle(grade.spreadResult == 1 ? palette.accent : .secondary)
    }

    private func totalGrade(_ grade: MatchupArchive.Grade) -> some View {
        let label = grade.totalResult.map { $0 == 0 ? "Push" : ($0 > 0 ? "Over" : "Under") }
        return Text(grade.total.map { "O/U \(ResearchFormat.decimal($0)) · \(label ?? "")" } ?? "No total archived")
            .font(.caption).foregroundStyle(.secondary)
    }
}
