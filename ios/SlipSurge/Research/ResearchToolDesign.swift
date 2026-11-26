import SwiftUI

struct ResearchToolRail<Choice: Hashable>: View {
    let title: String
    let choices: [Choice]
    @Binding var selection: Choice
    let label: (Choice) -> String
    let glyph: (Choice) -> String
    var compact = false

    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var textSize
    @Namespace private var transition

    var body: some View {
        Group {
            if compact && !textSize.isAccessibilitySize {
                HStack(spacing: 3) {
                    ForEach(choices, id: \.self) { tool($0, stacked: true) }
                }
                .padding(4)
            } else {
                slidingRail
            }
        }
        .background(slipPalette.surface, in: .rect(cornerRadius: 17))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private var slidingRail: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(choices, id: \.self) { tool($0, stacked: false) }
                }
                .padding(4)
            }
            .scrollIndicators(.hidden)
            .onAppear { proxy.scrollTo(selection, anchor: .center) }
            .onChange(of: selection) { _, value in
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) { proxy.scrollTo(value, anchor: .center) }
            }
        }
    }

    private func tool(_ choice: Choice, stacked: Bool) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) { selection = choice }
        } label: {
            Group {
                if stacked {
                    VStack(spacing: 4) {
                        SlipGlyph.view(glyph(choice), size: 16)
                        Text(label(choice)).lineLimit(1).minimumScaleFactor(0.75)
                    }
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48)
                } else {
                    Label {
                        Text(label(choice))
                    } icon: {
                        SlipGlyph.view(glyph(choice), size: 18)
                    }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 13)
                        .frame(minHeight: 44)
                }
            }
            .foregroundStyle(selection == choice ? slipPalette.accent : slipPalette.text)
            .background {
                if selection == choice {
                    RoundedRectangle(cornerRadius: 13)
                        .fill(slipPalette == .color ? AnyShapeStyle(slipPalette.selectionGradient) : AnyShapeStyle(slipPalette.accent.opacity(0.15)))
                        .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(slipPalette.accent.opacity(0.35)) }
                        .matchedGeometryEffect(id: "selection", in: transition, isSource: true)
                }
            }
            .contentShape(.rect(cornerRadius: 13))
        }
        .buttonStyle(SlipSurgePressStyle())
        .id(choice)
        .accessibilityLabel(label(choice))
        .accessibilityAddTraits(selection == choice ? .isSelected : [])
    }
}

struct ResearchToolCard<Header: View, Content: View>: View {
    let color: Color
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(13)
        .background {
            LinearGradient(colors: [color.opacity(scheme == .dark ? 0.23 : 0.12), slipPalette.surface, slipPalette.surface],
                startPoint: .topLeading, endPoint: .bottomTrailing)
                .background(slipPalette.surface)
        }
        .clipShape(.rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(color.opacity(scheme == .dark ? 0.31 : 0.22)) }
    }
}

struct ResearchToolValues: View {
    struct Value: Identifiable {
        let label: String
        let text: String
        var tone: Color?
        var id: String { label }
    }

    let items: [Value]
    var preferredColumns = 3
    @Environment(\.slipPalette) private var slipPalette
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7),
            count: size.isAccessibilitySize ? 1 : min(items.count, preferredColumns)),
            alignment: .leading, spacing: 7) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label).font(.caption2.weight(.medium)).foregroundStyle(.secondary)
                    Text(item.text).font(.subheadline.weight(.bold)).monospacedDigit()
                        .foregroundStyle(item.tone ?? slipPalette.text)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(7)
                .background(slipPalette.background.opacity(0.72), in: .rect(cornerRadius: 9))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

enum ResearchFormat {
    static func price(_ amount: Int?) -> String { amount.map { $0 > 0 ? "+\($0)" : String($0) } ?? "—" }
    static func signed(_ amount: Int?) -> String { price(amount) }
    static func decimal(_ amount: Double?, suffix: String = "") -> String {
        amount.map { $0.formatted(.number.precision(.fractionLength(0...1))) + suffix } ?? "—"
    }
    static func signedDecimal(_ amount: Double?, suffix: String = "") -> String {
        amount.map { ($0 > 0 ? "+" : "") + decimal($0, suffix: suffix) } ?? "—"
    }
    static func points(_ amount: Double?) -> String { signedDecimal(amount, suffix: " pp") }
}

struct ResearchToolFilter<Options: View>: View {
    let title: String
    let symbol: String
    let selection: String
    @ViewBuilder var options: Options

    var body: some View {
        Menu {
            options
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.caption.weight(.semibold)).accessibilityHidden(true)
                Text(selection).font(.subheadline.weight(.semibold))
                Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
        }
        .accessibilityLabel(title)
        .accessibilityValue(selection)
    }
}

struct ResearchToolPortrait: View {
    let name: String
    let subtitle: String
    let portraits: [URL]
    let teamLogo: URL?
    let primary: Color
    let secondary: Color

    var body: some View {
        HStack(spacing: 10) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 11)
                    .fill(LinearGradient(colors: [primary.opacity(0.87), secondary.opacity(0.72)],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                ResearchArtwork(urls: teamLogo.map { [$0] } ?? [], fallback: "shield")
                    .frame(width: 36, height: 36).opacity(0.35).offset(x: 9, y: -13)
                ResearchArtwork(urls: portraits, fallback: "person.crop.circle.fill", pointSize: 68, playerPortrait: true)
                    .frame(width: 48, height: 44)
            }
            .frame(width: 56, height: 48)
            .clipShape(.rect(cornerRadius: 11))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.headline)
                Text(subtitle).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ResearchToolBook: View {
    let book: String
    let price: Int?
    var showPrice = true

    var body: some View {
        HStack(spacing: 5) {
            if let asset = Sportsbook.artwork(Sportsbook.normalized(book)) {
                Image(asset).resizable().scaledToFit().frame(width: 17, height: 17).accessibilityHidden(true)
            }
            Text(Sportsbook.name(book)).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            if showPrice { Text(ResearchFormat.price(price)).font(.caption.weight(.bold)).monospacedDigit() }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ResearchToolMessage: View {
    let title: String
    let error: (any Error)?
    var loadingLabel = "Loading"
    var retry: (() -> Void)?

    var body: some View {
        if let error {
            if let status = error as? SlipSurgeHTTP.Status, status.code == 401 {
                ContentUnavailableView("Sign in required", systemImage: "lock",
                    description: Text("Sign in to SlipSurge and try again."))
            } else if let status = error as? SlipSurgeHTTP.Status, status.code == 403 {
                ContentUnavailableView("Access required", systemImage: "lock",
                    description: Text("This feature isn’t available to your account."))
            } else {
                ContentUnavailableView {
                    Label(title, systemImage: "exclamationmark.circle")
                } actions: {
                    if let retry { Button("Retry", action: retry) }
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
                .accessibilityLabel(loadingLabel)
        }
    }
}
