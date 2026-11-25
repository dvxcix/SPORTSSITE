import SwiftUI

extension EnvironmentValues {
    @Entry var socialTab: SlipSurgeTabs.Destination? = nil
}

@MainActor @Observable
final class SocialDetailVisibility {
    private var visible: [SlipSurgeTabs.Destination: UUID] = [:]

    func showsDetail(in tab: SlipSurgeTabs.Destination) -> Bool {
        visible[tab] != nil
    }

    func set(_ id: UUID, visible isVisible: Bool, tab: SlipSurgeTabs.Destination) {
        if isVisible { visible[tab] = id }
        else if visible[tab] == id { visible[tab] = nil }
    }
}

extension View {
    func socialDetail(_ enabled: Bool = true) -> some View {
        modifier(SocialDetailChrome(enabled: enabled))
    }
}

private struct SocialDetailChrome: ViewModifier {
    let enabled: Bool
    @Environment(\.socialTab) private var tab
    @Environment(SocialDetailVisibility.self) private var visibility: SocialDetailVisibility?
    @State private var identity = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { updateVisibility(true) }
            .onDisappear { updateVisibility(false) }
    }

    private func updateVisibility(_ isVisible: Bool) {
        if enabled, let tab { visibility?.set(identity, visible: isVisible, tab: tab) }
    }
}
