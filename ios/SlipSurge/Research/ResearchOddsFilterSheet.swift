import SwiftUI

struct ResearchOddsFilterSheet: View, Identifiable {
    let id = UUID()
    let slate: ResearchOddsSlate
    let marketLabel: String
    let live: Bool
    let defaultSort: OddsSort
    let allowsMilestones: Bool
    @Bindable var filter: ResearchOddsFilters
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette

    private var selectedSort: OddsSort { filter.sort ?? defaultSort }

    private var teams: [ResearchOddsSlate.Team] {
        Array(Set(slate.players.filter { filter.game == nil || $0.gameID == filter.game }.map(\.team)))
            .sorted { $0.name < $1.name }
    }

    private var milestones: [Double] {
        let prices = filter.players(in: slate).flatMap(\.prices).map(\.line)
        return Array(Set(prices + (filter.target.map { [$0] } ?? []))).sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ResearchArtworkPicker(title: "Odds Board matchup", options: [.init(id: "", title: "All games", icon: "calendar")]
                        + slate.games.map { matchup in
                            .init(id: matchup.id, title: matchup.title, url: matchup.away?.logo ?? matchup.home?.logo,
                                  secondaryLogo: matchup.away?.logo == nil ? nil : matchup.home?.logo, icon: "calendar")
                        }, selection: Binding(get: { filter.game ?? "" }, set: { filter.selectGame($0.isEmpty ? nil : $0) }))
                    ResearchArtworkPicker(title: "Team", options: [.init(id: "", title: "All teams", icon: "shield")]
                        + teams.map { item in
                            .team(id: item.code, title: item.name, logo: slate.players.first { $0.team.code == item.code }?.logo)
                        }, selection: Binding(get: { filter.team ?? "" }, set: { filter.team = $0.isEmpty ? nil : $0 }))
                    Picker(selection: $filter.comparison) {
                        ForEach(OddsComparison.allCases, id: \.self) { Label($0.label(live: live), systemImage: $0.symbol).tag($0) }
                    } label: {
                        Label("Compare with", systemImage: "clock")
                    }
                    Picker(selection: Binding(get: { selectedSort }, set: { filter.sort = $0; filter.sortedPriceLine = nil; filter.ascendingName = true })) {
                        ForEach(OddsSort.allCases, id: \.self) { Label($0.rawValue, systemImage: $0.symbol).tag($0) }
                    } label: {
                        Label("Sort", systemImage: "arrow.up.arrow.down")
                    }
                    if allowsMilestones {
                        Picker(selection: $filter.target) {
                            Label("All milestones", systemImage: "line.3.horizontal.decrease").tag(nil as Double?)
                            ForEach(milestones, id: \.self) {
                                Label("\($0.formatted())+", systemImage: "plus.circle").tag(Optional($0))
                            }
                        } label: {
                            Label("Milestone", systemImage: "target")
                        }
                    }
                } header: {
                    Text(marketLabel)
                }
            }
            .navigationTitle("Odds Board filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .tint(slipPalette.accent)
    }
}

extension EnvironmentValues {
    @Entry var presentOddsFilters: (ResearchOddsFilterSheet) -> Void = { _ in }
}
