import XCTest
@testable import SocialStudio

/// Verifies the transitions defined in apps/social-studio/DOMAIN_RULES.md against the shared seed
/// (examples/social_studio/workspace.json, bundled into the test target).
@MainActor
final class WorkspaceStoreTests: XCTestCase {
    private let fixedNow = Date(timeIntervalSince1970: 1_794_744_000) // 2026-11-15T12:00:00Z

    private func makeStore() throws -> WorkspaceStore {
        let seed = try Persistence.loadSeed(bundle: Bundle(for: WorkspaceStoreTests.self))
        let now = fixedNow
        return WorkspaceStore(data: seed, persistence: nil, now: { now })
    }

    // MARK: Contract round-trip

    func testSeedRoundTripsWithoutLoss() throws {
        let store = try makeStore()
        let encoded = try WorkspaceCoding.encoder().encode(store.data)
        let decoded = try WorkspaceCoding.decoder().decode(Workspace.self, from: encoded)
        XCTAssertEqual(decoded, store.data)

        let json = String(decoding: encoded, as: UTF8.self)
        XCTAssertTrue(json.contains("\"2026-11-12T14:20:00Z\""), "dateTime must be encoded as ISO 8601 UTC with Z")
        XCTAssertFalse(json.contains("null"), "absent optionals must be omitted, not encoded as null")
    }

    func testParsesFractionalSecondsAndOffsets() {
        XCTAssertNotNil(WorkspaceCoding.parseDateTime("2026-11-12T14:20:00Z"))
        XCTAssertNotNil(WorkspaceCoding.parseDateTime("2026-11-12T14:20:00.123Z"))
        XCTAssertNotNil(WorkspaceCoding.parseDateTime("2026-11-12T15:20:00+01:00"))
        XCTAssertNil(WorkspaceCoding.parseDateTime("12.11.2026"))
    }

    func testGeneratedIdsMatchContractPattern() throws {
        let regex = try NSRegularExpression(pattern: "^[a-z0-9][a-z0-9_-]{1,63}$")
        for prefix in ["ct", "sc", "shot", "sh", "m", "rc", "a"] {
            let id = IDGenerator.make(prefix)
            XCTAssertEqual(regex.numberOfMatches(in: id, range: NSRange(id.startIndex..., in: id)), 1, id)
        }
    }

    // MARK: Scripts

    func testSubmitAndApproveScriptAdvancesPipeline() throws {
        let store = try makeStore()
        let content = try store.createContent(
            clientId: "c_puls", title: "Test", format: .reel, platforms: [.instagram],
            pillar: nil, brief: nil, dueDate: nil, assigneeIds: []
        )
        XCTAssertEqual(store.content(content.id)?.stage, .idea)

        let script = try store.createScript(contentId: content.id)
        XCTAssertEqual(script.status, .draft)
        XCTAssertEqual(store.content(content.id)?.stage, .script)

        try store.submitScript(scriptId: script.id)
        XCTAssertEqual(store.script(script.id)?.status, .inReview)
        XCTAssertEqual(store.content(content.id)?.stage, .scriptReview)

        try store.approveScript(scriptId: script.id)
        XCTAssertEqual(store.script(script.id)?.status, .approved)
        XCTAssertEqual(store.content(content.id)?.stage, .shoot)
        XCTAssertEqual(store.data.activity.first?.kind, .approved)
    }

    func testRequestScriptChangesRequiresNoteAndStepsBack() throws {
        let store = try makeStore()
        XCTAssertThrowsError(try store.requestScriptChanges(scriptId: "sc_winterkarte_v1", note: "   ")) { error in
            XCTAssertEqual(error as? DomainError, .noteRequired)
        }
        try store.requestScriptChanges(scriptId: "sc_winterkarte_v1", note: "Preise prüfen")
        XCTAssertEqual(store.script("sc_winterkarte_v1")?.status, .changesRequested)
        XCTAssertEqual(store.script("sc_winterkarte_v1")?.reviewNote, "Preise prüfen")
        XCTAssertEqual(store.content("ct_winterkarte")?.stage, .script)
    }

    func testApprovedScriptIsNotEditableButCanGetNewVersion() throws {
        let store = try makeStore()
        guard var approved = store.script("sc_latte_art_v2") else { return XCTFail("seed script missing") }
        approved.hook = "Geändert"
        XCTAssertThrowsError(try store.updateScript(approved))

        let next = try store.newScriptVersion(scriptId: "sc_latte_art_v2")
        XCTAssertEqual(next.version, 3)
        XCTAssertEqual(next.status, .draft)
        XCTAssertEqual(store.currentScript(for: "ct_latte_art")?.id, next.id)
        XCTAssertEqual(store.script("sc_latte_art_v2")?.status, .approved, "old version stays as history")
    }

    func testCannotSubmitScriptThatIsAlreadyInReview() throws {
        let store = try makeStore()
        XCTAssertThrowsError(try store.submitScript(scriptId: "sc_winterkarte_v1"))
    }

    func testHashtagParsing() {
        XCTAssertEqual(WorkspaceStore.parseHashtags("#a b, #c  #a"), ["#a", "#b", "#c"])
        XCTAssertEqual(WorkspaceStore.parseHashtags(""), [])
    }

    // MARK: Media

    func testRawFootageReleaseForEditMovesToEdit() throws {
        let store = try makeStore()
        // ct_latte_art is in stage "shoot"
        let raw = try store.addMedia(contentId: "ct_latte_art", kind: .raw, fileName: "A001.mov",
                                     mimeType: "video/quicktime", sizeBytes: 100, durationSec: 60, storageKey: nil)
        XCTAssertEqual(raw.status, .uploaded)
        XCTAssertEqual(store.content("ct_latte_art")?.stage, .shoot)

        try store.releaseForEdit(mediaId: raw.id)
        XCTAssertEqual(store.mediaAsset(raw.id)?.status, .readyForEdit)
        XCTAssertEqual(store.content("ct_latte_art")?.stage, .edit)

        XCTAssertThrowsError(try store.releaseForEdit(mediaId: raw.id))
        try store.startEdit(mediaId: raw.id)
        XCTAssertEqual(store.mediaAsset(raw.id)?.status, .inEdit)
    }

    func testCutUploadVersionsAndApproval() throws {
        let store = try makeStore()
        // seed: ct_kniebeuge has cut v2 in review
        let cut = try store.addMedia(contentId: "ct_kniebeuge", kind: .cut, fileName: "v3.mp4",
                                     mimeType: "video/mp4", sizeBytes: 10, durationSec: 27, storageKey: nil)
        XCTAssertEqual(cut.version, 3)
        XCTAssertEqual(cut.status, .inReview)
        XCTAssertEqual(store.content("ct_kniebeuge")?.stage, .cutReview)

        // Inbox only lists the newest cut per content.
        XCTAssertEqual(store.pendingMediaApprovals.map(\.id), [cut.id])

        try store.approveMedia(mediaId: cut.id)
        XCTAssertEqual(store.mediaAsset(cut.id)?.status, .approved)
        XCTAssertEqual(store.content("ct_kniebeuge")?.stage, .scheduled)
    }

    func testRequestMediaChangesAddsCommentAndStepsBackToEdit() throws {
        let store = try makeStore()
        XCTAssertThrowsError(try store.requestMediaChanges(mediaId: "m_kb_cut_v2", note: ""))
        let before = store.mediaAsset("m_kb_cut_v2")?.comments.count ?? 0
        try store.requestMediaChanges(mediaId: "m_kb_cut_v2", note: "Musik leiser")
        XCTAssertEqual(store.mediaAsset("m_kb_cut_v2")?.status, .changesRequested)
        XCTAssertEqual(store.mediaAsset("m_kb_cut_v2")?.comments.count, before + 1)
        XCTAssertEqual(store.content("ct_kniebeuge")?.stage, .edit)
    }

    func testAutomaticTransitionsNeverMoveBackwards() throws {
        let store = try makeStore()
        // ct_tisch_asmr is published; a new cut upload must not pull it back to cut_review.
        _ = try store.addMedia(contentId: "ct_tisch_asmr", kind: .cut, fileName: "re-edit.mp4",
                               mimeType: nil, sizeBytes: nil, durationSec: nil, storageKey: nil)
        XCTAssertEqual(store.content("ct_tisch_asmr")?.stage, .published)
    }

    func testCommentTimestampIsClampedToDuration() throws {
        let store = try makeStore()
        try store.addComment(mediaId: "m_kb_cut_v2", text: "Ende", timestampSec: 999)
        XCTAssertEqual(store.mediaAsset("m_kb_cut_v2")?.comments.last?.timestampSec, 27)
    }

    // MARK: Approvals & roles

    func testSeedInboxContainsScriptAndCut() throws {
        let store = try makeStore()
        XCTAssertEqual(store.pendingScriptApprovals.map(\.id), ["sc_winterkarte_v1"])
        XCTAssertEqual(store.pendingMediaApprovals.map(\.id), ["m_kb_cut_v2"])
        XCTAssertEqual(store.pendingApprovalCount, 2)
    }

    func testClientUserSeesOnlyOwnDataWithoutRawMedia() throws {
        let store = try makeStore()
        store.setCurrentUser("u_paul_puls")
        XCTAssertEqual(store.visibleClients.map(\.id), ["c_puls"])
        XCTAssertTrue(store.scopedContents.allSatisfy { $0.clientId == "c_puls" })
        XCTAssertFalse(store.media(for: "ct_kniebeuge").contains { $0.kind == .raw })
        XCTAssertFalse(store.canEditProduction)
        XCTAssertFalse(store.canSeeInternalNotes)
        XCTAssertEqual(store.pendingApprovalCount, 1)

        XCTAssertThrowsError(try store.createContent(
            clientId: "c_puls", title: "X", format: .reel, platforms: [.instagram],
            pillar: nil, brief: nil, dueDate: nil, assigneeIds: []
        ))
        XCTAssertThrowsError(try store.moveStage(contentId: "ct_kniebeuge", to: .published))

        // Clients may approve.
        try store.approveMedia(mediaId: "m_kb_cut_v2")
        XCTAssertEqual(store.data.activity.first?.actorId, "u_paul_puls")
    }

    func testClientSwitcherScopesContents() throws {
        let store = try makeStore()
        store.selectedClientId = "c_berger"
        XCTAssertTrue(store.scopedContents.allSatisfy { $0.clientId == "c_berger" })
        store.selectedClientId = nil
        XCTAssertEqual(store.scopedContents.count, store.data.contents.count)
    }

    // MARK: Pipeline & shoots

    func testManualStageMoveIsAllowedInAnyDirection() throws {
        let store = try makeStore()
        try store.moveStage(contentId: "ct_tisch_asmr", to: .idea)
        XCTAssertEqual(store.content("ct_tisch_asmr")?.stage, .idea)
        XCTAssertEqual(store.data.activity.first?.kind, .stageChanged)
    }

    func testSaveShootKeepsContentLinksInSync() throws {
        let store = try makeStore()
        guard var shoot = store.shoot("sh_morgenrot_nov") else { return XCTFail("seed shoot missing") }

        shoot.contentIds.append("ct_team_anna")
        shoot.contentIds.removeAll { $0 == "ct_winterkarte" }
        shoot.contentIds.append("ct_kniebeuge") // other client → must be dropped
        try store.saveShoot(shoot)

        XCTAssertEqual(store.content("ct_team_anna")?.shootId, "sh_morgenrot_nov")
        XCTAssertNil(store.content("ct_winterkarte")?.shootId)
        XCTAssertFalse(store.shoot("sh_morgenrot_nov")?.contentIds.contains("ct_kniebeuge") ?? true)
        XCTAssertEqual(store.content("ct_kniebeuge")?.shootId, "sh_puls_okt")
    }

    func testNewShootStealsContentFromPreviousShoot() throws {
        let store = try makeStore()
        var draft = WorkspaceStore.newShootDraft(clientId: "c_morgenrot", date: fixedNow)
        draft.title = "Nachdreh"
        draft.location.name = "Café"
        draft.contentIds = ["ct_latte_art"]
        let saved = try store.saveShoot(draft)

        XCTAssertNotEqual(saved.id, "new")
        XCTAssertEqual(store.content("ct_latte_art")?.shootId, saved.id)
        XCTAssertFalse(store.shoot("sh_morgenrot_nov")?.contentIds.contains("ct_latte_art") ?? true)
    }

    func testShootValidation() throws {
        let store = try makeStore()
        var draft = WorkspaceStore.newShootDraft(clientId: "c_morgenrot", date: fixedNow)
        draft.title = "X"
        draft.location.name = "Y"
        draft.startTime = "14:00"
        draft.endTime = "09:00"
        XCTAssertThrowsError(try store.saveShoot(draft))
    }

    func testDeleteShotsRenumbersOrder() throws {
        let store = try makeStore()
        store.deleteShots(contentId: "ct_latte_art", at: IndexSet(integer: 0))
        XCTAssertEqual(store.shots(for: "ct_latte_art").map(\.order), [0, 1, 2, 3])
        store.moveShots(contentId: "ct_latte_art", from: IndexSet(integer: 3), to: 0)
        XCTAssertEqual(store.shots(for: "ct_latte_art").first?.id, "shot_la_5")
    }
}
