import SwiftUI

struct ResearchSortHeader: View {
    let title: String
    let selected: Bool
    let ascending: Bool
    let action: () -> Void

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                Image(systemName: selected ? (ascending ? "arrow.up" : "arrow.down") : "arrow.up.arrow.down")
                    .imageScale(.small)
                    .opacity(selected ? 1 : 0.55)
                    .accessibilityHidden(true)
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(SlipSurgePressStyle())
        .foregroundStyle(selected ? Brand.accent(for: scheme) : Brand.text(for: scheme))
        .accessibilityValue(selected ? (ascending ? "Ascending" : "Descending") : "")
        .accessibilityAddTraits(selected ? [.isHeader, .isSelected] : .isHeader)
        .accessibilityHint("Sort by " + title)
    }
}
