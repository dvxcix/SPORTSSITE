import SwiftUI

struct ResearchSlateControls: View {
    @Binding var date: Date
    var latest: Date? = nil
    @State private var calendarOpen = false
    @Environment(\.slipPalette) private var slipPalette

    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = SlateDate.zone
        return value
    }

    var body: some View {
        HStack(spacing: 10) {
            if #available(iOS 26, *) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 10) {
                        arrow(-1).buttonStyle(.glass)
                        calendarButton.buttonStyle(.glass)
                        arrow(1).buttonStyle(.glass)
                    }
                }
            } else {
                arrow(-1).buttonStyle(.bordered)
                calendarButton.buttonStyle(.bordered)
                arrow(1).buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity)
        .tint(slipPalette.accent)
        .sheet(isPresented: $calendarOpen) {
            NavigationStack {
                Group {
                    if let latest { DatePicker("Slate date", selection: $date, in: ...latest, displayedComponents: .date) }
                    else { DatePicker("Slate date", selection: $date, displayedComponents: .date) }
                }
                .datePickerStyle(.graphical)
                    .environment(\.timeZone, SlateDate.zone)
                    .padding()
                    .navigationTitle("Choose a date")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { calendarOpen = false }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var calendarButton: some View {
        let fullDate = SlateDate.label(date, year: true)
        var compactStyle = Date.FormatStyle().month(.abbreviated).day().year()
        compactStyle.timeZone = SlateDate.zone
        return Button {
            calendarOpen = true
        } label: {
            ViewThatFits(in: .horizontal) {
                Label(fullDate, systemImage: "calendar").fixedSize(horizontal: true, vertical: false)
                Text(date.formatted(compactStyle)).fixedSize(horizontal: true, vertical: false)
                Text(date.formatted(compactStyle))
            }
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: 32)
        }
        .accessibilityLabel(fullDate)
        .accessibilityHint("Choose a slate date")
    }

    private func arrow(_ direction: Int) -> some View {
        Button {
            if let day = calendar.date(byAdding: .day, value: direction, to: date) { date = day }
        } label: {
            Image(systemName: direction < 0 ? "chevron.left" : "chevron.right")
                .font(.subheadline.weight(.semibold))
                .frame(minWidth: 30, minHeight: 32)
        }
        .accessibilityLabel(direction < 0 ? "Previous day" : "Next day")
        .disabled(direction > 0 && latest.map { SlateDate.key(date) >= SlateDate.key($0) } == true)
    }
}

struct ResearchMatchup: View {
    struct Team {
        let name: String
        let logo: URL?
        let color: Color
        var secondary: Color?
    }

    let away: Team
    let home: Team
    let subtitle: String?
    var selected = false
    var fullWidth = false
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }

    var body: some View {
        VStack(spacing: fullWidth ? 9 : 6) {
            HStack(spacing: 9) {
                team(away).frame(maxWidth: fullWidth ? .infinity : nil)
                Text("at").font(.caption2).foregroundStyle(.secondary)
                team(home).frame(maxWidth: fullWidth ? .infinity : nil)
            }
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, fullWidth ? 19 : 13)
        .padding(.vertical, fullWidth ? 16 : 11)
        .frame(minWidth: 132, maxWidth: fullWidth ? .infinity : nil)
        .background {
            ZStack {
                slipPalette.surface
                LinearGradient(
                    stops: [
                        .init(color: away.color.opacity(scheme == .dark ? 0.37 : 0.20), location: 0),
                        .init(color: (away.secondary ?? away.color).opacity(0.12), location: 0.37),
                        .init(color: (home.secondary ?? home.color).opacity(0.12), location: 0.63),
                        .init(color: home.color.opacity(scheme == .dark ? 0.42 : 0.21), location: 1)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
        .clipShape(.rect(cornerRadius: fullWidth ? 18 : 13))
        .overlay {
            RoundedRectangle(cornerRadius: fullWidth ? 18 : 13)
                .strokeBorder(selected ? slipPalette.accent : .secondary.opacity(0.22), lineWidth: selected ? 1.5 : 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func team(_ team: Team) -> some View {
        VStack(spacing: 5) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: fullWidth ? 42 : 29, height: fullWidth ? 42 : 29)
            Text(team.name).font(fullWidth ? .subheadline.bold() : .caption.weight(.semibold))
        }
    }
}

struct ResearchSectionTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.title3.weight(.semibold))
            .accessibilityAddTraits(.isHeader)
    }
}
