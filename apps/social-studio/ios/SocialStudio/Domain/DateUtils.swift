import Foundation

/// Helpers for the contract's string-based `date` (yyyy-MM-dd) and `time` (HH:mm) fields.
enum DateUtils {
    private static func dayFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    /// "yyyy-MM-dd" → Date (start of that day, local time zone).
    static func date(fromDay string: String) -> Date? {
        dayFormatter().date(from: string)
    }

    /// Date → "yyyy-MM-dd" (local time zone).
    static func dayString(from date: Date) -> String {
        dayFormatter().string(from: date)
    }

    static func todayString(now: Date = Date()) -> String {
        dayString(from: now)
    }

    /// "HH:mm" → Date on a reference day (for DatePicker bindings).
    static func date(fromTime string: String, reference: Date = Date()) -> Date? {
        let parts = string.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: reference)
    }

    static func timeString(from date: Date) -> String {
        let comps = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", comps.hour ?? 0, comps.minute ?? 0)
    }

    /// Locale of the selected UI language (de_DE / en_GB / ru_RU).
    static var locale: Locale { L10n.shared.locale }

    /// Abbreviated month of a yyyy-MM-dd day ("Nov." / "Nov" / "нояб.").
    static func monthShort(_ string: String) -> String {
        guard let date = date(fromDay: string) else { return "" }
        return date.formatted(.dateTime.month(.abbreviated).locale(locale))
    }

    /// "2026-11-19" → "Do., 19. Nov. 2026" (de) / "Thu, 19 Nov 2026" (en) / "чт, 19 нояб. 2026 г." (ru)
    static func displayDay(_ string: String) -> String {
        guard let date = date(fromDay: string) else { return string }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year().locale(locale))
    }

    static func displayDateTime(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).hour().minute().locale(locale))
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: now)
    }

    /// 75.5 → "1:15"
    static func timecode(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    static func fileSize(_ bytes: Int64?) -> String {
        guard let bytes else { return "–" }
        return bytes.formatted(.byteCount(style: .file).locale(locale))
    }
}
