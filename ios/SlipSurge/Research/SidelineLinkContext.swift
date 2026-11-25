import Foundation

struct SidelineLinkContext: Hashable {
    var sample = SidelineResearchSample.automatic
    var capture: Date?
    var player: Int?
    var line: Double?
    var preview = false

    init() {}

    init?(_ values: [String: String]) {
        if let value = values["sample"] {
            guard let chosen = SidelineResearchSample(rawValue: value) else { return nil }
            sample = chosen
        }
        if let value = values["at"] {
            guard value.utf8.count <= 40, let at = SidelineBoard.timestamp(value) else { return nil }
            capture = at
        }
        if let value = values["player"] {
            guard value.range(of: #"^[1-9][0-9]{0,9}$"#, options: .regularExpression) != nil,
                  let number = Int(value) else { return nil }
            player = number
        }
        if let value = values["line"] {
            guard value.utf8.count <= 16, let number = Double(value), (0...1000).contains(number) else { return nil }
            line = number
        }
        if let value = values["preview"] {
            guard value == "nfl" else { return nil }
            preview = true
        }
    }
}
