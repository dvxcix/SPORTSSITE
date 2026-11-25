import Charts
import SafariServices
import SwiftUI

struct CreatorWalletView: View {
    private struct Portal: Identifiable { let url: URL; var id: URL { url } }
    private struct RevenueQuery: Equatable { let days: Int; let currency: String; let revision: Int }

    let api: CreatorStoreAPI
    @Environment(\.colorScheme) private var scheme
    @State private var page: CreatorWalletSnapshot?
    @State private var payouts: [CreatorWalletSnapshot.Payout] = []
    @State private var cursor: String?
    @State private var revenue: CreatorRevenueSnapshot?
    @State private var disconnected = false
    @State private var financialActions = false
    @State private var loadingWallet = true
    @State private var loadingMore = false
    @State private var openingPortal = false
    @State private var days = 30
    @State private var currency = "usd"
    @State private var status = ""
    @State private var search = ""
    @State private var revision = 0
    @State private var revenueError = false
    @State private var walletError: String?
    @State private var detail: CreatorWalletSnapshot.Payout?
    @State private var portal: Portal?

    private var revenueQuery: RevenueQuery { .init(days: days, currency: currency, revision: revision) }
    private var currencies: [String] {
        Set([currency] + (page?.balances?.map(\.currency) ?? []) + payouts.map(\.currency) + (revenue?.currencies ?? [])).sorted()
    }
    private var visiblePayouts: [CreatorWalletSnapshot.Payout] {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return payouts.filter { row in
            row.currency == currency && (status.isEmpty || row.status == status)
                && (term.isEmpty || row.id.localizedStandardContains(term) || row.createdAt.contains(term))
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                controls
                if disconnected {
                    NavigationLink {
                        CreatorStoreView(api: api)
                    } label: { Label("Set up payments", systemImage: "creditcard") }.buttonStyle(.borderedProminent)
                } else {
                    balances
                }
                revenueCard
                if !disconnected { payoutHistory }
                if let walletError { Text(walletError).font(.subheadline).foregroundStyle(.red) }
            }
            .padding(16)
        }
        .navigationTitle("Balance & payouts")
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refresh", systemImage: "arrow.clockwise") { revision += 1 }.labelStyle(.iconOnly).disabled(loadingWallet)
            }
        }
        .task(id: revision) { await loadWallet() }
        .task(id: revenueQuery) { await loadRevenue(revenueQuery) }
        .refreshable { revision += 1 }
        .sheet(item: $detail) { payout in payoutDetail(payout) }
        .sheet(item: $portal, onDismiss: { revision += 1 }) { portal in
            CreatorWhopPortal(url: portal.url).ignoresSafeArea()
        }
    }

    private var controls: some View {
        HStack(spacing: 10) {
            if let updated = page.flatMap({ SidelineBoard.timestamp($0.checkedAt) }) {
                Label(updated.formatted(date: .omitted, time: .shortened), systemImage: "clock")
                    .font(.footnote).foregroundStyle(.secondary)
                    .accessibilityLabel("Updated \(updated.formatted())")
            }
            Spacer()
            Picker("Currency", selection: $currency) {
                ForEach(currencies, id: \.self) { Text($0.uppercased()).tag($0) }
            }.pickerStyle(.menu)
        }
    }

    private var balances: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Label("Balance", systemImage: "wallet.bifold").font(.headline)
        } content: {
            if let page {
                let row = page.balances?.first { $0.currency == currency }
                ResearchToolValues(items: [
                    .init(label: "Available", text: money(row?.available)),
                    .init(label: "Pending", text: money(row?.pending)),
                    .init(label: "In reserve", text: money(row?.reserved)),
                ])
                if page.balanceError { Text("Whop balance is temporarily unavailable.").font(.caption).foregroundStyle(.secondary) }
                if financialActions {
                    Button {
                        Task { await openPortal() }
                    } label: {
                        if openingPortal { ProgressView() }
                        else {
                            HStack(spacing: 6) {
                                Image("sign-in-whop").renderingMode(.template).resizable().scaledToFit().frame(width: 17, height: 17)
                                    .accessibilityHidden(true)
                                Text(page.canPayout ? "Manage payouts" : "Review verification")
                            }
                        }
                    }.buttonStyle(.borderedProminent).tint(Color(rgb: 0xF96630)).disabled(openingPortal)
                }
            } else if loadingWallet {
                ProgressView("Checking balance")
            }
        }
    }

    private var revenueCard: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            Text("Revenue").font(.headline)
            Spacer()
            Picker("Revenue period", selection: $days) {
                Text("30 days").tag(30)
                Text("90 days").tag(90)
            }.pickerStyle(.menu)
        } content: {
            if let revenue {
                LabeledContent("Gross sales", value: money(revenue.total)).font(.subheadline.weight(.semibold))
                Chart(revenue.points) { day in
                    if let date = SidelineBoard.timestamp("\(day.date)T00:00:00Z") {
                        BarMark(x: .value("Date", date, unit: .day), y: .value("Gross sales", NSDecimalNumber(decimal: day.amount).doubleValue))
                            .foregroundStyle(Brand.accent(for: scheme))
                            .accessibilityLabel(date.formatted(date: .abbreviated, time: .omitted))
                            .accessibilityValue(money(day.amount))
                    }
                }.frame(height: 132).accessibilityLabel("Gross revenue")
                Text("\(revenue.count) payments · UTC dates").foregroundStyle(.secondary).font(.caption)
                if revenue.limited { Text("Based on the latest 1,000 events.").foregroundStyle(.secondary).font(.caption) }
                DisclosureGroup("Daily breakdown") {
                    ForEach(revenue.points) { point in
                        LabeledContent(point.date, value: money(point.amount)).font(.caption)
                    }
                }
            } else if revenueError {
                Button("Retry revenue") { revision += 1 }.buttonStyle(.bordered)
            } else {
                ProgressView("Loading revenue")
            }
        }
    }

    private var payoutHistory: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) { Text("Payout history").font(.headline) } content: {
            if page?.historyError == true {
                Text("Payout history couldn’t load.").font(.subheadline).foregroundStyle(.secondary)
            } else if page != nil {
                HStack {
                    TextField("Find a payout", text: $search).textFieldStyle(.roundedBorder).autocorrectionDisabled()
                    ResearchToolFilter(title: "Status", selection: status.isEmpty ? "All statuses" : pretty(status)) {
                        Picker("Status", selection: $status) {
                            Text("All statuses").tag("")
                            ForEach(["requested", "in_review", "processing", "completed", "reversed", "canceled", "failed", "denied"], id: \.self) { Text(pretty($0)).tag($0) }
                        }
                    }
                }
                if visiblePayouts.isEmpty { Text("No payouts for these filters.").font(.subheadline).foregroundStyle(.secondary) }
                ForEach(visiblePayouts) { payout in
                    Button { detail = payout } label: {
                        LabeledContent(payoutDate(payout.createdAt), value: payout.amountLabel(payout.amount))
                        Text(pretty(payout.status)).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(SlipSurgePressStyle())
                }
                if let cursor {
                    Button(loadingMore ? "Loading payouts" : "Load more payouts") { Task { await loadMore(cursor) } }
                        .buttonStyle(.bordered).disabled(loadingMore || loadingWallet)
                }
            }
        }
    }

    private func payoutDetail(_ payout: CreatorWalletSnapshot.Payout) -> some View {
        NavigationStack {
            List {
                LabeledContent("Status", value: pretty(payout.status))
                LabeledContent("Requested", value: payoutDate(payout.createdAt))
                LabeledContent("Amount", value: payout.amountLabel(payout.amount))
                LabeledContent("Payout fee", value: payout.amountLabel(payout.fee))
                LabeledContent("Provider markup", value: payout.amountLabel(payout.markup))
                LabeledContent("Fees paid by", value: payout.feePaidBy == "self" ? "Your balance" : (payout.feePaidBy == "platform" ? "Platform" : "—"))
                LabeledContent(payout.status == "completed" ? "Net payout" : "Planned net", value: payout.amountLabel(payout.net))
                if let arrival = payout.arrival { LabeledContent("Estimated arrival", value: payoutDate(arrival)) }
                Text(payout.id).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            }
            .navigationTitle("Payout details").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { detail = nil } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func money(_ amount: Decimal?) -> String { amount?.formatted(.currency(code: currency.uppercased())) ?? "—" }
    private func pretty(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
    private func payoutDate(_ value: String) -> String { SidelineBoard.timestamp(value)?.formatted(date: .abbreviated, time: .omitted) ?? "—" }

    private func loadWallet() async {
        loadingWallet = true
        walletError = nil
        defer { loadingWallet = false }
        do {
            async let setup = api.load()
            let snapshot = try await api.wallet()
            try Task.checkCancellation()
            financialActions = (try? await setup)?.canOnboard == true
            page = snapshot
            cursor = snapshot.nextCursor
            payouts = snapshot.payouts ?? []
            disconnected = false
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 { disconnected = true }
        catch { if !Task.isCancelled { walletError = "Balance couldn’t load. Refresh to try again." } }
    }

    private func loadRevenue(_ query: RevenueQuery) async {
        revenue = nil
        revenueError = false
        do {
            let data = try await api.revenue(days: query.days, currency: query.currency)
            if !Task.isCancelled, query == revenueQuery { revenue = data }
        } catch { if !Task.isCancelled, query == revenueQuery { revenueError = true } }
    }

    private func loadMore(_ after: String) async {
        guard !loadingMore && !loadingWallet else { return }
        let requestedRevision = revision
        loadingMore = true
        defer { loadingMore = false }
        do {
            let result = try await api.wallet(after: after)
            guard revision == requestedRevision, cursor == after else { return }
            guard let additions = result.payouts, !result.historyError else { throw URLError(.cannotParseResponse) }
            var seen = Set(payouts.map(\.id))
            payouts.append(contentsOf: additions.filter { seen.insert($0.id).inserted })
            cursor = result.nextCursor
        } catch { walletError = "More payouts couldn’t load." }
    }

    private func openPortal() async {
        guard !openingPortal else { return }
        openingPortal = true
        defer { openingPortal = false }
        do { portal = Portal(url: try await api.payoutPortal()) }
        catch { walletError = "Whop payouts couldn’t open." }
    }
}

private struct CreatorWhopPortal: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
