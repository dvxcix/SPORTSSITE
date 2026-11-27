import Foundation

struct CourtLinkContext: Hashable {
    enum Panel: String, CaseIterable {
        case trends, opponent, ladder, movement, tracking, court, markets

        var label: String {
            switch self {
            case .trends: "Trends"
            case .opponent: "Opponent log"
            case .ladder: "Ladder"
            case .movement: "Market Story"
            case .tracking: "Tracking"
            case .court: "Shot Map"
            case .markets: "Markets"
            }
        }

        var icon: String {
            switch self {
            case .trends: "chart.bar.xaxis"
            case .opponent: "list.bullet.rectangle"
            case .ladder: "stairs"
            case .movement: "chart.line.uptrend.xyaxis"
            case .tracking: "waveform.path"
            case .court: "scope"
            case .markets: "list.bullet.rectangle"
            }
        }
    }

    enum Contract: String, CaseIterable, Codable {
        case milestone
        case standard = "over_under"

        var label: String { self == .milestone ? "Milestones" : "Over / Under" }
    }

    enum Sort: String, CaseIterable, Codable {
        case mm, average, line, odds, l5, l10, l20, minutes, name

        var label: String {
            switch self {
            case .mm: "MM"
            case .average: "Average"
            case .line: "Line"
            case .odds: "Price"
            case .l5: "Last 5"
            case .l10: "Last 10"
            case .l20: "Last 20"
            case .minutes: "Minutes"
            case .name: "Player name"
            }
        }
    }

    struct Quote: Hashable {
        let line: Double
        let contract: Contract
    }

    var market: CourtPlayerMarket?
    var side: CourtPlayerMarket.Side?
    var player: Int?
    var panel: Panel?
    var quote: Quote?
    var metric: String?
    var booksChoice: [String]?
    var contract: Contract?
    var target: Double?
    var sort: Sort?
    var ascending = false

    init() {}

    init?(_ values: [String: String]) {
        market = values["market"].flatMap(CourtPlayerMarket.init(rawValue:))
        if let value = values["market"], market == nil,
           !["points_first3min", "rebounds_first3min", "assists_first3min"].contains(value) { return nil }
        side = values["side"].flatMap { CourtPlayerMarket.Side(rawValue: $0.capitalized) }
        if values["side"] != nil, side == nil { return nil }
        player = values["player"].flatMap { value in
            value.range(of: #"^[1-9][0-9]{0,9}$"#, options: .regularExpression) == nil ? nil : Int(value)
        }
        panel = values["panel"].flatMap(Panel.init(rawValue:))
        if values["player"] != nil, player == nil { return nil }
        if values["panel"] != nil, panel == nil { return nil }
        if let rawLine = values["line"], let rawType = values["type"],
           let line = Self.parseLine(rawLine), let type = Contract(rawValue: rawType) {
            quote = Quote(line: line, contract: type)
        } else if values["line"] != nil || values["type"] != nil { return nil }
        if let value = values["metric"] {
            guard value.range(of: #"^[a-z0-9_]{1,64}$"#, options: .regularExpression) != nil else { return nil }
            metric = value
        }
        if let value = values["books"] {
            if value == "all" {
                booksChoice = []
            } else {
                let selected = value.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
                guard (1...32).contains(selected.count), Set(selected).count == selected.count,
                      selected.allSatisfy({ $0.range(of: #"^[a-z0-9_]{1,40}$"#, options: .regularExpression) != nil })
                      else { return nil }
                booksChoice = selected
            }
        }
        contract = values["contract"].flatMap(Contract.init(rawValue:))
        sort = values["sort"].flatMap(Sort.init(rawValue:))
        if values["contract"] != nil, contract == nil { return nil }
        if values["sort"] != nil, sort == nil { return nil }
        if let order = values["order"] {
            guard order == "asc" || order == "desc" else { return nil }
            ascending = order == "asc"
        }
        if let value = values["target"], value != "all" {
            guard let parsed = Self.parseLine(value) else { return nil }
            target = parsed
        }
    }

    private static func parseLine(_ string: String) -> Double? {
        guard string.utf8.count <= 16, let value = Double(string), (0...1000).contains(value) else { return nil }
        return value
    }
}
