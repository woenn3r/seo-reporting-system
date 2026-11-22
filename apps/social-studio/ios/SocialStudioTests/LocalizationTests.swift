import XCTest
@testable import SocialStudio

/// Checks the shared translation files (apps/social-studio/i18n, bundled into the test target)
/// and the localization helpers. Mirrors tools/check_l10n.py for the parts that need the runtime.
final class LocalizationTests: XCTestCase {
    private var bundle: Bundle { Bundle(for: LocalizationTests.self) }

    private func rawTable(_ namespace: String, _ language: AppLanguage) throws -> [String: Any] {
        let url = try XCTUnwrap(bundle.url(forResource: "\(namespace).\(language.rawValue)", withExtension: "json"),
                                "\(namespace).\(language.rawValue).json missing in test bundle")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try XCTUnwrap(object as? [String: Any])
    }

    private func placeholders(_ value: Any) -> Set<String> {
        let texts: [String]
        if let string = value as? String {
            texts = [string]
        } else if let forms = value as? [String: String] {
            texts = Array(forms.values)
        } else {
            return []
        }
        var result: Set<String> = []
        let regex = try! NSRegularExpression(pattern: "\\{(\\w+)\\}")
        for text in texts {
            let range = NSRange(text.startIndex..., in: text)
            for match in regex.matches(in: text, range: range) {
                if let r = Range(match.range(at: 1), in: text) { result.insert(String(text[r])) }
            }
        }
        return result
    }

    private func l10n(_ language: AppLanguage) -> L10n {
        L10n(bundle: bundle, defaults: nil, language: language)
    }

    // (a) key / placeholder / plural parity

    func testAllLanguagesHaveSameKeysPlaceholdersAndPluralForms() throws {
        for namespace in L10n.namespaces {
            let german = try rawTable(namespace, .de)
            XCTAssertFalse(german.isEmpty, namespace)
            for language in AppLanguage.allCases {
                let table = try rawTable(namespace, language)
                XCTAssertEqual(Set(table.keys), Set(german.keys), "\(namespace).\(language.rawValue): key sets differ")
                for (key, value) in table {
                    guard let reference = german[key] else { continue }
                    XCTAssertEqual(placeholders(value), placeholders(reference), "\(namespace).\(language.rawValue): \(key)")
                    if let forms = value as? [String: String] {
                        XCTAssertTrue(language.requiredPluralForms.isSubset(of: Set(forms.keys)),
                                      "\(namespace).\(language.rawValue): \(key) lacks plural forms")
                    } else {
                        let string = try XCTUnwrap(value as? String, "\(key) must be a string or plural object")
                        XCTAssertFalse(string.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) is empty")
                    }
                }
            }
        }
    }

    // (b) every enum case has its common.* key in every language

    func testEveryEnumCaseHasATranslation() {
        var keys: [String] = []
        keys += Stage.allCases.map { "stage.\($0.rawValue)" }
        keys += ContentFormat.allCases.map { "format.\($0.rawValue)" }
        keys += Platform.allCases.map { "platform.\($0.rawValue)" }
        keys += TeamRole.allCases.map { "role.\($0.rawValue)" }
        keys += Framing.allCases.map { "framing.\($0.rawValue)" }
        keys += CameraAngle.allCases.map { "angle.\($0.rawValue)" }
        keys += CameraMovement.allCases.map { "movement.\($0.rawValue)" }
        keys += AspectRatio.allCases.map { "aspect.\($0.rawValue)" }
        keys += ScriptStatus.allCases.map { "scriptStatus.\($0.rawValue)" }
        keys += ShootStatus.allCases.map { "shootStatus.\($0.rawValue)" }
        keys += MediaKind.allCases.map { "mediaKind.\($0.rawValue)" }
        keys += MediaStatus.allCases.map { "mediaStatus.\($0.rawValue)" }
        keys += ActivityEvent.allCases.map { "activity.\($0.rawValue)" }
        keys += AppLanguage.allCases.map { "lang.\($0.rawValue)" }
        keys += ContentDetailView.Tab.allCases.map { "ios.detail.tab.\($0.rawValue)" }
        for language in AppLanguage.allCases {
            let table = l10n(language).table(for: language)
            for key in keys {
                XCTAssertNotNil(table[key] as? String, "\(language.rawValue): missing \(key)")
            }
        }
    }

    // (c) CLDR plural rules

    func testRussianPluralRule() {
        let ru = AppLanguage.ru
        XCTAssertEqual(ru.pluralCategory(1), "one")
        XCTAssertEqual(ru.pluralCategory(2), "few")
        XCTAssertEqual(ru.pluralCategory(5), "many")
        XCTAssertEqual(ru.pluralCategory(11), "many")
        XCTAssertEqual(ru.pluralCategory(21), "one")
        XCTAssertEqual(ru.pluralCategory(22), "few")
        XCTAssertEqual(ru.pluralCategory(25), "many")
        XCTAssertEqual(ru.pluralCategory(111), "many")
        XCTAssertEqual(ru.pluralCategory(0), "many")
        XCTAssertEqual(AppLanguage.de.pluralCategory(1), "one")
        XCTAssertEqual(AppLanguage.en.pluralCategory(2), "other")
    }

    func testPluralAndInterpolationRendering() {
        XCTAssertEqual(l10n(.ru).translatePlural("ios.common.openComments", count: 3), "3 открытых комментария")
        XCTAssertEqual(l10n(.ru).translatePlural("ios.common.openComments", count: 21), "21 открытый комментарий")
        XCTAssertEqual(l10n(.en).translatePlural("ios.common.openComments", count: 1), "1 open comment")
        XCTAssertEqual(l10n(.de).translate("ios.shots.progress", ["done": "2", "total": "5"]), "2 von 5 Shots im Kasten")
    }

    func testPreferredLanguageDetection() {
        XCTAssertEqual(AppLanguage.preferred(from: ["ru-RU", "en-US"]), .ru)
        XCTAssertEqual(AppLanguage.preferred(from: ["fr-FR", "de-AT"]), .de)
        XCTAssertEqual(AppLanguage.preferred(from: ["fr-FR"]), .en)
    }

    // (d) activity params (contract v1.1)

    func testActivityParamsRoundTripAndOptionalParams() throws {
        let params = ActivityParams(.contentStageChanged, title: "Latte Art", stage: .cutReview)
        let activity = Activity(id: "a_x", actorId: "u_lena", kind: .stageChanged, targetType: .content,
                                targetId: "ct_latte_art", message: "fallback", at: Date(timeIntervalSince1970: 1_794_744_000),
                                params: params)
        let data = try WorkspaceCoding.encoder().encode(activity)
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(json.contains("\"event\" : \"content_stage_changed\""), json)
        XCTAssertTrue(json.contains("\"stage\" : \"cut_review\""), json)
        XCTAssertFalse(json.contains("null"), "absent optionals must be omitted")
        XCTAssertEqual(try WorkspaceCoding.decoder().decode(Activity.self, from: data), activity)

        // Entries without params (older data) still decode and fall back to `message`.
        let legacy = #"{"id":"a_y","actorId":"u_lena","kind":"created","targetType":"content","targetId":"ct_x","message":"hat X angelegt","at":"2026-11-12T14:20:00Z"}"#
        let decoded = try WorkspaceCoding.decoder().decode(Activity.self, from: Data(legacy.utf8))
        XCTAssertNil(decoded.params)
        XCTAssertEqual(decoded.displayText, "hat X angelegt")
    }

    func testActivityTemplatesRenderInEveryLanguage() {
        for language in AppLanguage.allCases {
            let text = l10n(language).translate("activity.content_stage_changed",
                                                ["title": "Latte Art", "stageLabel": "X"])
            XCTAssertTrue(text.contains("Latte Art") && text.contains("X"), "\(language.rawValue): \(text)")
            XCTAssertFalse(text.contains("{"), "\(language.rawValue): unresolved placeholder in \(text)")
        }
    }

    @MainActor
    func testStoreLogsStructuredParams() throws {
        let seed = try Persistence.loadSeed(bundle: bundle)
        let store = WorkspaceStore(data: seed, persistence: nil, now: { Date(timeIntervalSince1970: 1_794_744_000) })
        XCTAssertTrue(store.data.activity.allSatisfy { $0.params != nil }, "seed activities carry params")

        let content = try store.createContent(clientId: "c_puls", title: "Param-Test", format: .reel, platforms: [.instagram],
                                              pillar: nil, brief: nil, dueDate: nil, assigneeIds: [])
        XCTAssertEqual(store.data.activity.last?.params, ActivityParams(.contentCreated, title: "Param-Test"))
        try store.moveStage(contentId: content.id, to: .edit)
        XCTAssertEqual(store.data.activity.last?.params?.event, .contentStageChanged)
        XCTAssertEqual(store.data.activity.last?.params?.stage, .edit)
        XCTAssertFalse(store.data.activity.last?.message.isEmpty ?? true, "message (contract: required) is filled")

        try store.deleteShoot("sh_berger_dez")
        XCTAssertEqual(store.data.activity.last?.params?.event, .shootDeleted)
        XCTAssertEqual(store.data.activity.last?.targetType, .client)
    }

    func testDomainErrorIsLocalizedWithNestedKeys() {
        let error = DomainError.notFound("entity.script")
        XCTAssertEqual(error.key, "error.notFound")
        let text = error.errorDescription ?? ""
        XCTAssertFalse(text.contains("entity.script"), "nested entity key must be translated: \(text)")
        XCTAssertFalse(text.contains("{"), text)
    }
}
