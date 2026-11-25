import Foundation

enum SlateDate {
    static let zone = TimeZone(identifier: "America/New_York") ?? .gmt

    static func fromKey(_ key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: key)
    }

    static func key(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(timeZone: zone).year().month().day().dateSeparator(.dash))
    }

    static func label(_ date: Date, year: Bool = false) -> String {
        var style = Date.FormatStyle().weekday(.abbreviated).month(.abbreviated).day()
        if year { style = style.year() }
        style.timeZone = zone
        return date.formatted(style)
    }
}
