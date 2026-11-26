import SwiftUI

struct InboxNotificationOpen: Equatable {
    private let delivery = UUID()
    let notificationID: UUID
}

struct ActivityDestinationView: View {
    let api: ActivityAPI
    let destination: ActivityNotification.Destination

    var body: some View {
        switch destination {
        case .post(let id):
            FeedThreadView(api: .init(account: api.account, userID: api.userID), id: id)
        case .conversation(let room):
            MessageThreadView(api: .init(account: api.account, userID: api.userID), destination: room)
        case .discovery:
            DiscoverView(api: .init(account: api.account, userID: api.userID))
        case .community(let id):
            DiscoverView(api: .init(account: api.account, userID: api.userID), opensCommunity: id)
        case .profile(let id):
            MemberProfileView(api: .init(account: api.account, userID: api.userID), target: id.uuidString.lowercased())
        case .research(let link):
            LinkedResearchView(account: api.account, link: link)
        case .game(let link):
            LinkedScoreView(viewer: .init(account: api.account, userID: api.userID), link: link)
        }
    }
}
