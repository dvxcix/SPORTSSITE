import SwiftUI

struct CommunityMembershipNotice: View {
    enum Requirement {
        case signIn, basic

        init?(_ error: (any Error)?) {
            struct Failure: Decodable { let code: String? }
            guard let status = error as? SlipSurgeHTTP.Status else { return nil }
            if status.code == 401 { self = .signIn }
            else if status.code == 403,
                    (try? JSONDecoder().decode(Failure.self, from: status.data))?.code == "MEMBERSHIP_REQUIRED" { self = .basic }
            else { return nil }
        }
    }

    let requirement: Requirement
    let subject: String
    let account: AccountStore
    @AppStorage("appearance") private var appearance = Appearance.system

    var body: some View {
        ContentUnavailableView {
            Label(subject, systemImage: "lock.fill")
        } description: {
            Text(requirement == .signIn ? "Sign in to continue." : "Requires Basic membership or higher.")
        } actions: {
            NavigationLink {
                if requirement == .signIn { AccountSignInView(account: account, appearance: $appearance) }
                else { NativeMembershipOverview(account: account) }
            } label: {
                Text(requirement == .signIn ? "Sign in" : "View memberships")
            }
            .buttonStyle(.borderedProminent)
        }
    }
}
