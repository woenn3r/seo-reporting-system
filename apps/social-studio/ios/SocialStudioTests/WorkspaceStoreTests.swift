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

        var script = try store.createScript(contentId: content.id)
        XCTAssertEqual(script.status, .draft)
        XCTAssertEqual(store.content(content.id)?.stage, .script)

        // An empty script (no hook, no scene text) cannot be submitted.
        XCTAssertThrowsError(try store.submitScript(scriptId: script.id)) { error in
            XCTAssertEqual((error as? DomainError)?.key, "error.scriptEmpty")
        }
        script.hook = "  Hook!  "
        try store.updateScript(script)
        XCTAssertEqual(store.script(script.id)?.hook, "Hook!", "texts are stored trimmed")

        try store.submitScript(scriptId: script.id)
        XCTAssertEqual(store.script(script.id)?.status, .inReview)
        XCTAssertEqual(store.content(content.id)?.stage, .scriptReview)

        try store.approveScript(scriptId: script.id)
        XCTAssertEqual(store.script(script.id)?.status, .approved)
        XCTAssertEqual(store.content(content.id)?.stage, .shoot)
        XCTAssertEqual(store.data.activity.last?.kind, .approved)
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
        XCTAssertFalse(store.can(.contentManage))
        XCTAssertFalse(store.can(.notesViewInternal))
        XCTAssertFalse(store.can(.mediaViewRaw))
        XCTAssertEqual(store.pendingApprovalCount, 1)

        XCTAssertThrowsError(try store.createContent(
            clientId: "c_puls", title: "X", format: .reel, platforms: [.instagram],
            pillar: nil, brief: nil, dueDate: nil, assigneeIds: []
        ))
        XCTAssertThrowsError(try store.moveStage(contentId: "ct_kniebeuge", to: .published))

        // Clients may approve.
        try store.approveMedia(mediaId: "m_kb_cut_v2")
        XCTAssertEqual(store.data.activity.last?.actorId, "u_paul_puls")
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
        XCTAssertEqual(store.data.activity.last?.kind, .stageChanged)
    }

    func testSaveShootKeepsContentLinksInSync() throws {
        let store = try makeStore()
        guard var shoot = store.shoot("sh_morgenrot_nov") else { return XCTFail("seed shoot missing") }

        shoot.contentIds.append("ct_team_anna")
        shoot.contentIds.removeAll { $0 == "ct_winterkarte" }
        let before = store.content("ct_team_anna")?.updatedAt
        try store.saveShoot(shoot)

        XCTAssertEqual(store.content("ct_team_anna")?.shootId, "sh_morgenrot_nov")
        XCTAssertNil(store.content("ct_winterkarte")?.shootId)
        XCTAssertEqual(store.content("ct_team_anna")?.updatedAt, fixedNow, "re-linked contents get updatedAt")
        XCTAssertNotEqual(before, fixedNow)
        XCTAssertEqual(WorkspaceIntegrity.errors(in: store.data), [])
    }

    func testSaveShootRejectsForeignOrUnknownContentInsteadOfDroppingIt() throws {
        let store = try makeStore()
        guard let shoot = store.shoot("sh_morgenrot_nov") else { return XCTFail("seed shoot missing") }

        var foreign = shoot
        foreign.contentIds.append("ct_kniebeuge") // belongs to another client
        XCTAssertThrowsError(try store.saveShoot(foreign)) { error in
            XCTAssertEqual((error as? DomainError)?.key, "error.otherClient")
        }
        var unknown = shoot
        unknown.contentIds.append("ct_does_not_exist")
        XCTAssertThrowsError(try store.saveShoot(unknown)) { error in
            XCTAssertEqual(error as? DomainError, .notFound("entity.content"))
        }
        XCTAssertEqual(store.shoot("sh_morgenrot_nov"), shoot, "nothing was changed")
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

    // MARK: Review fixes – rule parity with web/src/domain/actions.ts

    private func errorKey(_ body: () throws -> Void) -> String? {
        do {
            try body()
            return nil
        } catch {
            return (error as? DomainError)?.key ?? "non-domain error: \(error)"
        }
    }

    func testEveryActionKeepsWorkspaceConsistent() throws {
        let store = try makeStore()
        XCTAssertEqual(WorkspaceIntegrity.errors(in: store.data), [], "seed is consistent")
        let content = try store.createContent(clientId: "c_puls", title: " T ", format: .reel, platforms: [.instagram, .instagram],
                                              pillar: " ", brief: nil, dueDate: nil, assigneeIds: ["u_mira", "u_mira"])
        XCTAssertEqual(content.title, "T")
        XCTAssertNil(content.pillar, "blank optionals are omitted")
        XCTAssertEqual(content.platforms, [.instagram])
        XCTAssertEqual(content.assigneeIds, ["u_mira"])
        _ = try store.createScript(contentId: content.id)
        try store.deleteShoot("sh_puls_okt")
        XCTAssertEqual(WorkspaceIntegrity.errors(in: store.data), [])
    }

    func testNewScriptVersionOnlyFromCurrentVersion() throws {
        let store = try makeStore()
        let v3 = try store.newScriptVersion(scriptId: "sc_latte_art_v2")
        XCTAssertEqual(v3.version, 3)
        XCTAssertEqual(errorKey { _ = try store.newScriptVersion(scriptId: "sc_latte_art_v2") }, "error.scriptNotLatest")
        XCTAssertEqual(errorKey { _ = try store.newScriptVersion(scriptId: v3.id) }, "error.scriptDraftNoVersion")
    }

    func testNewVersionOfScriptInReviewLeavesApprovalStage() throws {
        let store = try makeStore()
        XCTAssertEqual(store.content("ct_winterkarte")?.stage, .scriptReview)
        _ = try store.newScriptVersion(scriptId: "sc_winterkarte_v1")
        XCTAssertEqual(store.content("ct_winterkarte")?.stage, .script)
        XCTAssertTrue(store.pendingScriptApprovals.isEmpty, "nothing is waiting for approval any more")
    }

    func testRemovingASceneClearsShotReferences() throws {
        let store = try makeStore()
        var v3 = try store.newScriptVersion(scriptId: "sc_latte_art_v2")
        v3.scenes.removeAll { $0.id == "s3" }
        try store.updateScript(v3)
        XCTAssertNil(store.shots(for: "ct_latte_art").first { $0.id == "shot_la_3" }?.sceneId)
        XCTAssertEqual(store.shots(for: "ct_latte_art").first { $0.id == "shot_la_2" }?.sceneId, "s2")
    }

    func testUpdateScriptAllowsEmptyHookAndOmitsBlankOptionals() throws {
        let store = try makeStore()
        guard var draft = store.script("sc_eiweiss_v1") else { return XCTFail("seed script missing") }
        draft.hook = ""
        draft.caption = "  Caption  "
        draft.cta = "   "
        try store.updateScript(draft)
        XCTAssertEqual(store.script("sc_eiweiss_v1")?.hook, "")
        XCTAssertEqual(store.script("sc_eiweiss_v1")?.caption, "Caption")
        XCTAssertNil(store.script("sc_eiweiss_v1")?.cta)
    }

    func testUpdateContentOnlyPatchesEditableFields() throws {
        let store = try makeStore()
        guard var stale = store.content("ct_latte_art") else { return XCTFail("seed content missing") }
        stale.title = "  Neu  "
        stale.stage = .published      // must be ignored
        stale.shootId = nil           // must be ignored
        try store.updateContent(stale)
        XCTAssertEqual(store.content("ct_latte_art")?.title, "Neu")
        XCTAssertEqual(store.content("ct_latte_art")?.stage, .shoot)
        XCTAssertEqual(store.content("ct_latte_art")?.shootId, "sh_morgenrot_nov")
    }

    func testOnlyTheNewestCutCanBeApprovedOrRejected() throws {
        let store = try makeStore()
        let v3 = try store.addMedia(contentId: "ct_kniebeuge", kind: .cut, fileName: "v3.mp4",
                                    mimeType: nil, sizeBytes: nil, durationSec: nil, storageKey: nil)
        XCTAssertEqual(errorKey { try store.approveMedia(mediaId: "m_kb_cut_v2") }, "error.notLatestVersion")
        XCTAssertEqual(errorKey { try store.requestMediaChanges(mediaId: "m_kb_cut_v2", note: "x") }, "error.notLatestVersion")
        XCTAssertTrue(store.isLatestCut(v3))
        try store.approveMedia(mediaId: v3.id)
    }

    func testCommentTimestampIsRoundedToTenths() throws {
        let store = try makeStore()
        try store.addComment(mediaId: "m_kb_cut_v2", text: "x", timestampSec: 11.449)
        XCTAssertEqual(store.mediaAsset("m_kb_cut_v2")?.comments.last?.timestampSec, 11.4)
        try store.addComment(mediaId: "m_kb_cut_v2", text: "y", timestampSec: -3)
        XCTAssertEqual(store.mediaAsset("m_kb_cut_v2")?.comments.last?.timestampSec, 0)
    }

    func testInboxIsSortedOldestFirstAcrossKinds() throws {
        let store = try makeStore()
        // seed: cut v2 uploaded 2026-11-13, script submitted 2026-11-14
        XCTAssertEqual(store.approvalInbox.map(\.id), ["m_kb_cut_v2", "sc_winterkarte_v1"])
    }

    func testActivityIsAppendedInChronologicalOrder() throws {
        let store = try makeStore()
        let count = store.data.activity.count
        try store.moveStage(contentId: "ct_team_anna", to: .script)
        XCTAssertEqual(store.data.activity.count, count + 1)
        XCTAssertEqual(store.data.activity.last?.params?.event, .contentStageChanged)
        XCTAssertEqual(store.scopedActivity.first?.params?.event, .contentStageChanged, "views read newest first")
    }

    // MARK: Permissions (DOMAIN_RULES: Rollen & Rechte)

    func testPermissionMatrixMirrorsTheWebApp() {
        XCTAssertEqual(Permission.allCases.map(\.rawValue), [
            "content.manage", "script.edit", "script.review", "shots.manage", "shoot.manage", "media.upload",
            "media.manage", "media.review", "media.comment", "media.viewRaw", "notes.viewInternal",
            "admin.clients", "admin.team", "admin.workspace",
        ])
        for role in TeamRole.allCases where role != .client {
            XCTAssertEqual(Permissions.granted(to: role), Set(Permission.allCases), "\(role)")
        }
        XCTAssertEqual(Permissions.granted(to: .client), [.scriptReview, .mediaReview, .mediaComment])
        let client = TeamMember(id: "x", name: "x", role: .client, email: nil, clientId: "c_a")
        XCTAssertTrue(Permissions.can(client, .mediaReview, clientId: "c_a"))
        XCTAssertFalse(Permissions.can(client, .mediaReview, clientId: "c_b"))
        XCTAssertFalse(Permissions.can(nil, .mediaComment))
    }

    func testClientUsersCannotManageProductionData() throws {
        let store = try makeStore()
        guard let shoot = store.shoot("sh_puls_okt"), let shot = store.shots(for: "ct_kniebeuge").first,
              let draftScript = store.script("sc_eiweiss_v1"), let content = store.content("ct_kniebeuge") else {
            return XCTFail("seed data missing")
        }
        store.setCurrentUser("u_paul_puls") // client user of c_puls
        let denied: [(String, () throws -> Void)] = [
            ("createContent", { _ = try store.createContent(clientId: "c_puls", title: "x", format: .reel, platforms: [.instagram], pillar: nil, brief: nil, dueDate: nil, assigneeIds: []) }),
            ("updateContent", { try store.updateContent(content) }),
            ("moveStage", { try store.moveStage(contentId: "ct_kniebeuge", to: .published) }),
            ("createScript", { _ = try store.createScript(contentId: "ct_puls_scheduled") }),
            ("updateScript", { try store.updateScript(draftScript) }),
            ("submitScript", { try store.submitScript(scriptId: "sc_eiweiss_v1") }),
            ("newScriptVersion", { _ = try store.newScriptVersion(scriptId: "sc_kniebeuge_v1") }),
            ("addShot", { _ = try store.addShot(contentId: "ct_kniebeuge", draft: shot) }),
            ("updateShot", { try store.updateShot(shot) }),
            ("addMedia", { _ = try store.addMedia(contentId: "ct_kniebeuge", kind: .cut, fileName: "x.mp4", mimeType: nil, sizeBytes: nil, durationSec: nil, storageKey: nil) }),
            ("releaseForEdit", { try store.releaseForEdit(mediaId: "m_member_raw") }),
            ("startEdit", { try store.startEdit(mediaId: "m_member_raw") }),
            ("commentOnRaw", { try store.addComment(mediaId: "m_kb_raw", text: "raw footage is internal", timestampSec: nil) }),
            ("saveShoot", { _ = try store.saveShoot(shoot) }),
            ("deleteShoot", { try store.deleteShoot("sh_puls_okt") }),
            ("resetDemoData", { try store.resetDemoData() }),
        ]
        for (name, action) in denied {
            XCTAssertEqual(errorKey(action), "error.forbidden", name)
        }
        // Non-throwing actions are silently ignored.
        store.toggleShotDone(shot.id)
        store.deleteShots(contentId: "ct_kniebeuge", at: IndexSet(integer: 0))
        store.setCurrentUser("u_lena")
        XCTAssertEqual(store.shots(for: "ct_kniebeuge").count, 3)
        XCTAssertEqual(store.shots(for: "ct_kniebeuge").first?.done, shot.done)
    }

    func testClientUsersReviewAndCommentOnlyForTheirOwnClient() throws {
        let store = try makeStore()
        store.setCurrentUser("u_paul_puls")
        try store.addComment(mediaId: "m_kb_cut_v2", text: "ok", timestampSec: nil)
        XCTAssertEqual(errorKey { try store.approveScript(scriptId: "sc_winterkarte_v1") }, "error.forbidden") // Café Morgenrot
        try store.approveMedia(mediaId: "m_kb_cut_v2")
        store.setCurrentUser("u_anna_cafe")
        try store.approveScript(scriptId: "sc_winterkarte_v1")
    }

    func testLookupsAreScopedToTheCurrentUser() throws {
        let store = try makeStore()
        store.setCurrentUser("u_paul_puls")
        XCTAssertNil(store.content("ct_latte_art"), "other client's content")
        XCTAssertNil(store.script("sc_winterkarte_v1"))
        XCTAssertNil(store.shoot("sh_morgenrot_nov"))
        XCTAssertNil(store.client("c_morgenrot"))
        XCTAssertNil(store.mediaAsset("m_tisch_final"))
        XCTAssertNil(store.mediaAsset("m_kb_raw"), "raw footage is invisible without media.viewRaw")
        XCTAssertNotNil(store.mediaAsset("m_kb_cut_v2"))
        XCTAssertNotNil(store.content("ct_kniebeuge"))
        XCTAssertTrue(store.contents(forClient: "c_morgenrot").isEmpty)
        XCTAssertTrue(store.activity(forContent: "ct_latte_art").isEmpty)
    }

    func testClientUsersDoNotSeeActivityAboutRawFootage() throws {
        let store = try makeStore()
        let raw = try store.addMedia(contentId: "ct_kniebeuge", kind: .raw, fileName: "A-cam_take3.mov",
                                     mimeType: nil, sizeBytes: nil, durationSec: nil, storageKey: nil)
        try store.releaseForEdit(mediaId: raw.id)
        XCTAssertTrue(store.scopedActivity.contains { $0.params?.fileName == "A-cam_take3.mov" })
        store.setCurrentUser("u_paul_puls")
        XCTAssertFalse(store.scopedActivity.contains { $0.params?.fileName == "A-cam_take3.mov" })
        XCTAssertFalse(store.activity(forContent: "ct_kniebeuge").contains { $0.params?.event.isInternal == true })
    }

    // MARK: Integrity & loading (DOMAIN_RULES: Datenintegrität)

    func testIntegrityReportsBrokenReferences() throws {
        var broken = try makeStore().data
        broken.workspace.currentUserId = "u_nobody"
        broken.contents[0].clientId = "c_missing"
        if let index = broken.team.firstIndex(where: { $0.id == "u_paul_puls" }) { broken.team[index].clientId = "c_missing" }
        let errors = WorkspaceIntegrity.errors(in: broken).joined(separator: "\n")
        XCTAssertTrue(errors.contains("currentUserId"))
        XCTAssertTrue(errors.contains("unknown client c_missing"))
        XCTAssertTrue(errors.contains("client user without valid clientId"))
    }

    private func temporaryPersistence() throws -> Persistence {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("social-studio-tests-\(UUID().uuidString)", isDirectory: true)
        let persistence = Persistence(baseURL: base)
        try persistence.ensureDirectories()
        addTeardownBlock { try? FileManager.default.removeItem(at: base) }
        return persistence
    }

    private func unreadableFiles(in persistence: Persistence) throws -> [URL] {
        try FileManager.default.contentsOfDirectory(at: persistence.baseURL, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("workspace.unreadable-") }
    }

    func testUnreadableFileIsKeptAndNeverOverwritten() throws {
        let persistence = try temporaryPersistence()
        let garbage = Data("{ this is not a workspace".utf8)
        try garbage.write(to: persistence.workspaceURL)

        let now = fixedNow
        let store = WorkspaceStore.load(persistence: persistence, bundle: Bundle(for: WorkspaceStoreTests.self), now: { now })
        XCTAssertNotNil(store.lastError, "the user is told what happened")
        XCTAssertEqual(store.data.clients.count, 3, "app starts from the seed")

        // A mutation persists the new state – the unreadable original must survive untouched.
        try store.moveStage(contentId: "ct_team_anna", to: .script)
        let kept = try unreadableFiles(in: persistence)
        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(kept.first)), garbage)
        XCTAssertEqual(try persistence.load()?.contents.first { $0.id == "ct_team_anna" }?.stage, .script)
    }

    func testInconsistentFileIsTreatedAsUnreadable() throws {
        let persistence = try temporaryPersistence()
        var broken = try makeStore().data
        broken.workspace.currentUserId = "u_nobody"
        try WorkspaceCoding.encoder().encode(broken).write(to: persistence.workspaceURL)

        XCTAssertThrowsError(try persistence.load())
        let store = WorkspaceStore.load(persistence: persistence, bundle: Bundle(for: WorkspaceStoreTests.self))
        XCTAssertEqual(store.data.workspace.currentUserId, "u_lena")
        XCTAssertEqual(try unreadableFiles(in: persistence).count, 1)
    }

    func testFirstLaunchPersistsTheSeed() throws {
        let persistence = try temporaryPersistence()
        let store = WorkspaceStore.load(persistence: persistence, bundle: Bundle(for: WorkspaceStoreTests.self))
        XCTAssertNil(store.lastError)
        XCTAssertEqual(try persistence.load(), store.data)
    }
}
