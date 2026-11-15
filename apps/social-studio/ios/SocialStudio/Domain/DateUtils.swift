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

    /// "2026-11-19" → "Do., 19. Nov. 2026"
    static func displayDay(_ string: String) -> String {
        guard let date = date(fromDay: string) else { return string }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).year().locale(Locale(identifier: "de_DE")))
    }

    static func displayDateTime(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).hour().minute().locale(Locale(identifier: "de_DE")))
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "de_DE")
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
        return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}
