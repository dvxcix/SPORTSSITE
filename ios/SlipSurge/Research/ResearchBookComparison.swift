import SwiftUI

struct ResearchBookTarget: Sendable {
    let gameID: String
    let playerID: Int
    let team: String
    let line: Double

    func price(in slate: ResearchOddsSlate) -> ResearchOddsSlate.Price? {
        slate.players.first { $0.gameID == gameID && $0.playerID == playerID && $0.team.code == team }?
            .prices.first { $0.line == line }
    }
}

struct ResearchBookQuote: Sendable {
    let price: ResearchOddsSlate.Price
    let expiry: Date?
}

typealias ResearchBookRead = @Sendable (String, ResearchBookTarget) async throws -> ResearchBookQuote?

struct ResearchOddsDetail: Identifiable {
    let player: ResearchOddsSlate.Player
    let matchup: ResearchOddsSlate.Game?
    let subtitle: String
    let live: Bool
    let sportsbook: String
    let books: [String]
    let original: ResearchBookQuote
    let read: ResearchBookRead

    var id: String { "\(player.id):\(original.price.line)" }

    var target: ResearchBookTarget {
        .init(gameID: player.gameID, playerID: player.playerID, team: player.team.code, line: original.price.line)
    }
}

struct ResearchBookComparison: View {
    private enum Section: String, CaseIterable {
        case sportsbooks = "Sportsbooks"
        case history = "History"
    }

    private enum Outcome: Sendable {
        case quoted(ResearchBookQuote)
        case unavailable
        case failed
        case denied
    }

    let detail: ResearchOddsDetail

    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var section = Section.sportsbooks
    @State private var outcomes: [String: Outcome] = [:]
    @State private var retry = 0
    @State private var denied = false
    @State private var expiryCheck = Date.distantPast

    private var vendors: [String] {
        Array(Set(detail.books + [detail.sportsbook])).sorted {
            if ($0 == detail.sportsbook) != ($1 == detail.sportsbook) { return $0 == detail.sportsbook }
            let left = bookName($0)
            let right = bookName($1)
            return left == right ? $0 < $1 : left < right
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                context
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
                    .padding(.bottom, 12)
                Picker("Odds detail", selection: $section) {
                    ForEach(Section.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                if denied {
                    ContentUnavailableView("Odds Board access required", systemImage: "lock")
                } else {
                    switch section {
                    case .sportsbooks: bookList(at: max(expiryCheck, .now))
                    case .history: history(at: max(expiryCheck, .now))
                    }
                }
            }
            .frame(maxWidth: 580)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(slipPalette.background)
            .navigationTitle("Compare odds")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(slipPalette.accent)
        .presentationDetents(textSize.isAccessibilitySize ? [.large] : [.fraction(0.68), .large])
        .presentationDragIndicator(.visible)
        .task(id: retry) { await loadBooks() }
        .task(id: nextExpiry) {
            guard let nextExpiry else { return }
            do {
                try await Task.sleep(for: .seconds(max(0, nextExpiry.timeIntervalSinceNow)))
                expiryCheck = max(nextExpiry, .now)
            } catch { return }
        }
    }

    private var context: some View {
        let player = detail.player
        return HStack(spacing: 12) {
            PlayerArtwork(portraits: player.portraits, logo: player.logo, primary: player.primary, secondary: player.secondary)
            VStack(alignment: .leading, spacing: 4) {
                Text(player.name).font(.headline).accessibilityAddTraits(.isHeader)
                Text(detail.subtitle).font(.subheadline.weight(.semibold))
                HStack(spacing: 5) {
                    if let matchup = detail.matchup {
                        ForEach([matchup.away?.logo, matchup.home?.logo].compactMap { $0 }, id: \.self) { logo in
                            ResearchArtwork(urls: [logo], fallback: "shield", pointSize: 15)
                                .frame(width: 15, height: 15)
                        }
                    }
                    Text([detail.matchup?.title, detail.live ? "Live" : "Pregame"].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background {
            ZStack {
                slipPalette.surface
                LinearGradient(colors: [player.primary.opacity(scheme == .dark ? 0.35 : 0.15),
                    player.secondary.opacity(scheme == .dark ? 0.25 : 0.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .clipShape(.rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }

    private var nextExpiry: Date? {
        outcomes.values.compactMap { outcome in
            if case .quoted(let quote) = outcome { quote.expiry }
            else { nil }
        }.filter { $0 > expiryCheck }.min()
    }

    private func bookList(at now: Date) -> some View {
        let quoted = vendors.compactMap { book -> (String, Int)? in
            guard case .quoted(let quote) = outcomes[book], quote.expiry.map({ $0 > now }) != false else { return nil }
            return (book, quote.price.current)
        }
        let pending = vendors.contains { outcomes[$0] == nil }
        let best = !pending && quoted.count > 1 ? quoted.map { $0.1 }.max() : nil
        let ordered = quoted.sorted { first, second in
            first.1 == second.1 ? bookName(first.0) < bookName(second.0) : first.1 > second.1
        }.map { $0.0 }
        let rows = pending ? vendors : ordered + vendors.filter { book in !ordered.contains(book) }
        let canRetry = outcomes.values.contains { outcome in
            switch outcome {
            case .quoted(let quote): quote.expiry.map { $0 <= now } == true
            case .failed: true
            default: false
            }
        }
        return List {
            ForEach(rows, id: \.self) { vendor in
                bookRow(vendor, best: best, now: now)
            }
            if canRetry && !pending {
                Button("Refresh prices", systemImage: "arrow.clockwise") { retry += 1 }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func bookRow(_ vendor: String, best: Int?, now: Date) -> some View {
        let outcome = outcomes[vendor]
        let name = bookName(vendor)
        return HStack(spacing: 10) {
            if let asset = Sportsbook.artwork(Sportsbook.normalized(vendor)) {
                Image(asset).resizable().scaledToFit().frame(width: 25, height: 25).accessibilityHidden(true)
            } else {
                Image(systemName: "chart.bar.xaxis").frame(width: 25, height: 25).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.subheadline.weight(.semibold))
                if case .quoted(let quote) = outcome, quote.expiry.map({ $0 > now }) != false {
                    Text(quote.price.observedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 4)
            switch outcome {
            case .quoted(let quote) where quote.expiry.map({ $0 > now }) != false:
                VStack(alignment: .trailing, spacing: 3) {
                    Text(ResearchOddsBoard.price(quote.price.current)).font(.headline).monospacedDigit()
                    if best == quote.price.current {
                        Text("Best recorded").font(.caption2.weight(.semibold)).foregroundStyle(slipPalette.accent)
                    }
                }
            case .quoted:
                Text("Refresh needed").font(.caption).foregroundStyle(.secondary)
            case .unavailable:
                Text("No price for this line").font(.caption).foregroundStyle(.secondary)
            case .failed, .denied:
                Text("Unavailable").font(.caption).foregroundStyle(.secondary)
            case nil:
                ProgressView().controlSize(.small).accessibilityLabel("Loading \(name)")
            }
        }
        .frame(minHeight: 40)
        .accessibilityElement(children: .combine)
    }

    private func bookName(_ vendor: String) -> String {
        Sportsbook.name(Sportsbook.normalized(vendor))
    }

    @ViewBuilder
    private func history(at now: Date) -> some View {
        let book = detail.sportsbook
        switch outcomes[book] {
        case .quoted(let quote) where quote.expiry.map({ $0 > now }) != false:
            VStack(alignment: .leading, spacing: 0) {
                Text(bookName(book))
                    .font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                    .padding(.horizontal, 18).padding(.top, 6)
                ResearchPriceHistory(price: quote.price, live: detail.live)
            }
        case nil:
            ProgressView("Loading history").frame(maxWidth: .infinity, maxHeight: .infinity)
        default:
            ContentUnavailableView {
                Label("Price history unavailable", systemImage: "clock.arrow.circlepath")
            } actions: {
                Button("Refresh prices") { retry += 1 }
            }
        }
    }

    private func loadBooks() async {
        let target = detail.target
        let read = detail.read
        let sportsbook = detail.sportsbook
        let canUseOriginal = retry == 0 && detail.original.expiry.map { $0 > .now } != false
        denied = false
        outcomes = canUseOriginal ? [sportsbook: .quoted(detail.original)] : [:]
        var remaining = vendors.filter { !canUseOriginal || $0 != sportsbook }.makeIterator()
        await withTaskGroup(of: (String, Outcome).self) { group in
            func submit(_ vendor: String) {
                group.addTask {
                    do {
                        return (vendor, try await read(vendor, target).map(Outcome.quoted) ?? .unavailable)
                    } catch let error as SlipSurgeHTTP.Status where [401, 403].contains(error.code) {
                        return (vendor, .denied)
                    } catch {
                        return (vendor, .failed)
                    }
                }
            }
            for _ in 0..<3 {
                if let vendor = remaining.next() { submit(vendor) }
            }
            for await (vendor, outcome) in group {
                guard !Task.isCancelled else { return }
                if case .denied = outcome {
                    outcomes = [:]
                    denied = true
                    group.cancelAll()
                    return
                }
                outcomes[vendor] = outcome
                if let next = remaining.next() { submit(next) }
            }
        }
    }
}
