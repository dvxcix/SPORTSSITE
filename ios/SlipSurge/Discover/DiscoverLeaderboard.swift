import SwiftUI

struct DiscoverLeaderboard: View {
    typealias League = DiscoverAPI.Records

    private struct Place: Identifiable {
        let rank: Int
        let member: League.Person
        let record: League.Record
        var id: UUID { member.id }
        var name: String { member.displayName ?? member.username }
    }

    let api: DiscoverAPI
    let data: League
    let sport: String
    let thisWeek: Bool
    let search: String
    let refresh: () -> Void
    @Environment(\.slipPalette) private var slipPalette
    private var scheme: ColorScheme { slipPalette.colorScheme }
    @Environment(\.dynamicTypeSize) private var typeSize
    @AppStorage("appearance") private var appearance = Appearance.color
    @State private var composing = false
    @State private var signIn = false

    private var overall: Bool { sport.isEmpty && !thisWeek }
    private var showPodium: Bool { overall && search.isEmpty && data.users.count >= 3 && !typeSize.isAccessibilitySize }

    var body: some View {
        let ranked = rankings()
        VStack(alignment: .leading, spacing: 12) {
            if search.isEmpty { overview }
            if showPodium {
                let top = Array(ranked.prefix(3))
                if top.count == 3 {
                    HStack(alignment: .bottom, spacing: 6) {
                        podium(top[1])
                        podium(top[0])
                        podium(top[2])
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Top three")
                }
            }
            if ranked.isEmpty {
                ContentUnavailableView(search.isEmpty ? "No rankings yet" : "No matching members", systemImage: "trophy",
                    description: search.isEmpty && thisWeek ? Text("No picks have been graded this week.") : nil)
            } else {
                LazyVStack(spacing: 7) {
                    ForEach(showPodium ? Array(ranked.dropFirst(3)) : ranked) { place in
                        NavigationLink {
                            MemberProfileView(api: api, target: place.member.username)
                        } label: { row(place) }
                        .buttonStyle(SlipSurgePressStyle())
                    }
                }
            }
        }
        .sheet(isPresented: $composing) {
            if let userID = api.userID {
                FeedComposerView(account: api.account, userID: userID,
                    allowMLB: data.allSports.contains { $0.caseInsensitiveCompare("MLB") == .orderedSame },
                    startWithPick: true, onPost: refresh)
            }
        }
        .sheet(isPresented: $signIn) {
            NavigationStack {
                AccountSignInView(account: api.account, appearance: $appearance)
                    .navigationTitle("Sign in to post")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { signIn = false } } }
            }
        }
    }

    private var overview: some View {
        let eligible = data.users.compactMap { $0.allTime.count >= 5 ? $0.allTime.rate : nil }
        let average = eligible.isEmpty ? nil : eligible.reduce(0, +) / Double(eligible.count)
        let played = data.users.reduce(0) { $0 + $1.allTime.count }
        return VStack(alignment: .leading, spacing: 8) {
            ResearchToolValues(items: [
                .init(label: "Picks graded", text: played.formatted()),
                .init(label: "Average win rate", text: average?.formatted(.percent.precision(.fractionLength(0))) ?? "—"),
                .init(label: "Ranked members", text: data.users.count.formatted()),
            ])
            Button {
                if api.userID == nil { signIn = true } else { composing = true }
            } label: { Label("Drop a Pick", systemImage: "chart.line.uptrend.xyaxis") }
                .buttonStyle(.borderedProminent)
        }
    }

    private func rankings() -> [Place] {
        let eligible = data.users.enumerated().compactMap { index, member -> (Int, League.Person, League.Record)? in
            let record = thisWeek ? member.thisWeek : overall ? member.allTime :
                member.bySport.first { $0.key.caseInsensitiveCompare(sport) == .orderedSame }?.value
            guard let record, record.count > 0 else { return nil }
            return (index, member, record)
        }
        let ranked = overall ? eligible : eligible.sorted {
            let left = $0.2.rate ?? 0
            let right = $1.2.rate ?? 0
            return left == right ? $0.0 < $1.0 : left > right
        }
        return ranked.enumerated().compactMap { position, entry in
            if !search.isEmpty, ![entry.1.displayName, entry.1.username].compactMap({ $0 }).contains(where: {
                $0.localizedCaseInsensitiveContains(search.trimmingCharacters(in: .whitespacesAndNewlines))
            }) { return nil }
            return Place(rank: position + 1, member: entry.1, record: entry.2)
        }
    }

    private func podium(_ place: Place) -> some View {
        NavigationLink {
            MemberProfileView(api: api, target: place.member.username)
        } label: {
            let tone = medal(place.rank)
            VStack(spacing: 5) {
                Label("#\(place.rank)", systemImage: "medal.fill").font(.caption.weight(.heavy)).foregroundStyle(tone)
                avatar(place, size: place.rank == 1 ? 57 : 45)
                Text(place.name).font(.caption.weight(.bold)).lineLimit(2).multilineTextAlignment(.center)
                Text(percentage(place.record)).font(.title3.weight(.heavy).monospacedDigit()).foregroundStyle(winColor(place.record))
                Text(place.record.line).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 124)
            .padding(.vertical, 8)
            .background(LinearGradient(colors: [tone.opacity(0.20), slipPalette.surface],
                startPoint: .top, endPoint: .bottom), in: .rect(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(tone.opacity(0.32)) }
        }
        .buttonStyle(SlipSurgePressStyle())
        .accessibilityElement(children: .combine)
    }

    private func row(_ place: Place) -> some View {
        let tone = place.rank <= 3 ? medal(place.rank) : slipPalette.text
        return HStack(spacing: 9) {
            if !typeSize.isAccessibilitySize {
                Text("#\(place.rank)").font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(tone)
                    .frame(minWidth: 30, alignment: .leading).accessibilityLabel("Rank \(place.rank)")
            }
            avatar(place, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(place.name).font(.subheadline.weight(.bold))
                    if place.member.isVerified == true {
                        Image(systemName: "checkmark.seal.fill").font(.caption)
                            .foregroundStyle(slipPalette.accent).accessibilityLabel("Verified")
                    }
                    if place.member.accountType == "creator" {
                        Text("PRO").font(.caption2.weight(.heavy)).foregroundStyle(.purple).accessibilityLabel("Creator")
                    }
                }
                Text("@\(place.member.username)").font(.caption).foregroundStyle(.secondary)
                if !thisWeek && !place.member.recentResults.isEmpty { recent(place.member) }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 4) {
                Text(percentage(place.record)).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(winColor(place.record))
                    .accessibilityLabel("\(percentage(place.record)) wins")
                Text(place.record.line).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    .accessibilityLabel("\(place.record.wins) wins, \(place.record.losses) losses, \(place.record.pushes ?? 0) pushes")
            }
        }
        .padding(10)
        .background(slipPalette.surface, in: .rect(cornerRadius: 13))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens member profile")
        .contentShape(.rect(cornerRadius: 13))
    }

    private func recent(_ member: League.Person) -> some View {
        HStack(spacing: 3) {
            if abs(member.streak) >= 2, member.recentResults.first != "P" {
                let winning = member.streak > 0
                Text("\(winning ? "W" : "L")\(abs(member.streak))")
                    .foregroundStyle(Brand.signal(winning ? 1 : -1, for: scheme))
                    .accessibilityLabel("\(abs(member.streak)) straight \(winning ? "wins" : "losses")")
            }
            ForEach(Array(member.recentResults.prefix(5).enumerated()), id: \.offset) { _, outcome in
                let tone = outcome == "P" ? Color.orange : Brand.signal(outcome == "W" ? 1 : -1, for: scheme)
                Text(outcome).foregroundStyle(tone)
                    .frame(width: 17, height: 17).background(tone.opacity(0.16), in: .circle)
                    .accessibilityLabel(outcome == "W" ? "Win" : outcome == "L" ? "Loss" : "Push")
            }
        }
        .font(.caption2.weight(.bold))
        .accessibilityElement(children: .combine)
    }

    private func avatar(_ place: Place, size: CGFloat) -> some View {
        let color = Color(hex: place.member.avatarRingColor) ?? slipPalette.accent
        return ResearchArtwork(urls: [place.member.avatarUrl].compactMap { $0 }, fallback: "person.crop.circle.fill")
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.11), in: .circle)
            .clipShape(.circle)
            .padding(2)
            .overlay {
                switch place.member.avatarRingStyle {
                case "none": EmptyView()
                case "orbit": Circle().strokeBorder(color.opacity(0.8), style: StrokeStyle(lineWidth: 1.7, dash: [4, 2.5]))
                case "solid": Circle().strokeBorder(color, lineWidth: 1.7)
                default:
                    Circle().strokeBorder(AngularGradient(colors: [color, color.opacity(0.25), color], center: .center), lineWidth: 1.6)
                }
            }
            .accessibilityHidden(true)
    }

    private func medal(_ rank: Int) -> Color {
        switch rank {
        case 1: Color(rgb: scheme == .dark ? 0xFFD47A : 0x916400)
        case 2: Color(rgb: scheme == .dark ? 0xBFD1E4 : 0x586C82)
        default: Color(rgb: scheme == .dark ? 0xE7A984 : 0x9A5735)
        }
    }

    private func percentage(_ record: League.Record) -> String {
        record.rate?.formatted(.percent.precision(.fractionLength(0...1))) ?? "—"
    }

    private func winColor(_ record: League.Record) -> Color {
        (record.rate ?? 0) >= 0.55 ? Brand.signal(1, for: scheme) : slipPalette.text
    }
}
