import SwiftUI

struct CommunityEventsView: View {
    let api: CommunityEventsAPI
    var opensComposer = false
    @Environment(\.colorScheme) private var scheme
    @State private var calendar: CommunityEventsAPI.Calendar?
    @State private var failure: (any Error)?
    @State private var creating = false
    @State private var eventRoute: UUID?
    @State private var revision = 0
    @State private var didOpenComposer = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                if let calendar {
                    ResearchSectionTitle(title: "Upcoming")
                    if calendar.upcoming.isEmpty {
                        ContentUnavailableView("Nothing scheduled yet", systemImage: "calendar")
                    }
                    events(calendar.upcoming)
                    if !calendar.past.isEmpty {
                        ResearchSectionTitle(title: "Recent")
                        events(calendar.past)
                    }
                } else if let requirement = CommunityMembershipNotice.Requirement(failure) {
                    CommunityMembershipNotice(requirement: requirement, subject: "Events", account: api.viewer.account)
                } else if (failure as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Events are currently unavailable", systemImage: "calendar")
                } else {
                    ResearchToolMessage(title: "Events couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Events")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $eventRoute) { id in
            CommunityEventDetail(api: api, id: id) { revision += 1 }
        }
        .toolbar {
            if let calendar, api.viewer.userID != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create event", systemImage: "calendar.badge.plus") { creating = true }
                        .labelStyle(.iconOnly)
                        .sheet(isPresented: $creating) {
                            NavigationStack {
                                CommunityEventCreate(api: api, sports: calendar.sports) { new in
                                    revision += 1
                                    eventRoute = new
                                }
                            }
                        }
                }
            }
        }
        .task(id: revision) { await load() }
        .refreshable { await load() }
    }

    private func events(_ values: [CommunityEventsAPI.Event]) -> some View {
        ForEach(values) { event in
            NavigationLink {
                CommunityEventDetail(api: api, id: event.id) { revision += 1 }
            } label: {
                CommunityEventRow(event: event)
            }
            .buttonStyle(SlipSurgePressStyle())
        }
    }

    private func load() async {
        do {
            let value = try await api.calendar()
            try Task.checkCancellation()
            calendar = value
            failure = nil
            if opensComposer, !didOpenComposer, api.viewer.userID != nil {
                didOpenComposer = true
                creating = true
            }
        } catch { if !Task.isCancelled { failure = error } }
    }
}

struct CommunityEventRow: View {
    let event: CommunityEventsAPI.Event
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ResearchToolCard(color: Brand.accent(for: scheme)) {
            HStack(alignment: .top, spacing: 11) {
                if let date = event.start {
                    VStack(spacing: 3) {
                        Text(date.formatted(.dateTime.month(.abbreviated))).font(.caption.weight(.semibold))
                        Text(date.formatted(.dateTime.day())).font(.title3.weight(.heavy)).monospacedDigit()
                    }
                    .frame(minWidth: 51, minHeight: 53)
                    .background(Brand.accent(for: scheme).opacity(0.12), in: .rect(cornerRadius: 10))
                    .accessibilityLabel(date.formatted(date: .abbreviated, time: .omitted))
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top, spacing: 5) {
                        if let sport = event.sport, let logo = LeagueArtwork.logo(sport) {
                            ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 18, height: 18)
                        }
                        Text(event.title).font(.headline).foregroundStyle(.primary)
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { metadata }
                        VStack(alignment: .leading, spacing: 4) { metadata }
                    }
                    if let host = event.host {
                        HStack(spacing: 5) {
                            ResearchArtwork(urls: [host.avatarUrl].compactMap { $0 }, fallback: "person.crop.circle")
                                .frame(width: 19, height: 19).clipShape(.circle)
                            Text("@\(host.username)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        } content: {}
    }

    @ViewBuilder
    private var metadata: some View {
        if let date = event.start {
            Label(date.formatted(date: .omitted, time: .shortened), systemImage: "clock").font(.caption).foregroundStyle(.secondary)
        }
        if event.isOnline {
            Label("Online", systemImage: "dot.radiowaves.left.and.right").font(.caption).foregroundStyle(.secondary)
        } else if let location = event.location {
            Label(location, systemImage: "mappin").font(.caption).foregroundStyle(.secondary)
        }
        Label((event.goingCount ?? 0).formatted(), systemImage: "person.2").font(.caption).foregroundStyle(.secondary)
    }
}

struct CommunityEventDetail: View {
    let api: CommunityEventsAPI
    let id: UUID
    let refreshList: () -> Void
    @Environment(\.colorScheme) private var scheme
    @AppStorage("appearance") private var appearance = Appearance.system
    @State private var result: CommunityEventsAPI.Detail?
    @State private var failure: (any Error)?
    @State private var actionFailure = false
    @State private var saving = false
    @State private var signIn = false
    @State private var revision = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                if let result {
                    content(result)
                } else if let requirement = CommunityMembershipNotice.Requirement(failure) {
                    CommunityMembershipNotice(requirement: requirement, subject: "Event", account: api.viewer.account)
                } else if (failure as? SlipSurgeHTTP.Status)?.code == 403 {
                    ContentUnavailableView("Events are currently unavailable", systemImage: "calendar")
                } else if (failure as? SlipSurgeHTTP.Status)?.code == 404 {
                    ContentUnavailableView("Event unavailable", systemImage: "calendar.badge.exclamationmark")
                } else {
                    ResearchToolMessage(title: "Event couldn’t load", error: failure) { revision += 1 }
                }
            }
            .padding(16)
        }
        .background(Brand.background(for: scheme))
        .navigationTitle("Event")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $signIn) {
            NavigationStack {
                AccountSignInView(account: api.viewer.account, appearance: $appearance)
                    .navigationTitle("Sign in to RSVP")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { signIn = false } } }
            }
        }
        .alert("RSVP couldn’t be confirmed", isPresented: $actionFailure) {
            Button("Reload") { revision += 1 }
            Button("Close", role: .cancel) {}
        }
        .toolbar {
            if result != nil, let url = URL(string: "https://\(SlipSurgeHTTP.site)/events/\(id.uuidString.lowercased())") {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url).accessibilityLabel("Share event")
                }
            }
        }
    }

    private func content(_ result: CommunityEventsAPI.Detail) -> some View {
        let event = result.event
        return VStack(alignment: .leading, spacing: 13) {
            if let cover = event.coverImage, FeedPostCard.allowedMedia(cover) {
                ResearchArtwork(urls: [cover], fallback: "photo")
                    .frame(maxWidth: .infinity).frame(height: 165)
                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 15))
                    .clipShape(.rect(cornerRadius: 15))
            }
            ResearchToolCard(color: Brand.accent(for: scheme)) {
                if let sport = event.sport, let logo = LeagueArtwork.logo(sport) {
                    ResearchArtwork(urls: [logo], fallback: "sportscourt").frame(width: 25, height: 25)
                }
                Text(event.title).font(.title2.weight(.heavy)).accessibilityAddTraits(.isHeader)
                if let host = event.host {
                    NavigationLink {
                        MemberProfileView(api: api.viewer, target: host.username)
                    } label: {
                        DugoutOpponentArtwork(name: host.displayName ?? host.username, subtitle: "Hosted by @\(host.username)",
                            headshot: host.avatarUrl)
                    }
                    .buttonStyle(SlipSurgePressStyle())
                }
            } content: {
                if let start = event.start {
                    Label(start.formatted(.dateTime.weekday(.wide).month(.wide).day()), systemImage: "calendar")
                        .font(.subheadline)
                    let time = start.formatted(date: .omitted, time: .shortened)
                    let finish = event.end.map { " – " + $0.formatted(date: .omitted, time: .shortened) } ?? ""
                    Label(time + finish, systemImage: "clock").font(.subheadline)
                }
                if let location = event.location { Label(location, systemImage: "mappin").font(.subheadline) }
                if event.isOnline { Label("Online", systemImage: "dot.radiowaves.left.and.right").font(.subheadline) }
                ResearchToolValues(items: [
                    .init(label: "Going", text: (event.goingCount ?? 0).formatted()),
                    .init(label: "Interested", text: (event.interestedCount ?? 0).formatted()),
                ])
            }
            if api.viewer.userID == nil {
                Button("Sign in to RSVP", systemImage: "person.crop.circle") { signIn = true }.buttonStyle(.borderedProminent)
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack { attendance(result) }
                    VStack(alignment: .leading) { attendance(result) }
                }
                .sensoryFeedback(.selection, trigger: result.rsvp)
            }
            if let description = event.description {
                Text(SiteAnnouncements.linkedText(description)).font(.body)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Brand.surface(for: scheme), in: .rect(cornerRadius: 12))
            }
            if let url = event.url {
                Link(destination: url) { Label("Open event link", systemImage: "arrow.up.right") }.buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder
    private func attendance(_ result: CommunityEventsAPI.Detail) -> some View {
        ForEach(CommunityEventsAPI.Attendance.allCases) { response in
            let selected = result.rsvp == response
            Button {
                Task { await change(selected ? nil : response) }
            } label: {
                Label(response.label, systemImage: response.symbol).font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(9)
                    .frame(minHeight: 44)
            }
            .buttonStyle(SlipSurgePressStyle())
            .disabled(saving)
            .foregroundStyle(selected ? Brand.accent(for: scheme) : Brand.text(for: scheme))
            .background(Brand.accent(for: scheme).opacity(selected ? 0.16 : 0.05), in: .capsule)
            .accessibilityAddTraits(selected ? .isSelected : [])
        }
    }

    private func load() async {
        do {
            let value = try await api.event(id)
            try Task.checkCancellation()
            guard value.event.id == id else { throw URLError(.badServerResponse) }
            result = value
            failure = nil
        } catch { if !Task.isCancelled { failure = error } }
    }

    private func change(_ response: CommunityEventsAPI.Attendance?) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            result = try await api.attend(id, status: response)
            refreshList()
        } catch { actionFailure = true }
    }
}
