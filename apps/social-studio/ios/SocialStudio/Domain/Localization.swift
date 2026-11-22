import Foundation
import Observation

/// UI languages supported by Social Studio (same set as the web app).
enum AppLanguage: String, CaseIterable, Identifiable, Codable {
    case de, en, ru

    var id: String { rawValue }

    /// Locale used for dates, numbers and relative times.
    var locale: Locale {
        switch self {
        case .de: return Locale(identifier: "de_DE")
        case .en: return Locale(identifier: "en_GB")
        case .ru: return Locale(identifier: "ru_RU")
        }
    }

    /// Native name, e.g. "Русский" (from common.*.json → lang.*).
    var nativeName: String { L10n.t("lang.\(rawValue)") }

    /// CLDR plural category for integer counts.
    func pluralCategory(_ count: Int) -> String {
        let n = abs(count)
        switch self {
        case .de, .en:
            return n == 1 ? "one" : "other"
        case .ru:
            let mod10 = n % 10
            let mod100 = n % 100
            if mod10 == 1 && mod100 != 11 { return "one" }
            if (2...4).contains(mod10) && !(12...14).contains(mod100) { return "few" }
            return "many"
        }
    }

    /// Plural forms every plural entry must define in this language.
    var requiredPluralForms: Set<String> {
        switch self {
        case .de, .en: return ["one", "other"]
        case .ru: return ["one", "few", "many", "other"]
        }
    }

    /// First preferred system language we support, else English.
    static func preferred(from identifiers: [String] = Locale.preferredLanguages) -> AppLanguage {
        for identifier in identifiers {
            let code = String(identifier.prefix(2)).lowercased()
            if let language = AppLanguage(rawValue: code) { return language }
        }
        return .en
    }
}

/// Translation lookup backed by the shared JSON files in apps/social-studio/i18n/
/// (common.<lang>.json shared with the web app, ios.<lang>.json for iOS-only UI texts).
///
/// Values are either strings with `{placeholder}`s or plural objects
/// (`one`/`other`, Russian additionally `few`/`many`) selected via the `count` parameter.
/// Missing keys fall back to German, then to the key itself (assertion in DEBUG builds).
@Observable
final class L10n {
    static let shared = L10n()

    static let namespaces = ["common", "ios"]
    static let defaultsKey = "socialStudio.language"

    /// Current UI language. Reading it from a SwiftUI body makes the view update on change.
    private(set) var language: AppLanguage

    private let tables: [AppLanguage: [String: Any]]
    private let defaults: UserDefaults?

    init(bundle: Bundle = .main, defaults: UserDefaults? = .standard, language: AppLanguage? = nil) {
        self.defaults = defaults
        var loaded: [AppLanguage: [String: Any]] = [:]
        for lang in AppLanguage.allCases {
            loaded[lang] = Self.loadTable(language: lang, bundle: bundle)
        }
        self.tables = loaded
        if let language {
            self.language = language
        } else if let stored = defaults?.string(forKey: Self.defaultsKey), let lang = AppLanguage(rawValue: stored) {
            self.language = lang
        } else {
            self.language = AppLanguage.preferred()
        }
    }

    /// Changes the UI language and remembers it.
    func setLanguage(_ language: AppLanguage) {
        self.language = language
        defaults?.set(language.rawValue, forKey: Self.defaultsKey)
    }

    var locale: Locale { language.locale }

    // MARK: Static convenience (used everywhere in the UI)

    static func t(_ key: String, _ params: [String: String] = [:]) -> String {
        shared.translate(key, params)
    }

    static func tp(_ key: String, count: Int, _ params: [String: String] = [:]) -> String {
        shared.translatePlural(key, count: count, params)
    }

    // MARK: Lookup

    func translate(_ key: String, _ params: [String: String] = [:]) -> String {
        let lang = language
        let template: String
        if let value = tables[lang]?[key] as? String {
            template = value
        } else if let value = tables[.de]?[key] as? String {
            template = value
        } else {
            reportMissing(key)
            template = key
        }
        return Self.interpolate(template, params)
    }

    func translatePlural(_ key: String, count: Int, _ params: [String: String] = [:]) -> String {
        var allParams = params
        allParams["count"] = count.formatted(.number.locale(locale))
        let lang = language
        let forms = (tables[lang]?[key] as? [String: String]) ?? (tables[.de]?[key] as? [String: String])
        guard let forms else {
            reportMissing(key)
            return Self.interpolate(key, allParams)
        }
        let category = (tables[lang]?[key] != nil ? lang : .de).pluralCategory(count)
        let template = forms[category] ?? forms["other"] ?? forms.values.first ?? key
        return Self.interpolate(template, allParams)
    }

    /// Raw table access (tests / tooling).
    func table(for language: AppLanguage) -> [String: Any] { tables[language] ?? [:] }

    static func interpolate(_ template: String, _ params: [String: String]) -> String {
        guard !params.isEmpty else { return template }
        var result = template
        for (name, value) in params {
            result = result.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return result
    }

    private func reportMissing(_ key: String) {
        #if DEBUG
        assertionFailure("Missing translation key: \(key)")
        #endif
    }

    // MARK: Loading

    static func loadTable(language: AppLanguage, bundle: Bundle) -> [String: Any] {
        var table: [String: Any] = [:]
        for namespace in namespaces {
            guard let url = bundle.url(forResource: "\(namespace).\(language.rawValue)", withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }
            table.merge(object) { _, new in new }
        }
        return table
    }
}
