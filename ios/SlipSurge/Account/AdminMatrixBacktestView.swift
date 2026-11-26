import SwiftUI

struct AdminMatrixBacktestView: View {
    private struct Availability: Decodable { let paused: Bool; let maximumDays: Int }
    private struct Issue: Decodable { let error: String }
    private struct BacktestRequest: Encodable { let element_code: String; let start_date: String; let end_date: String }

    private struct Backtest: Decodable {
        struct Matrix: Decodable { let name: String; let elementCode: String; let matrixType: String? }
        struct Slate: Decodable, Identifiable {
            let date: String
            let games: [Game]
            let error: String?
            var id: String { date }
        }
        struct Game: Decodable {
            struct Hitter: Decodable { let name: String; let team: String }
            struct Winner: Decodable { let name: String; let team: String; let hit: Bool }
            struct Miss: Decodable { let name: String; let team: String; let excludedAtStep: Int? }
            let homeAbbr: String
            let awayAbbr: String
            let homeLogo: URL?
            let awayLogo: URL?
            let lineupsConfirmed: Bool
            let winners: [Winner]
            let actualHrHitters: [Hitter]
            let missDetails: [Miss]
        }
        struct Metrics: Decodable {
            let precision: Double
            let recall: Double
            let f1: Double
            let totalWinnerFlags: Int
            let totalTruePositives: Int
            let totalRealHrHitters: Int
        }
        let matrix: Matrix
        let dates: [Slate]
        let aggregate: Metrics
    }

    let api: DiscoverAPI
    @Environment(\.slipPalette) private var slipPalette
    @State private var code = ""
    @State private var start = Date.now
    @State private var end = Date.now
    @State private var availability: Availability?
    @State private var readinessError: (any Error)?
    @State private var error: String?
    @State private var result: Backtest?
    @State private var running = false
    @State private var retry = 0

    private static let path = "/api/mobile/admin/matrix-backtest"

    private var dayCount: Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = SlateDate.zone
        return (calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: end)).day ?? -1) + 1
    }

    private var canRun: Bool {
        guard let availability, !availability.paused, !running,
              !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return (1...availability.maximumDays).contains(dayCount)
    }

    var body: some View {
        Form {
            if let availability {
                inputs(availability)
            } else {
                ResearchToolMessage(title: "Backtest status couldn’t load", error: readinessError) { retry += 1 }
            }
            if let result { results(result) }
        }
        .navigationTitle("Matrix backtest")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(slipPalette.background)
        .tint(slipPalette.accent)
        .task(id: retry) { await loadAvailability() }
        .refreshable { if !running { await loadAvailability() } }
    }

    @ViewBuilder private func inputs(_ availability: Availability) -> some View {
        Section {
            TextField("Element code", text: $code, prompt: Text("EL-XXXX-XXXX"))
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
            DatePicker("Start date", selection: $start, displayedComponents: .date)
            DatePicker("End date", selection: $end, displayedComponents: .date)
            if !availability.paused && !(1...availability.maximumDays).contains(dayCount) {
                Text("Choose up to \(availability.maximumDays) days in date order.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            Text("Saved MLB Matrix")
        }
        .environment(\.timeZone, SlateDate.zone)
        .disabled(running)
        Section {
            if availability.paused {
                Label("MLB backtesting is paused for the off-season.", systemImage: "pause.circle")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else if running {
                ProgressView("Running backtest")
            } else {
                Button("Run backtest", systemImage: "chart.line.uptrend.xyaxis") { Task { await run() } }
                    .disabled(!canRun)
            }
            if let error { Label(error, systemImage: "exclamationmark.circle").font(.footnote) }
        }
    }

    @ViewBuilder private func results(_ data: Backtest) -> some View {
        Section {
            Text(data.matrix.name).font(.headline)
            LabeledContent("Element code", value: data.matrix.elementCode)
            if let kind = data.matrix.matrixType { LabeledContent("Type", value: kind.capitalized) }
            LabeledContent("Precision", value: percent(data.aggregate.precision))
            LabeledContent("Recall", value: percent(data.aggregate.recall))
            LabeledContent("F1 score", value: percent(data.aggregate.f1))
            LabeledContent("Correct flags", value: "\(data.aggregate.totalTruePositives) of \(data.aggregate.totalWinnerFlags)")
            LabeledContent("Home run hitters caught", value: "\(data.aggregate.totalTruePositives) of \(data.aggregate.totalRealHrHitters)")
        } header: { Text("Backtest results") }

        ForEach(data.dates) { slate in
            Section(SlateDate.fromKey(slate.date).map { SlateDate.label($0, year: true) } ?? slate.date) {
                if let error = slate.error {
                    Text(error).foregroundStyle(.secondary)
                } else if slate.games.isEmpty {
                    Text("No saved games for this date.").foregroundStyle(.secondary)
                } else {
                    ForEach(Array(slate.games.enumerated()), id: \.offset) { _, game in
                        if game.lineupsConfirmed {
                            DisclosureGroup {
                                gameDetails(game)
                            } label: {
                                gameLabel(game)
                            }
                        } else {
                            gameLabel(game)
                        }
                    }
                }
            }
        }
    }

    private func gameLabel(_ game: Backtest.Game) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: -2) {
                ForEach(Array([game.awayLogo, game.homeLogo].enumerated()), id: \.offset) { _, logo in
                    ResearchArtwork(urls: logo.map { [$0] } ?? [], fallback: "baseball").frame(width: 24, height: 24)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("\(game.awayAbbr) at \(game.homeAbbr)").font(.subheadline.weight(.semibold))
                if game.lineupsConfirmed {
                    let hits = game.winners.filter(\.hit).count
                    Text("\(hits) hit · \(game.winners.count - hits) false · \(game.missDetails.count) missed")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("No confirmed lineup").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func gameDetails(_ game: Backtest.Game) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Flagged by the Matrix").font(.footnote.weight(.semibold))
            if game.winners.isEmpty { Text("No players flagged").font(.caption).foregroundStyle(.secondary) }
            ForEach(Array(game.winners.enumerated()), id: \.offset) { _, player in
                Label("\(player.name) · \(player.team)", systemImage: player.hit ? "checkmark.circle.fill" : "xmark.circle")
                    .font(.caption).foregroundStyle(player.hit ? Color.green : Color.red)
                    .accessibilityValue(player.hit ? "Hit" : "False positive")
            }
            Text("Actual home run hitters").font(.footnote.weight(.semibold))
            if game.actualHrHitters.isEmpty { Text("No home runs").font(.caption).foregroundStyle(.secondary) }
            ForEach(Array(game.actualHrHitters.enumerated()), id: \.offset) { _, hitter in
                Text("\(hitter.name) · \(hitter.team)").font(.caption)
            }
            if !game.missDetails.isEmpty {
                Text("Missed by the Matrix").font(.footnote.weight(.semibold))
                ForEach(Array(game.missDetails.enumerated()), id: \.offset) { _, player in
                    let outcome = player.excludedAtStep.map { "Excluded at step \($0)" } ?? "Lost the final rank"
                    Text("\(player.name) · \(player.team) · \(outcome)").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func percent(_ value: Double) -> String { value.formatted(.percent.precision(.fractionLength(0))) }

    private func loadAvailability() async {
        do {
            let value = try await api.memberRead(Availability.self, path: Self.path)
            try Task.checkCancellation()
            availability = value
            readinessError = nil
        } catch is CancellationError {
            return
        } catch {
            readinessError = error
        }
    }

    private func run() async {
        guard canRun else { return }
        running = true
        error = nil
        result = nil
        defer { running = false }
        do {
            let request = BacktestRequest(element_code: code.trimmingCharacters(in: .whitespacesAndNewlines),
                start_date: SlateDate.key(start), end_date: SlateDate.key(end))
            result = try await api.write(Backtest.self, path: Self.path, body: request, keyDecodingStrategy: .convertFromSnakeCase, timeout: 315)
        } catch let failure as SlipSurgeHTTP.Status {
            error = (try? JSONDecoder().decode(Issue.self, from: failure.data))?.error ?? "Backtest couldn’t finish."
        } catch {
            self.error = "Backtest couldn’t finish."
        }
    }
}
