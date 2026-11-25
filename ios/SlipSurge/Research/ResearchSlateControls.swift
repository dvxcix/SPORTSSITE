import SwiftUI

struct ResearchSlateControls: View {
    @Binding var date: Date
    @State private var calendarOpen = false
    @Environment(\.colorScheme) private var scheme

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
        .tint(Brand.accent(for: scheme))
        .sheet(isPresented: $calendarOpen) {
            NavigationStack {
                DatePicker("Slate date", selection: $date, displayedComponents: .date)
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
        Button {
            calendarOpen = true
        } label: {
            Label(SlateDate.label(date, year: true), systemImage: "calendar")
                .font(.subheadline.weight(.semibold))
                .frame(minHeight: 32)
        }
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
    }
}

struct ResearchMatchup: View {
    struct Team {
        let name: String
        let logo: URL?
        let color: Color
    }

    let away: Team
    let home: Team
    let subtitle: String?
    var selected = false
    var fullWidth = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 7) {
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
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(minWidth: 132, maxWidth: fullWidth ? .infinity : nil)
        .background {
            LinearGradient(
                colors: [away.color.opacity(0.19), home.color.opacity(0.13)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .background(Brand.surface(for: scheme))
        }
        .clipShape(.rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(selected ? Brand.accent(for: scheme) : .secondary.opacity(0.22), lineWidth: selected ? 1.5 : 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func team(_ team: Team) -> some View {
        VStack(spacing: 5) {
            ResearchArtwork(urls: team.logo.map { [$0] } ?? [], fallback: "shield")
                .frame(width: 29, height: 29)
            Text(team.name).font(.caption.weight(.semibold))
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
