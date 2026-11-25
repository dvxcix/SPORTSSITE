import Foundation

enum SlateDate {
    static let zone = TimeZone(identifier: "America/New_York") ?? .gmt

    static func key(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(timeZone: zone).year().month().day().dateSeparator(.dash))
    }
}
