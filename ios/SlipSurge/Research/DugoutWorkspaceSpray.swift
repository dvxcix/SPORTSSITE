import SwiftUI

struct DugoutWorkspaceSpray: View {
    typealias Row = DugoutPlayerPitchLog.Row
    struct Contact: Identifiable {
        let id: Int
        let row: Row
        let point: CGPoint

        var outcome: String { (row.events ?? "Ball in play").replacingOccurrences(of: "_", with: " ").capitalized }
        var color: Color {
            if row.isHomeRun == true { return Color(red: 0.98, green: 0.23, blue: 0.40) }
            return switch row.events {
            case "triple": .orange
            case "double": .blue
            case "single": .mint
            default: .gray
            }
        }
    }

    let name: String
    let matchup: DugoutSlateBreakdownData.Matchup
    let rows: [Row]
    @State private var selection: Int?

    var body: some View {
        let contacts = rows.enumerated().compactMap { index, row -> Contact? in
            guard row.isInPlay == true, let x = row.hcX, let y = row.hcY, x.isFinite, y.isFinite else { return nil }
            return .init(id: index, row: row, point: CGPoint(x: x, y: y))
        }
        let selected = contacts.first { $0.id == selection } ?? contacts.first { $0.row.isHomeRun == true } ?? contacts.first
        VStack(alignment: .leading, spacing: 9) {
            ResearchSectionTitle(title: matchup.game.venue ?? "\(matchup.game.home.code) Ballpark")
            if contacts.isEmpty {
                Text("No saved contact coordinates match these pitch and sample filters.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                field(contacts, selected: selected)
                ResearchToolValues(items: [
                    .init(label: "Contacts", text: contacts.count.formatted()),
                    .init(label: "Home runs", text: contacts.filter { $0.row.isHomeRun == true }.count.formatted()),
                    .init(label: "Hard hit", text: contacts.filter { ($0.row.launchSpeed ?? 0) >= 95 }.count.formatted()),
                ])
                Picker("Inspect contact", selection: Binding(get: { selected?.id ?? -1 }, set: { selection = $0 })) {
                    ForEach(contacts) { contact in
                        Text("\(contact.outcome) · \(contact.row.gameDate)").tag(contact.id)
                    }
                }
                if let selected { details(selected) }
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func field(_ contacts: [Contact], selected: Contact?) -> some View {
        let park = matchup.parkShape
        let bounds = park?.bounds ?? CGRect(x: 0, y: 0, width: 250, height: 250)
        return GeometryReader { proxy in
            let transform = DugoutParkField.transform(bounds: bounds, in: proxy.size)
            ZStack {
                DugoutParkField(shape: park, team: matchup.game.home)
                Canvas { context, _ in
                    for contact in contacts {
                        let point = contact.point.applying(transform)
                        let active = contact.id == selected?.id
                        let size: CGFloat = active ? 11 : 6
                        let dot = Path(ellipseIn: CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size))
                        context.fill(dot, with: .color(contact.color))
                        if active { context.stroke(dot, with: .color(.white), lineWidth: 1.5) }
                    }
                }
            }
            .contentShape(.rect)
            .gesture(SpatialTapGesture().onEnded { touch in
                let target = touch.location.applying(transform.inverted())
                let nearest = contacts.min { distance($0.point, target) < distance($1.point, target) }
                if let nearest, distance(nearest.point.applying(transform), touch.location) < 28 { selection = nearest.id }
            })
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxHeight: 270)
        .accessibilityLabel("\(name) spray chart, \(contacts.count) contacts")
        .accessibilityHint("Choose Inspect contact to read an individual point")
    }

    private func details(_ contact: Contact) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Circle().fill(contact.color).frame(width: 8, height: 8).accessibilityHidden(true)
                Text(contact.outcome).font(.caption.weight(.semibold))
                Spacer()
                if let pitch = contact.row.pitchType { DugoutProfilePitchBadge(pitch: matchup.pitch(pitch)) }
            }
            ResearchToolValues(items: [
                .init(label: "Exit velocity", text: ResearchFormat.decimal(contact.row.launchSpeed, suffix: " mph")),
                .init(label: "Launch angle", text: ResearchFormat.decimal(contact.row.launchAngle, suffix: "°")),
                .init(label: "Distance", text: ResearchFormat.decimal(contact.row.hitDistance, suffix: " ft")),
            ])
        }
    }

    private func distance(_ lhs: CGPoint, _ rhs: CGPoint) -> CGFloat {
        hypot(lhs.x - rhs.x, lhs.y - rhs.y)
    }
}
