import SwiftUI

struct SocialSectionBar<Section: Hashable, Title: View>: View {
    let title: String
    let sections: [Section]
    @Binding var selection: Section
    var fillsWidth = true
    @ViewBuilder let label: (Section) -> Title
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if fillsWidth, !typeSize.isAccessibilitySize {
                items(fill: true)
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal) { items(fill: false) }
                        .scrollIndicators(.hidden)
                        .onChange(of: selection, initial: true) { _, section in
                            proxy.scrollTo(section, anchor: .center)
                        }
                }
            }
        }
        .background(Brand.surface(for: scheme))
        .overlay(alignment: .bottom) { Divider().allowsHitTesting(false) }
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private func items(fill: Bool) -> some View {
        HStack(spacing: 0) {
            ForEach(sections, id: \.self) { section in
                let selected = section == selection
                Button { selection = section } label: {
                    label(section)
                        .font(.subheadline.weight(selected ? .bold : .medium))
                        .foregroundStyle(selected ? Brand.accent(for: scheme) : .secondary)
                        .padding(.horizontal, 9)
                        .frame(maxWidth: fill ? .infinity : nil, minHeight: 44)
                        .contentShape(.rect)
                        .overlay(alignment: .bottom) {
                            if selected {
                                Capsule().fill(Brand.accent(for: scheme))
                                    .frame(height: 3).padding(.horizontal, 9)
                                    .allowsHitTesting(false)
                            }
                        }
                }
                .buttonStyle(SlipSurgePressStyle())
                .accessibilityAddTraits(selected ? .isSelected : [])
                .id(section)
            }
        }
        .padding(.horizontal, 7)
    }
}
