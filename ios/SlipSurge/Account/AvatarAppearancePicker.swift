import SwiftUI

struct AvatarAppearancePicker: View {
    private enum Category: String, CaseIterable {
        case all = "All", rings = "Rings", football = "Football", basketball = "Basketball", baseball = "Baseball", slipsurge = "SlipSurge"

        var glyph: String {
            switch self {
            case .all: "square.grid.2x2"
            case .rings: "circle.dashed"
            case .football: "football"
            case .basketball: "basketball"
            case .baseball: "baseball"
            case .slipsurge: "bolt"
            }
        }
    }

    private struct Option: Identifiable {
        let id: String
        let name: String
        let category: Category
    }

    let url: URL?
    let name: String
    let color: String
    let onChoose: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @State private var draft: String
    @State private var category = Category.all
    @State private var query = ""

    init(url: URL?, name: String, style: String, color: String, onChoose: @escaping (String) -> Void) {
        self.url = url
        self.name = name
        self.color = color
        self.onChoose = onChoose
        _draft = State(initialValue: style)
    }

    private var options: [Option] {
        let list = AvatarArtwork.Ring.allCases.map { Option(id: $0.rawValue, name: $0.title, category: .rings) } +
            AvatarArtwork.items.map { item in
                let category = Category.allCases.first { $0.rawValue.lowercased() == item.sport } ?? .slipsurge
                return Option(id: "deco:" + item.id, name: item.name, category: category)
            }
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return list.filter { option in
            (category == .all || category == option.category) &&
            (term.isEmpty || "\(option.name) \(option.category.rawValue)".localizedCaseInsensitiveContains(term))
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 13) {
                NativeMemberAvatar(url: url, name: name, size: 82, style: draft, color: color, animated: true)
                    .padding(.top, 13)
                Text(AvatarArtwork.title(draft)).font(.headline).accessibilityAddTraits(.isHeader)
                ResearchToolRail(title: "Avatar categories", choices: Category.allCases, selection: $category, label: \.rawValue, glyph: \.glyph)
                if options.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 95), spacing: 8)], spacing: 8) {
                        ForEach(options) { option in
                            Button {
                                draft = option.id
                            } label: {
                                VStack(spacing: 9) {
                                    NativeMemberAvatar(url: url, name: name, size: 40, style: option.id, color: color, animated: false)
                                    Text(option.name).font(.caption.weight(.semibold)).multilineTextAlignment(.center)
                                }
                                .padding(.horizontal, 4).padding(.vertical, 12)
                                .frame(maxWidth: .infinity, minHeight: 92, alignment: .top)
                                .background(slipPalette.surface, in: .rect(cornerRadius: 12))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12).strokeBorder(draft == option.id ? slipPalette.accent : .secondary.opacity(0.17))
                                }
                                .overlay(alignment: .topTrailing) {
                                    if draft == option.id {
                                        Image(systemName: "checkmark.circle.fill").font(.caption)
                                            .padding(5).foregroundStyle(slipPalette.accent).accessibilityHidden(true)
                                    }
                                }
                            }
                            .buttonStyle(SlipSurgePressStyle())
                            .accessibilityAddTraits(draft == option.id ? .isSelected : [])
                        }
                    }
                }
            }
            .padding(15)
        }
        .background(slipPalette.background)
        .navigationTitle("Avatar style")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find an avatar style")
        .sensoryFeedback(.selection, trigger: draft)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Use style") {
                    onChoose(draft)
                    dismiss()
                }
            }
        }
    }
}

struct ProfileSportsbookLogo: View {
    let key: String
    var size: CGFloat = 25

    var body: some View {
        let vendor = Sportsbook.normalized(key)
        Group {
            if let art = Sportsbook.artwork(vendor) {
                Image(art).resizable().scaledToFit()
            } else {
                Image(systemName: "chart.bar.xaxis").resizable().scaledToFit().padding(4)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
