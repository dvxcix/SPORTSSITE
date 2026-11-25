import SwiftUI

struct ResearchArtworkPicker: View {
    struct Option: Identifiable {
        let id: String
        let title: String
        var asset: String?
        var url: URL?
        var secondaryLogo: URL?
        var playerTeamLogo: URL?
        var playerColors: [Color] = []
        var icon = "circle.grid.2x2"

        static func sportsbook(_ key: String) -> Self {
            let name = Sportsbook.normalized(key)
            return .init(id: key, title: Sportsbook.name(name), asset: Sportsbook.artwork(name), icon: "chart.bar.xaxis")
        }

        static func team(id: String, title: String, logo: URL?) -> Self {
            .init(id: id, title: title, url: logo, icon: "shield")
        }
    }

    let title: String
    let options: [Option]
    @Binding var selection: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var search = ""

    private var selected: Option? { options.first { $0.id == selection } }

    var body: some View {
        Button {
            search = ""
            shown = true
        } label: {
            HStack(spacing: 7) {
                if let selected { artwork(selected, size: 22) }
                Text(selected?.title ?? title).font(.subheadline.weight(.semibold))
                Image(systemName: "chevron.down").font(.caption2.weight(.bold)).accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .modifier(PickerSurface())
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(title)
        .accessibilityValue(selected?.title ?? "")
        .sensoryFeedback(.selection, trigger: selection)
        .sheet(isPresented: $shown) {
            NavigationStack {
                List {
                    ForEach(search.isEmpty ? options : options.filter { $0.title.localizedCaseInsensitiveContains(search) }) { option in
                        Button {
                            withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { selection = option.id }
                            shown = false
                        } label: {
                            HStack(spacing: 13) {
                                artwork(option, size: 34)
                                Text(option.title).font(.body.weight(.medium))
                                Spacer()
                                if selection == option.id {
                                    Image(systemName: "checkmark").font(.headline).foregroundStyle(Brand.accent(for: scheme))
                                        .accessibilityHidden(true)
                                }
                            }
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                        }
                        .buttonStyle(SlipSurgePressStyle())
                        .accessibilityAddTraits(selection == option.id ? .isSelected : [])
                        .listRowBackground(Brand.surface(for: scheme))
                    }
                }
                .scrollContentBackground(.hidden)
                .background(Brand.background(for: scheme))
                .foregroundStyle(Brand.text(for: scheme))
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close", systemImage: "xmark") { shown = false }.labelStyle(.iconOnly)
                    }
                }
                .modifier(SearchOptions(enabled: options.count > 8, search: $search))
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private func artwork(_ option: Option, size: CGFloat) -> some View {
        if let primary = option.playerColors.first {
            ResearchArtwork(urls: option.url.map { [$0] } ?? [], fallback: option.icon)
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(LinearGradient(colors: [primary, option.playerColors.dropFirst().first ?? primary],
                    startPoint: .topLeading, endPoint: .bottomTrailing), in: .rect(cornerRadius: 7))
                .overlay(alignment: .bottomTrailing) {
                    if let logo = option.playerTeamLogo {
                        ResearchArtwork(urls: [logo], fallback: "shield")
                            .padding(1.5).frame(width: size * 0.46, height: size * 0.46)
                            .background(.background, in: .circle)
                    }
                }
        } else if let secondary = option.secondaryLogo {
            HStack(spacing: -3) {
                ResearchArtwork(urls: option.url.map { [$0] } ?? [], fallback: option.icon)
                ResearchArtwork(urls: [secondary], fallback: option.icon)
            }
            .frame(width: size * 1.55, height: size)
        } else if let asset = option.asset {
            Image(asset).resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
        } else {
            ResearchArtwork(urls: option.url.map { [$0] } ?? [], fallback: option.icon)
                .frame(width: size, height: size)
        }
    }

    private struct PickerSurface: ViewModifier {
        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content.glassEffect(.regular.interactive(), in: .capsule)
            } else {
                content.background(.thinMaterial, in: .capsule)
            }
        }
    }

    private struct SearchOptions: ViewModifier {
        let enabled: Bool
        @Binding var search: String

        func body(content: Content) -> some View {
            if enabled {
                content.searchable(text: $search).scrollDismissesKeyboard(.interactively)
            } else {
                content
            }
        }
    }
}
