import SwiftUI

struct NativeEmojiButton: View {
    var compact = false
    let select: (String) -> Void
    @State private var open = false

    var body: some View {
        Button {
            open = true
        } label: {
            Group {
                if compact { Image(systemName: "face.smiling") }
                else { Label("Add emoji", systemImage: "face.smiling") }
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
    @Environment(\.colorScheme) private var scheme
    @Environment(\.nativeEmojiLibrary) private var library
    @State private var query = ""
    private let fallback = ["❤️", "🔥", "⚡", "👀", "👏", "😂", "💯", "🏆", "👍", "👎", "🙌", "🤝"]
    private var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 13) {
                if let library, !library.standard.isEmpty {
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
                                        ResearchArtwork(urls: [entry.imageUrl], fallback: "face.smiling").frame(width: 26, height: 26)
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
        .background(Brand.background(for: scheme))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search emoji")
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
                .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 9))
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityLabel(label.replacingOccurrences(of: "_", with: " "))
    }
}

struct NativeReactionArtwork: View {
    let symbol: String
    var size: CGFloat = 18
    @Environment(\.nativeEmojiLibrary) private var library

    var body: some View {
        let code = symbol.trimmingCharacters(in: CharacterSet(charactersIn: ":"))
        if symbol.hasPrefix(":"), symbol.hasSuffix(":"), let asset = library?.entry(for: code) {
            ResearchArtwork(urls: [asset.imageUrl], fallback: "face.smiling").frame(width: size, height: size)
        } else { Text(symbol) }
    }
}
