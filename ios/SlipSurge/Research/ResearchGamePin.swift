import SwiftUI

struct ResearchGamePin: View {
    struct Matchup: Codable, Equatable {
        let date: String
        let id: String
        let label: String
    }

    let current: Matchup?
    let open: (Matchup) -> Void
    @AppStorage private var storage: Data

    init(account: UUID, league: String, current: Matchup?, open: @escaping (Matchup) -> Void) {
        self.current = current
        self.open = open
        _storage = AppStorage(wrappedValue: Data(), "research.pin.v1.\(account.uuidString).\(league)")
    }

    private var pin: Matchup? { try? JSONDecoder().decode(Matchup.self, from: storage) }
    private var isPinned: Bool { pin != nil && pin == current }

    var body: some View {
        if current != nil || pin != nil {
            Menu {
                if let pin {
                    Button("Open \(pin.label)", systemImage: "arrow.up.forward") { open(pin) }
                    Button("Remove pinned matchup", systemImage: "pin.slash") { storage = Data() }
                }
                if let current, !isPinned {
                    Button(pin == nil ? "Pin \(current.label)" : "Replace pin with \(current.label)", systemImage: "pin") {
                        if let encoded = try? JSONEncoder().encode(current) { storage = encoded }
                    }
                }
            } label: {
                Label(pin.map { "Pinned matchup, \($0.label)" } ?? "Pin matchup", systemImage: pin == nil ? "pin" : "pin.fill")
                    .labelStyle(.iconOnly)
                    .font(.subheadline.weight(.semibold))
                    .frame(minWidth: 32, minHeight: 32)
            }
            .buttonStyle(.bordered)
        }
    }
}
