import SwiftUI

enum Sportsbook {
    static func name(_ key: String) -> String {
        switch key {
        case "fanduel": "FanDuel"
        case "draftkings": "DraftKings"
        case "betmgm": "BetMGM"
        case "betrivers": "BetRivers"
        case "betparx": "betPARX"
        case "ballybet": "Bally Bet"
        case "espnbet": "ESPN BET"
        default: key.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func artwork(_ key: String) -> String? {
        switch key {
        case "ballybet", "betmgm", "betparx", "betrivers", "caesars",
             "draftkings", "fanduel", "fanatics", "pinnacle": "book-\(key)"
        default: nil
        }
    }
}

struct SportsbookPicker: View {
    let books: [String]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 8) {
            if let asset = Sportsbook.artwork(selection) {
                Image(asset)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18, height: 18)
                    .accessibilityHidden(true)
            }
            Picker("Sportsbook", selection: $selection) {
                ForEach(books, id: \.self) { Text(Sportsbook.name($0)).tag($0) }
            }
        }
    }
}
