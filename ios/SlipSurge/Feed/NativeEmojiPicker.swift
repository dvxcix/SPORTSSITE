import SwiftUI

struct NativeEmojiButton: View {
    var compact = false
    var title = "Add emoji"
    let select: (String) -> Void
    @State private var open = false

    var body: some View {
        Button {
            open = true
        } label: {
            Group {
                if compact { Image(systemName: "face.smiling") }
                else { Label(title, systemImage: "face.smiling") }
            }
            .frame(minWidth: compact ? 34 : nil, minHeight: 44)
        }
        .accessibilityLabel("Add emoji")
        .sheet(isPresented: $open) {
            NavigationStack { NativeEmojiPicker(select: select) }
                .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
    }
}

struct NativeEmojiPicker: View {
    var title = "Emoji"
    let select: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.nativeEmojiLibrary) private var library
    @State private var query = ""
    private let fallback = ["❤️", "🔥", "⚡", "👀", "👏", "😂", "💯", "🏆", "👍", "👎", "🙌", "🤝"]
    private var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines.union(.init(charactersIn: ":"))).lowercased() }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                if let library, !library.standard.isEmpty || !library.custom.isEmpty {
                    let groups = Dictionary(grouping: library.custom, by: { $0.category?.name ?? "Other" })
                    ForEach(groups.keys.sorted { left, right in
                        if left == "Other" || right == "Other" { return right == "Other" }
                        return left.localizedStandardCompare(right) == .orderedAscending
                    }, id: \.self) { group in
                        let entries = (groups[group] ?? []).filter { matches($0.code, category: group) }
                        if !entries.isEmpty {
                            Text(group).font(.headline).accessibilityAddTraits(.isHeader)
                            LazyVGrid(columns: columns) {
                                ForEach(entries) { entry in
                                    tile(":\(entry.code):", label: entry.code) {
                                        NativeReactionArtwork(symbol: ":\(entry.code):", size: 26)
                                    }
                                }
                            }
                        }
                    }
                    ForEach(library.standard) { group in
                        let entries = group.emoji.filter { matches($0.code, category: group.label) || $0.char.contains(term) }
                        if !entries.isEmpty {
                            Text(group.label).font(.headline).accessibilityAddTraits(.isHeader)
                            LazyVGrid(columns: columns) {
                                ForEach(entries) { entry in tile(entry.char, label: entry.code) { Text(entry.char).font(.title2) } }
                            }
                        }
                    }
                } else {
                    LazyVGrid(columns: columns) {
                        ForEach(fallback.filter { term.isEmpty || $0.contains(term) }, id: \.self) { symbol in
                            tile(symbol, label: symbol) { Text(symbol).font(.title2) }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(slipPalette.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search emoji")
        .scrollDismissesKeyboard(.interactively)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        .task { await library?.refresh() }
    }

    private var columns: [GridItem] { [.init(.adaptive(minimum: 44), spacing: 6)] }

    private func matches(_ code: String, category: String) -> Bool {
        term.isEmpty || code.contains(term) || category.localizedCaseInsensitiveContains(term)
    }

    private func tile<Artwork: View>(_ value: String, label: String, @ViewBuilder artwork: () -> Artwork) -> some View {
        Button {
            select(value)
            dismiss()
        } label: {
            artwork().frame(maxWidth: .infinity, minHeight: 44)
                .background(slipPalette.surface, in: .rect(cornerRadius: 9))
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(label.replacingOccurrences(of: "_", with: " "))
    }
}

struct NativeReactionArtwork: View {
    let symbol: String
    var size: CGFloat = 18
    @Environment(\.nativeEmojiLibrary) private var library
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var visible = false

    var body: some View {
        if let code = NativeEmojiLibrary.shortcode(in: symbol) {
            Group {
                if visible, !reduceMotion, phase == .active, library?.hasMotion(code) == true {
                    TimelineView(.animation(minimumInterval: 1.0 / 15.0)) { time in
                        icon(for: code, at: time.date)
                    }
                } else {
                    icon(for: code, at: nil)
                }
            }
            .frame(width: size, height: size)
            .accessibilityLabel(code.replacingOccurrences(of: "_", with: " "))
            .task(id: "\(code):\(library?.revision ?? 0)") { await library?.loadIcons([code]) }
            .onAppear { visible = true }
            .onDisappear { visible = false }
        } else {
            Text(symbol)
        }
    }

    @ViewBuilder private func icon(for code: String, at date: Date?) -> some View {
        if let image = library?.image(for: code, at: date) {
            Image(decorative: image, scale: 1).resizable().scaledToFit()
        } else if let glyph = library?.unicode(for: code) {
            Text(glyph)
        } else {
            Image(systemName: "face.smiling").resizable().scaledToFit().opacity(0.55)
        }
    }
}
