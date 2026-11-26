import SwiftUI

struct AdminDesignSystemView: View {
    private struct Swatch: Identifiable {
        let name: String
        let color: Color
        var id: String { name }
    }

    private let books = ["fanduel", "draftkings", "caesars", "fanatics", "betmgm", "betrivers"]
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var alerts = true
    @State private var preview = false
    @State private var feedback: String?

    private var accent: Color { slipPalette.accent }
    private var success: Color { Color(rgb: scheme == .dark ? 0x4ADE80 : 0x176339) }
    private var warning: Color { Color(rgb: scheme == .dark ? 0xFACC61 : 0x805600) }
    private var danger: Color { Color(rgb: scheme == .dark ? 0xFB8185 : 0xA52231) }
    private var info: Color { Color(rgb: scheme == .dark ? 0x7AC9FF : 0x145B97) }
    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 220 : 130), spacing: 8, alignment: .topLeading)]
    }

    private var swatches: [Swatch] {
        [.init(name: "Background", color: slipPalette.background), .init(name: "Surface", color: slipPalette.surface),
         .init(name: "Raised", color: slipPalette.text.opacity(0.12)), .init(name: "Accent", color: accent),
         .init(name: "Success", color: success), .init(name: "Warning", color: warning),
         .init(name: "Danger", color: danger), .init(name: "Info", color: info)]
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                foundation
                actions
                controls
                states
            }
            .padding(16)
        }
        .foregroundStyle(slipPalette.text)
        .background(slipPalette.background)
        .navigationTitle("Design system")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $preview) {
            NavigationStack {
                ContentUnavailableView("Sheet preview", systemImage: "rectangle.bottomthird.inset.filled",
                    description: Text("A focused task with its own dismissal and confirmation controls."))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { preview = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { preview = false } }
                    }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var foundation: some View {
        ResearchToolCard(color: accent) {
            sectionTitle("Foundation", image: "swatchpalette")
        } content: {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(swatches) { swatch in
                    HStack(spacing: 9) {
                        RoundedRectangle(cornerRadius: 8).fill(swatch.color)
                            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(.secondary.opacity(0.35)) }
                            .frame(width: 32, height: 32).accessibilityHidden(true)
                        Text(swatch.name).font(.subheadline.weight(.semibold))
                    }
                }
            }
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(books, id: \.self) { book in
                    Label {
                        Text(Sportsbook.name(book)).font(.caption.weight(.semibold))
                    } icon: {
                        ProfileSportsbookLogo(key: book, size: 22).accessibilityHidden(true)
                    }
                    .padding(.horizontal, 8).frame(minHeight: 38)
                    .background(slipPalette.background, in: .capsule)
                }
            }
            .accessibilityElement(children: .contain).accessibilityLabel("Sportsbook logos")
        }
    }

    private var actions: some View {
        ResearchToolCard(color: accent) {
            sectionTitle("Actions", image: "hand.tap")
        } content: {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                Button("New item", systemImage: "plus") { feedback = "New item selected" }
                    .buttonStyle(SlipSurgePrimaryButtonStyle())
                glassControl { preview = true } label: { Label("Preview", systemImage: "eye") }
                Button("Notify", systemImage: "bell") { feedback = "Notify selected" }
                    .buttonStyle(.bordered).controlSize(.large)
                Button("Cancel") { feedback = nil }.buttonStyle(.borderless)
                Button("Delete", systemImage: "trash", role: .destructive) { feedback = "Delete selected" }
                    .buttonStyle(.bordered).controlSize(.large)
                Button("Unavailable") {}.buttonStyle(SlipSurgePrimaryButtonStyle()).disabled(true)
                glassControl { feedback = "Confirmed" } label: {
                    Image(systemName: "checkmark").frame(minWidth: 28, minHeight: 28)
                }.accessibilityLabel("Confirm")
            }
            if let feedback { Text(feedback).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private var controls: some View {
        ResearchToolCard(color: accent) {
            sectionTitle("Status and controls", image: "switch.2")
        } content: {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                status("Default", icon: "circle", color: .secondary)
                status("Live", icon: "circle.fill", color: success)
                status("Final", icon: "checkmark.circle", color: .secondary)
                status("Upcoming", icon: "clock", color: info)
                status("Public picks", icon: "chart.bar", color: accent)
                status("Popular", icon: "flame", color: warning)
                status("Saved", icon: "bookmark", color: accent)
                status("Failed", icon: "exclamationmark.circle", color: danger)
                status("Cached", icon: "tray", color: info)
            }
            Toggle("Notifications preview", isOn: $alerts).tint(accent)
            glassControl { preview = true } label: {
                Label("Open sheet", systemImage: "rectangle.bottomthird.inset.filled")
            }
        }
    }

    private var states: some View {
        ResearchToolCard(color: accent) {
            sectionTitle("System feedback", image: "bell.badge")
        } content: {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView().tint(accent)
                    Text("Loading movement").font(.subheadline.weight(.semibold))
                    Text("Retrieving the latest captured odds.").font(.caption).foregroundStyle(.secondary)
                }.padding(8)
                state("Nothing captured", image: "magnifyingglass", detail: "Try another market or date.")
                VStack(alignment: .leading, spacing: 6) {
                    state("Could not load data", image: "exclamationmark.circle", detail: "The request did not complete.")
                    Button("Try again") { feedback = "Retry selected" }.buttonStyle(.borderless).padding(.horizontal, 8)
                }
                state("You are offline", image: "wifi.slash", detail: "Cached data remains available.")
            }
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill").font(.largeTitle)
                VStack(alignment: .leading) {
                    Text("Loading data").font(.subheadline)
                    Text("Waiting for a response").font(.caption)
                }
                Spacer()
                Text("00:00").monospacedDigit()
            }
            .redacted(reason: .placeholder).foregroundStyle(.secondary)
            .padding(10).accessibilityElement(children: .ignore).accessibilityLabel("Loading placeholder")
        }
    }

    private func sectionTitle(_ title: String, image: String) -> some View {
        Label(title, systemImage: image).font(.headline).accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func glassControl<Title: View>(action: @escaping () -> Void, @ViewBuilder label: () -> Title) -> some View {
        let button = Button(action: action, label: label).controlSize(.large)
        if #available(iOS 26, *) { button.buttonStyle(.glass) }
        else { button.buttonStyle(.bordered) }
    }

    private func status(_ title: String, icon: String, color: Color) -> some View {
        Label(title, systemImage: icon).font(.caption.weight(.semibold)).foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 5).background(color.opacity(0.13), in: .capsule)
    }

    private func state(_ title: String, image: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: image).foregroundStyle(accent).accessibilityHidden(true)
            Text(title).font(.subheadline.weight(.semibold))
            Text(detail).font(.caption).foregroundStyle(.secondary)
        }.padding(8)
    }
}
