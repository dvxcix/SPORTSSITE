import SwiftUI

enum Sportsbook {
    static func normalized(_ vendor: String) -> String {
        let name = vendor.lowercased().filter { $0.isASCII && $0.isLetter }
        switch name {
        case "fd": return "fanduel"
        case "dk": return "draftkings"
        case "mgm": return "betmgm"
        case "cz", "williamhill", "williamhillus": return "caesars"
        case "fan": return "fanatics"
        case "br": return "betrivers"
        case "ballys", "bally": return "ballybet"
        case "parx": return "betparx"
        case "kal": return "kalshi"
        case "poly", "pm": return "polymarket"
        default: return name
        }
    }

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
        ResearchArtworkPicker(title: "Sportsbook", options: books.map(ResearchArtworkPicker.Option.sportsbook), selection: $selection)
    }
}
