import SwiftUI

struct AdminFeatureRollouts: View {
    private enum Audience: String, CaseIterable, Codable {
        case off, admins, members, percentage, everyone

        var title: String {
            switch self {
            case .off: "Off"
            case .admins: "Admins"
            case .members: "Signed-in members"
            case .percentage: "Staged cohort"
            case .everyone: "Everyone"
            }
        }
    }

    private struct Rollout: Decodable, Identifiable {
        let featureKey: String
        var audience: Audience
        var rolloutPercent: Int
        let updatedAt: String?
        var id: String { featureKey }
    }

    private struct Receipt: Decodable { let rollout: Rollout }
    private struct ListReceipt: Decodable { let rollouts: [Rollout] }
    private struct Update: Encodable {
        let featureKey: String
        let audience: Audience
        let rolloutPercent: Int
        let expectedUpdatedAt: String?

        func encode(to encoder: any Encoder) throws {
            enum Key: String, CodingKey { case featureKey, audience, rolloutPercent, expectedUpdatedAt }
            var container = encoder.container(keyedBy: Key.self)
            try container.encode(featureKey, forKey: .featureKey)
            try container.encode(audience, forKey: .audience)
            try container.encode(rolloutPercent, forKey: .rolloutPercent)
            try container.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
        }
    }
    private struct Feature: Identifiable { let id: String; let title: String; let icon: String }
    private static let features: [Feature] = [
        .init(id: "feature_marketplace", title: "Marketplace", icon: "storefront"),
        .init(id: "feature_stories", title: "Stories", icon: "rectangle.stack"),
        .init(id: "feature_groups", title: "Groups", icon: "person.3"),
        .init(id: "feature_polls", title: "Polls", icon: "chart.bar.xaxis"),
        .init(id: "feature_watchlist", title: "Dugout Watchlist", icon: "star"),
    ]

    let account: AccountStore
    let userID: UUID
    @Environment(\.slipPalette) private var slipPalette
    @State private var entries: [Rollout]?
    @State private var original: [String: Rollout] = [:]
    @State private var saving: String?
    @State private var confirmation: Rollout?
    @State private var failure: (any Error)?
    @State private var notice: String?
    private static let endpoint = "/api/admin/feature-rollouts"

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if let entries {
                    ForEach(entries) { item in
                        if let feature = Self.features.first(where: { $0.id == item.id }) { card(item, feature: feature) }
                    }
                    if let notice { Text(notice).font(.subheadline).foregroundStyle(.secondary) }
                } else {
                    ResearchToolMessage(title: "Feature rollouts couldn’t load", error: failure) { Task { await load() } }
                }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .foregroundStyle(slipPalette.text)
        .navigationTitle("Feature rollouts")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Apply this feature rollout?", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }),
            titleVisibility: .visible, presenting: confirmation) { item in
                Button("Apply rollout") { Task { await apply(item) } }
            } message: { item in
                let name = Self.features.first { $0.id == item.id }?.title ?? "Feature"
                Text(item.audience == .percentage ? "\(name) · \(item.rolloutPercent)% cohort" : "\(name) · \(item.audience.title)")
            }
    }

    private func card(_ item: Rollout, feature: Feature) -> some View {
        ResearchToolCard(color: slipPalette.accent) {
            Label(feature.title, systemImage: feature.icon).font(.headline)
        } content: {
            Picker("Audience", selection: binding(item, field: \.audience)) {
                ForEach(Audience.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            if item.audience == .percentage {
                Stepper("Cohort \(item.rolloutPercent)%", value: binding(item, field: \.rolloutPercent), in: 1...99)
            }
            HStack {
                if let date = original[item.id]?.updatedAt.flatMap(SidelineBoard.timestamp) {
                    Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(saving == item.id ? "Saving…" : "Save rollout", systemImage: "checkmark") { confirmation = item }
                    .buttonStyle(.bordered)
                    .disabled(saving != nil || original[item.id]?.audience == item.audience && original[item.id]?.rolloutPercent == item.rolloutPercent)
            }
        }
    }

    private func binding<T>(_ item: Rollout, field: WritableKeyPath<Rollout, T>) -> Binding<T> {
        Binding(get: { entries?.first(where: { $0.id == item.id })?[keyPath: field] ?? item[keyPath: field] }, set: { value in
            guard let index = entries?.firstIndex(where: { $0.id == item.id }) else { return }
            entries?[index][keyPath: field] = value
            if entries?[index].audience == .percentage { entries?[index].rolloutPercent = min(99, max(1, entries?[index].rolloutPercent ?? 10)) }
        })
    }

    private func load() async {
        failure = nil
        notice = nil
        do {
            let data = try await SlipSurgeHTTP.memberData(Self.endpoint, account: account, userID: userID)
            let loaded = try decoder.decode(ListReceipt.self, from: data)
            let byID = Dictionary(loaded.rollouts.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            let rows = Self.features.map { byID[$0.id] ?? .init(featureKey: $0.id, audience: .everyone, rolloutPercent: 100, updatedAt: nil) }
            entries = rows
            original = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        } catch { if !Task.isCancelled { failure = error; entries = nil } }
    }

    private func apply(_ item: Rollout) async {
        guard saving == nil else { return }
        saving = item.id
        defer { saving = nil }
        notice = nil
        do {
            var request = try SlipSurgeHTTP.request(host: SlipSurgeHTTP.site, path: Self.endpoint)
            let token = try await account.accessToken(for: userID)
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(Update(featureKey: item.featureKey, audience: item.audience,
                rolloutPercent: item.rolloutPercent, expectedUpdatedAt: original[item.id]?.updatedAt))
            let data = try await SlipSurgeHTTP.send(request)
            guard account.memberID == userID else { throw URLError(.userAuthenticationRequired) }
            let result = try decoder.decode(Receipt.self, from: data).rollout
            guard result.id == item.id, let index = entries?.firstIndex(where: { $0.id == result.id }) else { throw URLError(.cannotParseResponse) }
            if entries?[index].audience == item.audience, entries?[index].rolloutPercent == item.rolloutPercent { entries?[index] = result }
            original[result.id] = result
            notice = "Rollout updated."
        } catch let status as SlipSurgeHTTP.Status where status.code == 409 {
            notice = "This rollout changed. Refresh the saved settings."
        } catch { notice = "The rollout couldn’t be confirmed. Refresh before retrying." }
    }

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
