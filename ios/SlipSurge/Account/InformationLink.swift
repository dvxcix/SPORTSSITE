import SwiftUI

enum InformationPage: String, Identifiable {
    case about, faq, privacy, support, terms
    case responsibleGambling = "responsible-gambling"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .about: "info.circle"
        case .faq: "questionmark.circle"
        case .privacy: "lock.shield"
        case .responsibleGambling: "heart.text.square"
        case .support: "lifepreserver"
        case .terms: "doc.text"
        }
    }

    var title: String {
        switch self {
        case .about: "About SlipSurge"
        case .faq: "FAQ"
        case .privacy: "Privacy policy"
        case .responsibleGambling: "Responsible gambling"
        case .support: "Support"
        case .terms: "Terms of Service"
        }
    }
}

struct InformationLink: View {
    let page: InformationPage
    let account: AccountStore
    var label: String?

    @State private var presented = false

    var body: some View {
        Button { presented = true } label: {
            if let label {
                Text(label)
            } else {
                Label(page.title, systemImage: page.symbol)
            }
        }
            .sheet(isPresented: $presented) { InformationNavigation(page: page, account: account) }
    }
}

struct InformationNavigation: View {
    private enum Destination: Hashable { case page(InformationPage), pricing, membership, account, connections, nbaPreview, nflPreview }

    let page: InformationPage
    let account: AccountStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @AppStorage("appearance") private var appearance = Appearance.system
    @State private var history: [Destination] = []

    var body: some View {
        NavigationStack(path: $history) {
            InformationDocumentView(page: page)
                .navigationDestination(for: Destination.self) { destination in
                    switch destination {
                    case .page(let document): InformationDocumentView(page: document)
                    case .pricing: NativeMembershipOverview(account: account)
                    case .nbaPreview: CourtView(scope: .preview)
                    case .nflPreview: SidelineView(api: SidelineAPI())
                    case .connections:
                        if let userID = account.memberID {
                            AccountConnectionsView(api: .init(account: account, userID: userID))
                        } else { AccountSignInView(account: account, appearance: $appearance) }
                    case .membership:
                        if let userID = account.memberID {
                            MembershipBillingView(account: account, userID: userID, refreshAccount: {})
                        } else { AccountSignInView(account: account, appearance: $appearance) }
                    case .account:
                        if let userID = account.memberID { MemberAccountView(account: account, userID: userID) }
                        else { AccountSignInView(account: account, appearance: $appearance) }
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done", role: .cancel) { dismiss() } }
                }
        }
        .environment(\.openURL, OpenURLAction { url in
            switch NativeSiteLink(url) {
            case .information(let document): history.append(.page(document))
            case .pricing: history.append(.pricing)
            case .preview(.nba): history.append(.nbaPreview)
            case .preview(.nfl): history.append(.nflPreview)
            case .settings(.connections): history.append(.connections)
            case .settings(.membership): history.append(.membership)
            case .account, .settings(.account): history.append(.account)
            default: openURL(url)
            }
            return .handled
        })
    }
}

private struct InformationDocumentView: View {
    private struct Document: Decodable {
        struct Section: Decodable, Identifiable {
            let id: String
            let title: String?
            let blocks: [Block]
        }

        struct Block: Decodable {
            struct Span: Decodable { let text: String; let bold: Bool?; let italic: Bool?; let href: URL? }
            enum Style: String, Decodable { case paragraph, bullet, callout }
            let style: Style
            let spans: [Span]

            var content: AttributedString {
                spans.reduce(into: AttributedString()) { result, source in
                    var converted = AttributedString(source.text)
                    if source.bold == true { converted.inlinePresentationIntent = .stronglyEmphasized }
                    if source.italic == true { converted.inlinePresentationIntent = .emphasized }
                    if let href = source.href { converted.link = href }
                    result.append(converted)
                }
            }
        }

        let title: String
        let subtitle: String?
        let sections: [Section]
    }

    let page: InformationPage
    @Environment(\.colorScheme) private var scheme
    @State private var document: Document?
    @State private var issue: (any Error)?
    @State private var revision = 0

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 19) {
                    if let document {
                        if let subtitle = document.subtitle { Text(verbatim: subtitle).font(.footnote).foregroundStyle(.secondary) }
                        if document.sections.count > 4 {
                            Menu("On this page", systemImage: "list.bullet") {
                                ForEach(document.sections) { section in
                                    if let title = section.title { Button(title, systemImage: "text.alignleft") { proxy.scrollTo(section.id, anchor: .top) } }
                                }
                            }.buttonStyle(.bordered)
                        }
                        ForEach(document.sections) { part in section(part).id(part.id) }
                    } else {
                        ResearchToolMessage(title: "Page couldn’t load", error: issue) { revision += 1 }
                    }
                }.padding(18).frame(maxWidth: 660, alignment: .leading).frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(document?.title ?? page.title)
        .navigationBarTitleDisplayMode(.inline)
        .background(Brand.background(for: scheme))
        .foregroundStyle(Brand.text(for: scheme))
        .task(id: revision) {
            do {
                let value: Document = try await SlipSurgeHTTP.get("/api/mobile/information", query: [.init(name: "page", value: page.rawValue)])
                document = value
                issue = nil
            } catch { if !Task.isCancelled { issue = error } }
        }
    }

    private func section(_ section: Document.Section) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title = section.title {
                Text(verbatim: title).font(.headline).accessibilityAddTraits(.isHeader)
            }
            ForEach(Array(section.blocks.enumerated()), id: \.offset) { _, block in
                switch block.style {
                case .paragraph: Text(block.content)
                case .bullet:
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").accessibilityHidden(true)
                        Text(block.content)
                    }
                case .callout:
                    Text(block.content).padding(13).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
                }
            }
        }.lineSpacing(4)
    }
}
