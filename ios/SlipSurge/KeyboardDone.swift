import SwiftUI

extension View {
    @MainActor
    func keyboardDone(_ hide: @escaping () -> Void = {
        _ = UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }) -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done", action: hide)
                    .accessibilityLabel("Hide keyboard")
            }
        }
    }
}
