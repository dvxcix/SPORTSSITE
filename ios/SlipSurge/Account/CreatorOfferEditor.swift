import SwiftUI

struct CreatorOfferEditor: View {
    private enum OfferType: String, CaseIterable {
        case recurring = "membership", oneTime = "one_time"
        var title: String { self == .recurring ? "Renews automatically" : "One-time access" }
    }

    let api: CreatorStoreAPI
    let created: (UUID) async -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var id = UUID()
    @State private var title = ""
    @State private var description = ""
    @State private var price: Decimal?
    @State private var days = 30
    @State private var type = OfferType.recurring
    @State private var saving = false
    @State private var problem: String?

    private var canSave: Bool {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !saving && (2...80).contains(name.count) && (1...10_000).contains(price ?? 0)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Offer name", text: $title)
                TextField("Description", text: $description, axis: .vertical).lineLimit(3...6)
                Picker("Billing", selection: $type) {
                    ForEach(OfferType.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                TextField("Price in USD", value: $price, format: .number).keyboardType(.decimalPad)
                Picker(type == .recurring ? "Billing interval" : "Access duration", selection: $days) {
                    ForEach([7, 30, 90, 365], id: \.self) { Text("\($0) days").tag($0) }
                }
                if let problem { Label(problem, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
            }
            .navigationTitle("New paid offer")
            .navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden)
            .background(Brand.background(for: scheme))
            .foregroundStyle(Brand.text(for: scheme))
            .disabled(saving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() }
                    else { Button("Create offer") { Task { await save() } }.disabled(!canSave) }
                }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        guard canSave, let price else { return }
        saving = true
        problem = nil
        defer { saving = false }
        do {
            let response = try await api.createOffer(.init(requestId: id.uuidString.lowercased(), title: title,
                description: description, price: price, productType: type.rawValue, billingDays: days))
            await created(response)
            dismiss()
        } catch let error as SlipSurgeHTTP.Status {
            struct Details: Decodable { let error: String }
            problem = (try? JSONDecoder().decode(Details.self, from: error.data))?.error ?? "This offer couldn’t be confirmed."
        } catch { problem = "This offer couldn’t be confirmed. Tap Create offer to resume." }
    }
}
