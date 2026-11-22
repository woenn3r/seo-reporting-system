import Foundation
import Observation

/// Errors for workflow actions that violate apps/social-studio/DOMAIN_RULES.md.
/// Carries an i18n key (common `error.*`) + params; the text is rendered in the current UI
/// language. Params named `entity` / `field` are themselves i18n keys
/// (e.g. "entity.script", "field.title") and are translated before insertion.
struct DomainError: LocalizedError, Equatable {
    let key: String
    let params: [String: String]

    init(_ key: String, _ params: [String: String] = [:]) {
        self.key = key
        self.params = params
    }

    static func notFound(_ entityKey: String) -> DomainError { DomainError("error.notFound", ["entity": entityKey]) }
    static func required(_ fieldKey: String) -> DomainError { DomainError("error.required", ["field": fieldKey]) }
    static let noteRequired = DomainError.required("field.note")
    /// The central permission matrix (Permissions.swift) denied the action.
    static let forbidden = DomainError("error.forbidden")

    var errorDescription: String? {
        var values = params
        for name in ["entity", "field"] {
            if let nested = values[name] { values[name] = L10n.t(nested) }
        }
        return L10n.t(key, values)
    }
}

/// One entry of the approvals inbox (DOMAIN_RULES: Freigaben-Eingang).
enum ApprovalItem: Identifiable, Hashable {
    case script(Script)
    case media(MediaAsset)

    var id: String {
        switch self {
        case .script(let script): return script.id
        case .media(let asset): return asset.id
        }
    }

    var contentId: String {
        switch self {
        case .script(let script): return script.contentId
        case .media(let asset): return asset.contentId
        }
    }

    /// Waiting since (script: last update, cut: upload).
    var since: Date {
        switch self {
        case .script(let script): return script.updatedAt
        case .media(let asset): return asset.uploadedAt
        }
    }
}

/// Single source of state for the app. All workflow transitions live here and mirror
/// apps/social-studio/DOMAIN_RULES.md (and web/src/domain/actions.ts). Every action enforces
/// the central permission matrix itself – hiding buttons in views is only convenience.
@MainActor
@Observable
final class WorkspaceStore {
    private(set) var data: Workspace
    /// nil = all clients
    var selectedClientId: String? = nil
    /// Last user-facing error (shown as alert by the root view).
    var lastError: String? = nil

    private let persistence: Persistence?
    private let now: () -> Date

    init(data: Workspace, persistence: Persistence? = nil, now: @escaping () -> Date = Date.init) {
        self.data = data
        self.persistence = persistence
        self.now = now
        if let user = data.team.first(where: { $0.id == data.workspace.currentUserId }),
           user.role == .client {
            self.selectedClientId = user.clientId
        }
    }

    /// Loads persisted state, or the bundled seed on first launch.
    static func live() -> WorkspaceStore {
        do {
            return load(persistence: try Persistence.standard())
        } catch {
            // No usable storage location: run from the seed in memory.
            let store = WorkspaceStore(data: seedOrEmpty(bundle: .main), persistence: nil)
            store.lastError = L10n.t("ios.error.loadFailed", ["reason": error.localizedDescription])
            return store
        }
    }

    /// Loads from `persistence`. Data that cannot be decoded or fails the integrity check is
    /// NEVER overwritten: the file is moved aside and the app starts from the seed
    /// (DOMAIN_RULES: Datenintegrität).
    static func load(persistence: Persistence, bundle: Bundle = .main, now: @escaping () -> Date = Date.init) -> WorkspaceStore {
        do {
            if let saved = try persistence.load() {
                return WorkspaceStore(data: saved, persistence: persistence, now: now)
            }
            let store = WorkspaceStore(data: try Persistence.loadSeed(bundle: bundle), persistence: persistence, now: now)
            store.persist()
            return store
        } catch let cause {
            let fallback = seedOrEmpty(bundle: bundle)
            let reason = cause.localizedDescription
            do {
                let movedTo = try persistence.quarantineUnreadableWorkspace(now: now())
                let store = WorkspaceStore(data: fallback, persistence: persistence, now: now)
                if let movedTo {
                    store.lastError = L10n.t("ios.error.loadFailedKept", ["file": movedTo, "reason": reason])
                } else {
                    store.lastError = L10n.t("ios.error.loadFailed", ["reason": reason])
                }
                return store
            } catch {
                // The unreadable file could not be moved aside → do not persist at all in this session.
                let store = WorkspaceStore(data: fallback, persistence: nil, now: now)
                store.lastError = L10n.t("ios.error.loadFailedReadOnly", ["reason": reason])
                return store
            }
        }
    }

    private static func seedOrEmpty(bundle: Bundle) -> Workspace {
        (try? Persistence.loadSeed(bundle: bundle)) ?? emptyWorkspace()
    }

    static func emptyWorkspace() -> Workspace {
        Workspace(
            schemaVersion: 1,
            workspace: WorkspaceInfo(id: "ws_local", name: L10n.t("ios.fallback.workspaceName"), currentUserId: "u_local"),
            team: [TeamMember(id: "u_local", name: L10n.t("ios.fallback.userName"), role: .lead, email: nil, clientId: nil)],
            clients: [], contents: [], scripts: [], shots: [], shoots: [], media: [], activity: []
        )
    }

    // MARK: - Error handling helpers for views

    /// Runs an action and turns thrown errors into `lastError` (root alert). Returns true on success.
    /// Do not use inside sheets – the root alert cannot present above them; use `attempt`.
    @discardableResult
    func perform(_ action: () throws -> Void) -> Bool {
        if let message = attempt(action) {
            lastError = message
            return false
        }
        return true
    }

    /// Runs an action and returns the localized error message, or nil on success.
    /// Sheets show the message in their own alert (`errorAlert`).
    func attempt(_ action: () throws -> Void) -> String? {
        do {
            try action()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: - Persistence

    private func persist() {
        guard let persistence else { return }
        do {
            try persistence.save(data)
        } catch {
            lastError = L10n.t("ios.error.saveFailed", ["reason": error.localizedDescription])
        }
    }

    func resetDemoData() throws {
        try authorize(.adminWorkspace)
        if let persistence {
            try persistence.reset()
        }
        data = try Persistence.loadSeed()
        selectedClientId = nil
        if let user = currentUser, user.role == .client {
            selectedClientId = user.clientId
        }
        persist()
    }

    func mediaURL(for asset: MediaAsset) -> URL? {
        guard let key = asset.storageKey else { return nil }
        return persistence?.mediaURL(for: key)
    }

    // MARK: - Current user & permissions (DOMAIN_RULES: Rollen & Rechte)

    var currentUser: TeamMember? {
        data.team.first { $0.id == data.workspace.currentUserId }
    }

    /// Display helper only (e.g. fixed client label instead of a switcher). Rights go through `can`.
    var isClientUser: Bool { currentUser?.role == .client }

    /// May the current user do this? Same matrix the actions enforce (Permissions.swift).
    func can(_ permission: Permission, clientId: String? = nil) -> Bool {
        Permissions.can(currentUser, permission, clientId: clientId)
    }

    private func authorize(_ permission: Permission, clientId: String? = nil) throws {
        guard can(permission, clientId: clientId) else { throw DomainError.forbidden }
    }

    /// Demo-only user switch (a real deployment authenticates instead).
    func setCurrentUser(_ id: String) {
        guard let user = data.team.first(where: { $0.id == id }) else { return }
        data.workspace.currentUserId = id
        if user.role == .client {
            selectedClientId = user.clientId
        } else {
            selectedClientId = nil
        }
        persist()
    }

    // MARK: - Visibility

    var visibleClients: [Client] {
        if let user = currentUser, user.role == .client {
            return data.clients.filter { $0.id == user.clientId }
        }
        return data.clients
    }

    private var visibleClientIds: Set<String> { Set(visibleClients.map(\.id)) }

    /// Clients in the current scope (switcher selection + role).
    private var scopedClientIds: Set<String> {
        let visible = visibleClientIds
        if let selected = selectedClientId, visible.contains(selected) {
            return [selected]
        }
        return visible
    }

    var selectedClient: Client? {
        guard let id = selectedClientId else { return nil }
        return visibleClients.first { $0.id == id }
    }

    // Unscoped lookups – for the actions only.
    private func rawContent(_ id: String) -> ContentItem? { data.contents.first { $0.id == id } }
    private func rawShoot(_ id: String) -> Shoot? { data.shoots.first { $0.id == id } }

    private func requireContent(_ id: String) throws -> ContentItem {
        guard let content = rawContent(id) else { throw DomainError.notFound("entity.content") }
        return content
    }

    // Lookups for views: nil for anything outside the current user's visibility, so detail
    // screens can never show another client's data (e.g. after a user switch).
    func client(_ id: String) -> Client? { visibleClients.first { $0.id == id } }
    func member(_ id: String) -> TeamMember? { data.team.first { $0.id == id } }

    func content(_ id: String) -> ContentItem? {
        guard let content = rawContent(id), visibleClientIds.contains(content.clientId) else { return nil }
        return content
    }

    func shoot(_ id: String) -> Shoot? {
        guard let shoot = rawShoot(id), visibleClientIds.contains(shoot.clientId) else { return nil }
        return shoot
    }

    func script(_ id: String) -> Script? {
        guard let script = data.scripts.first(where: { $0.id == id }), content(script.contentId) != nil else { return nil }
        return script
    }

    func mediaAsset(_ id: String) -> MediaAsset? {
        guard let asset = data.media.first(where: { $0.id == id }), content(asset.contentId) != nil else { return nil }
        if asset.kind == .raw && !can(.mediaViewRaw) { return nil }
        return asset
    }

    var agencyTeam: [TeamMember] { data.team.filter { $0.role != .client } }

    /// Number of contents of a (visible) client.
    func contentCount(forClient clientId: String) -> Int {
        guard visibleClientIds.contains(clientId) else { return 0 }
        return data.contents.filter { $0.clientId == clientId }.count
    }

    /// Contents of a (visible) client.
    func contents(forClient clientId: String) -> [ContentItem] {
        guard visibleClientIds.contains(clientId) else { return [] }
        return data.contents.filter { $0.clientId == clientId }
    }

    /// Contents in scope, newest update first.
    var scopedContents: [ContentItem] {
        let ids = scopedClientIds
        return data.contents
            .filter { ids.contains($0.clientId) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func contents(in stage: Stage) -> [ContentItem] {
        scopedContents.filter { $0.stage == stage }
    }

    var scopedShoots: [Shoot] {
        let ids = scopedClientIds
        return data.shoots
            .filter { ids.contains($0.clientId) }
            .sorted { ($0.date, $0.startTime) < ($1.date, $1.startTime) }
    }

    var upcomingShoots: [Shoot] {
        let today = DateUtils.todayString(now: now())
        return scopedShoots.filter { $0.date >= today && $0.status != .cancelled && $0.status != .done }
    }

    var pastShoots: [Shoot] {
        let today = DateUtils.todayString(now: now())
        return scopedShoots
            .filter { !($0.date >= today && $0.status != .cancelled && $0.status != .done) }
            .reversed()
    }

    private func visibleMedia(_ assets: [MediaAsset]) -> [MediaAsset] {
        can(.mediaViewRaw) ? assets : assets.filter { $0.kind != .raw }
    }

    /// Activity for the given clients, newest first. Users without `media.viewRaw` never see
    /// entries about raw footage or deleted files.
    private func activity(forClients clientIds: Set<String>) -> [Activity] {
        let contentIds = Set(data.contents.filter { clientIds.contains($0.clientId) }.map(\.id))
        let scriptIds = Set(data.scripts.filter { contentIds.contains($0.contentId) }.map(\.id))
        let mediaIds = Set(visibleMedia(data.media).filter { contentIds.contains($0.contentId) }.map(\.id))
        let shootIds = Set(data.shoots.filter { clientIds.contains($0.clientId) }.map(\.id))
        let seesRaw = can(.mediaViewRaw)
        return data.activity
            .filter { entry in
                if !seesRaw, let event = entry.params?.event, event.isInternal { return false }
                switch entry.targetType {
                case .content: return contentIds.contains(entry.targetId)
                case .script: return scriptIds.contains(entry.targetId)
                case .media: return mediaIds.contains(entry.targetId)
                case .shoot: return shootIds.contains(entry.targetId)
                case .client: return clientIds.contains(entry.targetId)
                }
            }
            .sorted { $0.at > $1.at }
    }

    var scopedActivity: [Activity] { activity(forClients: scopedClientIds) }

    /// History of one content (the content itself, its scripts and its media), newest first.
    func activity(forContent contentId: String) -> [Activity] {
        guard let content = content(contentId) else { return [] }
        let scriptIds = Set(data.scripts.filter { $0.contentId == contentId }.map(\.id))
        let mediaIds = Set(data.media.filter { $0.contentId == contentId }.map(\.id))
        return activity(forClients: [content.clientId]).filter { entry in
            switch entry.targetType {
            case .content: return entry.targetId == contentId
            case .script: return scriptIds.contains(entry.targetId)
            case .media: return mediaIds.contains(entry.targetId)
            case .shoot, .client: return false
            }
        }
    }

    // MARK: - Activity

    /// Logs an activity with structured params; `message` (contract: required) is the
    /// rendered text in the current UI language, used as fallback by other clients.
    private func log(_ kind: ActivityKind, _ target: ActivityTarget, _ targetId: String, _ params: ActivityParams) {
        let entry = Activity(
            id: IDGenerator.make("a"),
            actorId: data.workspace.currentUserId,
            kind: kind,
            targetType: target,
            targetId: targetId,
            message: params.renderedText,
            at: now(),
            params: params
        )
        data.activity.append(entry)
    }

    // MARK: - Helpers

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func unique<T: Equatable>(_ values: [T]) -> [T] {
        values.reduce(into: [T]()) { if !$0.contains($1) { $0.append($1) } }
    }

    // MARK: - Content & pipeline

    private func contentIndex(_ id: String) throws -> Int {
        guard let index = data.contents.firstIndex(where: { $0.id == id }) else {
            throw DomainError.notFound("entity.content")
        }
        return index
    }

    /// Automatic transitions only move forward (DOMAIN_RULES: Pipeline).
    private func advance(contentId: String, to stage: Stage) {
        guard let index = data.contents.firstIndex(where: { $0.id == contentId }) else { return }
        if data.contents[index].stage < stage {
            data.contents[index].stage = stage
            data.contents[index].updatedAt = now()
        }
    }

    /// Explicit step ("Änderungen angefordert", superseded review).
    private func setStage(contentId: String, to stage: Stage) {
        guard let index = data.contents.firstIndex(where: { $0.id == contentId }) else { return }
        guard data.contents[index].stage != stage else { return }
        data.contents[index].stage = stage
        data.contents[index].updatedAt = now()
    }

    @discardableResult
    func createContent(
        clientId: String,
        title: String,
        format: ContentFormat,
        platforms: [Platform],
        pillar: String?,
        brief: String?,
        dueDate: String?,
        assigneeIds: [String]
    ) throws -> ContentItem {
        guard data.clients.contains(where: { $0.id == clientId }) else { throw DomainError.notFound("entity.client") }
        try authorize(.contentManage, clientId: clientId)
        let name = Self.trimmed(title)
        guard !name.isEmpty else { throw DomainError.required("field.title") }
        guard !platforms.isEmpty else { throw DomainError("error.noPlatform") }
        let timestamp = now()
        let item = ContentItem(
            id: IDGenerator.make("ct"),
            clientId: clientId,
            title: name,
            format: format,
            platforms: Self.unique(platforms),
            stage: .idea,
            pillar: pillar.nilIfBlank,
            brief: brief.nilIfBlank,
            assigneeIds: Self.unique(assigneeIds),
            dueDate: dueDate.nilIfBlank,
            publishAt: nil,
            shootId: nil,
            createdAt: timestamp,
            updatedAt: timestamp
        )
        data.contents.append(item)
        log(.created, .content, item.id, ActivityParams(.contentCreated, title: item.title))
        persist()
        return item
    }

    /// Patches only the editable fields (title, format, platforms, pillar, brief, assignees,
    /// dueDate, publishAt). Stage, shoot link and identity of a stale draft are ignored.
    func updateContent(_ updated: ContentItem) throws {
        let index = try contentIndex(updated.id)
        try authorize(.contentManage, clientId: data.contents[index].clientId)
        let name = Self.trimmed(updated.title)
        guard !name.isEmpty else { throw DomainError.required("field.title") }
        guard !updated.platforms.isEmpty else { throw DomainError("error.noPlatform") }
        data.contents[index].title = name
        data.contents[index].format = updated.format
        data.contents[index].platforms = Self.unique(updated.platforms)
        data.contents[index].pillar = updated.pillar.nilIfBlank
        data.contents[index].brief = updated.brief.nilIfBlank
        data.contents[index].assigneeIds = Self.unique(updated.assigneeIds)
        data.contents[index].dueDate = updated.dueDate.nilIfBlank
        data.contents[index].publishAt = updated.publishAt
        data.contents[index].updatedAt = now()
        persist()
    }

    /// Manual stage change – allowed in any direction (DOMAIN_RULES: Pipeline).
    func moveStage(contentId: String, to stage: Stage) throws {
        let index = try contentIndex(contentId)
        try authorize(.contentManage, clientId: data.contents[index].clientId)
        guard data.contents[index].stage != stage else { return }
        data.contents[index].stage = stage
        data.contents[index].updatedAt = now()
        log(.stageChanged, .content, contentId, ActivityParams(.contentStageChanged, title: data.contents[index].title, stage: stage))
        persist()
    }

    func markPublished(contentId: String) throws {
        try moveStage(contentId: contentId, to: .published)
    }

    // MARK: - Scripts

    /// Current script = highest version for a content.
    func currentScript(for contentId: String) -> Script? {
        data.scripts.filter { $0.contentId == contentId }.max { $0.version < $1.version }
    }

    func scriptHistory(for contentId: String) -> [Script] {
        data.scripts.filter { $0.contentId == contentId }.sorted { $0.version > $1.version }
    }

    private func scriptIndex(_ id: String) throws -> Int {
        guard let index = data.scripts.firstIndex(where: { $0.id == id }) else {
            throw DomainError.notFound("entity.script")
        }
        return index
    }

    @discardableResult
    func createScript(contentId: String) throws -> Script {
        let content = try requireContent(contentId)
        try authorize(.scriptEdit, clientId: content.clientId)
        if currentScript(for: contentId) != nil {
            throw DomainError("error.scriptExists")
        }
        let script = Script(
            id: IDGenerator.make("sc"),
            contentId: contentId,
            version: 1,
            status: .draft,
            hook: "",
            scenes: [ScriptScene(id: "s1", title: L10n.t("ios.script.hook"), voiceover: nil, onScreenText: nil, visual: nil, durationSec: nil)],
            caption: nil,
            hashtags: [],
            cta: nil,
            reviewNote: nil,
            updatedAt: now()
        )
        data.scripts.append(script)
        advance(contentId: contentId, to: .script)
        log(.created, .script, script.id, ActivityParams(.scriptCreated, title: content.title))
        persist()
        return script
    }

    /// Editing is only allowed for draft / changes_requested. Patches hook, scenes, caption,
    /// hashtags and cta; `hook` is required by the contract but may be empty.
    func updateScript(_ updated: Script) throws {
        let index = try scriptIndex(updated.id)
        let existing = data.scripts[index]
        let content = try requireContent(existing.contentId)
        try authorize(.scriptEdit, clientId: content.clientId)
        guard existing.isEditable else {
            throw DomainError("error.scriptNotEditable")
        }
        let tags = updated.hashtags ?? []
        if let invalid = tags.first(where: { !Self.isValidHashtag($0) }) {
            throw DomainError("error.invalidHashtag", ["tag": invalid])
        }
        let scenes = updated.scenes.map { scene -> ScriptScene in
            var copy = scene
            copy.title = Self.trimmed(scene.title)
            copy.voiceover = scene.voiceover.nilIfBlank
            copy.onScreenText = scene.onScreenText.nilIfBlank
            copy.visual = scene.visual.nilIfBlank
            return copy
        }
        data.scripts[index].hook = Self.trimmed(updated.hook)
        data.scripts[index].scenes = scenes
        data.scripts[index].caption = updated.caption.nilIfBlank
        data.scripts[index].hashtags = Self.unique(tags)
        data.scripts[index].cta = updated.cta.nilIfBlank
        data.scripts[index].updatedAt = now()

        // Shots must not keep references to scenes that no longer exist.
        let sceneIds = Set(scenes.map(\.id))
        for shotIndex in data.shots.indices where data.shots[shotIndex].contentId == existing.contentId {
            if let sceneId = data.shots[shotIndex].sceneId, !sceneIds.contains(sceneId) {
                data.shots[shotIndex].sceneId = nil
            }
        }
        persist()
    }

    static func isValidHashtag(_ tag: String) -> Bool {
        tag.count > 1 && tag.hasPrefix("#") && !tag.contains(where: { $0.isWhitespace })
    }

    /// Parses free text ("#a #b, c") into contract-valid hashtags.
    static func parseHashtags(_ text: String) -> [String] {
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",;"))
        var result: [String] = []
        for raw in text.components(separatedBy: separators) where !raw.isEmpty {
            let tag = raw.hasPrefix("#") ? raw : "#\(raw)"
            if isValidHashtag(tag) && !result.contains(tag) { result.append(tag) }
        }
        return result
    }

    /// Only from the current version (approved / in review). A content that was waiting for
    /// the superseded version's approval goes back to `script`.
    @discardableResult
    func newScriptVersion(scriptId: String) throws -> Script {
        let index = try scriptIndex(scriptId)
        let source = data.scripts[index]
        let content = try requireContent(source.contentId)
        try authorize(.scriptEdit, clientId: content.clientId)
        guard currentScript(for: source.contentId)?.id == source.id else {
            throw DomainError("error.scriptNotLatest")
        }
        guard source.status == .approved || source.status == .inReview else {
            throw DomainError("error.scriptDraftNoVersion")
        }
        var next = source
        next.id = IDGenerator.make("sc")
        next.version = source.version + 1
        next.status = .draft
        next.reviewNote = nil
        next.updatedAt = now()
        data.scripts.append(next)
        if content.stage == .scriptReview {
            setStage(contentId: content.id, to: .script)
        }
        log(.created, .script, next.id, ActivityParams(.scriptVersionCreated, title: content.title, version: next.version))
        persist()
        return next
    }

    private static func sceneHasText(_ scene: ScriptScene) -> Bool {
        [scene.voiceover, scene.onScreenText, scene.visual].contains { $0.nilIfBlank != nil }
    }

    func submitScript(scriptId: String) throws {
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        let content = try requireContent(script.contentId)
        try authorize(.scriptEdit, clientId: content.clientId)
        guard script.isEditable else {
            throw DomainError("error.scriptNotDraft")
        }
        guard !Self.trimmed(script.hook).isEmpty || script.scenes.contains(where: Self.sceneHasText) else {
            throw DomainError("error.scriptEmpty")
        }
        data.scripts[index].status = .inReview
        data.scripts[index].updatedAt = now()
        advance(contentId: script.contentId, to: .scriptReview)
        log(.submitted, .script, scriptId, ActivityParams(.scriptSubmitted, title: content.title, version: script.version))
        persist()
    }

    func approveScript(scriptId: String) throws {
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        let content = try requireContent(script.contentId)
        try authorize(.scriptReview, clientId: content.clientId)
        guard script.status == .inReview else {
            throw DomainError("error.scriptNotInReview")
        }
        // a superseded version can no longer be approved or rejected
        guard currentScript(for: script.contentId)?.id == script.id else {
            throw DomainError("error.scriptNotLatest")
        }
        data.scripts[index].status = .approved
        data.scripts[index].reviewNote = nil
        data.scripts[index].updatedAt = now()
        advance(contentId: script.contentId, to: .shoot)
        log(.approved, .script, scriptId, ActivityParams(.scriptApproved, title: content.title, version: script.version))
        persist()
    }

    func requestScriptChanges(scriptId: String, note: String) throws {
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        let content = try requireContent(script.contentId)
        try authorize(.scriptReview, clientId: content.clientId)
        guard script.status == .inReview else {
            throw DomainError("error.scriptNotInReview")
        }
        // a superseded version can no longer be approved or rejected
        guard currentScript(for: script.contentId)?.id == script.id else {
            throw DomainError("error.scriptNotLatest")
        }
        let text = Self.trimmed(note)
        guard !text.isEmpty else { throw DomainError.noteRequired }
        data.scripts[index].status = .changesRequested
        data.scripts[index].reviewNote = text
        data.scripts[index].updatedAt = now()
        setStage(contentId: script.contentId, to: .script)
        log(.changesRequested, .script, scriptId, ActivityParams(.scriptChangesRequested, title: content.title, version: script.version))
        persist()
    }

    // MARK: - Shots (Perspektiven)

    func shots(for contentId: String) -> [Shot] {
        data.shots.filter { $0.contentId == contentId }.sorted { $0.order < $1.order }
    }

    private func canManageShots(contentId: String) -> Bool {
        guard let content = rawContent(contentId) else { return false }
        return can(.shotsManage, clientId: content.clientId)
    }

    private static func normalized(_ shot: Shot) throws -> Shot {
        var copy = shot
        copy.description = trimmed(shot.description)
        guard !copy.description.isEmpty else { throw DomainError.required("field.description") }
        copy.sceneId = shot.sceneId.nilIfBlank
        copy.lens = shot.lens.nilIfBlank
        copy.notes = shot.notes.nilIfBlank
        return copy
    }

    @discardableResult
    func addShot(contentId: String, draft: Shot) throws -> Shot {
        let content = try requireContent(contentId)
        try authorize(.shotsManage, clientId: content.clientId)
        var shot = try Self.normalized(draft)
        shot.id = IDGenerator.make("shot")
        shot.contentId = contentId
        shot.order = (shots(for: contentId).map(\.order).max() ?? -1) + 1
        shot.done = false
        data.shots.append(shot)
        persist()
        return shot
    }

    func updateShot(_ updated: Shot) throws {
        guard let index = data.shots.firstIndex(where: { $0.id == updated.id }) else {
            throw DomainError.notFound("entity.shot")
        }
        let content = try requireContent(data.shots[index].contentId)
        try authorize(.shotsManage, clientId: content.clientId)
        var copy = try Self.normalized(updated)
        copy.contentId = data.shots[index].contentId
        copy.order = data.shots[index].order
        data.shots[index] = copy
        persist()
    }

    func toggleShotDone(_ shotId: String) {
        guard let index = data.shots.firstIndex(where: { $0.id == shotId }),
              canManageShots(contentId: data.shots[index].contentId) else { return }
        data.shots[index].done.toggle()
        persist()
    }

    func deleteShots(contentId: String, at offsets: IndexSet) {
        guard canManageShots(contentId: contentId) else { return }
        let ordered = shots(for: contentId)
        let idsToDelete = Set(offsets.compactMap { ordered.indices.contains($0) ? ordered[$0].id : nil })
        data.shots.removeAll { idsToDelete.contains($0.id) }
        renumberShots(contentId: contentId, orderedIds: ordered.map(\.id).filter { !idsToDelete.contains($0) })
        persist()
    }

    func moveShots(contentId: String, from source: IndexSet, to destination: Int) {
        guard canManageShots(contentId: contentId) else { return }
        var ids = shots(for: contentId).map(\.id)
        ids.move(fromOffsets: source, toOffset: destination)
        renumberShots(contentId: contentId, orderedIds: ids)
        persist()
    }

    private func renumberShots(contentId: String, orderedIds: [String]) {
        for (position, id) in orderedIds.enumerated() {
            if let index = data.shots.firstIndex(where: { $0.id == id && $0.contentId == contentId }) {
                data.shots[index].order = position
            }
        }
    }

    // MARK: - Media

    func media(for contentId: String) -> [MediaAsset] {
        visibleMedia(data.media.filter { $0.contentId == contentId })
            .sorted { ($0.kind.rawValue, $1.version) < ($1.kind.rawValue, $0.version) }
    }

    private func mediaIndex(_ id: String) throws -> Int {
        guard let index = data.media.firstIndex(where: { $0.id == id }) else {
            throw DomainError.notFound("entity.media")
        }
        return index
    }

    /// Newest cut/final of a content – the only version that can be approved or rejected.
    func latestCut(for contentId: String) -> MediaAsset? {
        data.media
            .filter { $0.contentId == contentId && $0.kind.isReviewable }
            .max { $0.version < $1.version }
    }

    func isLatestCut(_ asset: MediaAsset) -> Bool {
        asset.kind.isReviewable && latestCut(for: asset.contentId)?.id == asset.id
    }

    /// Next version number. cut + final share one counter (DOMAIN_RULES: Medien).
    func nextMediaVersion(contentId: String, kind: MediaKind) -> Int {
        let siblings = data.media.filter { asset in
            guard asset.contentId == contentId else { return false }
            return kind.isReviewable ? asset.kind.isReviewable : asset.kind == kind
        }
        return (siblings.map(\.version).max() ?? 0) + 1
    }

    @discardableResult
    func addMedia(
        contentId: String,
        kind: MediaKind,
        fileName: String,
        mimeType: String?,
        sizeBytes: Int64?,
        durationSec: Double?,
        storageKey: String?
    ) throws -> MediaAsset {
        let content = try requireContent(contentId)
        try authorize(.mediaUpload, clientId: content.clientId)
        let name = Self.trimmed(fileName)
        guard !name.isEmpty else { throw DomainError.required("field.fileName") }
        let asset = MediaAsset(
            id: IDGenerator.make("m"),
            contentId: contentId,
            kind: kind,
            fileName: name,
            mimeType: mimeType.nilIfBlank,
            sizeBytes: sizeBytes.map { max(0, $0) },
            durationSec: durationSec.flatMap { $0.isFinite ? max(0, $0) : nil },
            version: nextMediaVersion(contentId: contentId, kind: kind),
            status: kind.isReviewable ? .inReview : .uploaded,
            storageKey: storageKey.nilIfBlank,
            uploadedById: data.workspace.currentUserId,
            uploadedAt: now(),
            comments: []
        )
        data.media.append(asset)
        if kind.isReviewable {
            advance(contentId: contentId, to: .cutReview)
        }
        let uploadEvent: ActivityEvent = kind.isReviewable ? .mediaUploadedCut : (kind == .thumbnail ? .mediaUploadedThumbnail : .mediaUploadedRaw)
        log(.uploaded, .media, asset.id, ActivityParams(uploadEvent, title: content.title, version: kind.isReviewable ? asset.version : nil, fileName: asset.fileName))
        persist()
        return asset
    }

    /// Copies a picked/imported video into app storage (off the main actor) and registers it.
    /// Note: in this MVP the file stays on the device; a real backend upload is an open point.
    @discardableResult
    func importVideo(contentId: String, kind: MediaKind, from url: URL, originalName: String) async throws -> MediaAsset {
        let content = try requireContent(contentId)
        try authorize(.mediaUpload, clientId: content.clientId)
        let info = await MediaInspector.inspect(url)
        var key: String? = nil
        if let persistence {
            key = try await Task.detached(priority: .userInitiated) {
                try persistence.importMedia(from: url, originalName: originalName)
            }.value
        }
        do {
            return try addMedia(
                contentId: contentId,
                kind: kind,
                fileName: originalName,
                mimeType: info.mimeType,
                sizeBytes: info.sizeBytes,
                durationSec: info.durationSec,
                storageKey: key
            )
        } catch {
            // Do not leave an orphaned file behind when the metadata could not be registered.
            if let key { persistence?.removeMedia(storageKey: key) }
            throw error
        }
    }

    func releaseForEdit(mediaId: String) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        let content = try requireContent(asset.contentId)
        try authorize(.mediaManage, clientId: content.clientId)
        guard asset.kind == .raw, asset.status == .uploaded else {
            throw DomainError("error.rawNotUploaded")
        }
        data.media[index].status = .readyForEdit
        advance(contentId: asset.contentId, to: .edit)
        log(.releasedForEdit, .media, mediaId, ActivityParams(.mediaReleased, title: content.title, fileName: asset.fileName))
        persist()
    }

    func startEdit(mediaId: String) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        let content = try requireContent(asset.contentId)
        try authorize(.mediaManage, clientId: content.clientId)
        guard asset.kind == .raw, asset.status == .readyForEdit else {
            throw DomainError("error.rawNotReleased")
        }
        data.media[index].status = .inEdit
        log(.updated, .media, mediaId, ActivityParams(.mediaEditStarted, title: content.title, fileName: asset.fileName))
        persist()
    }

    /// Shared checks for approve / request changes: permission, status, newest version.
    private func reviewableMedia(_ mediaId: String) throws -> (index: Int, asset: MediaAsset, content: ContentItem) {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        let content = try requireContent(asset.contentId)
        try authorize(.mediaReview, clientId: content.clientId)
        guard asset.kind.isReviewable, asset.status == .inReview else {
            throw DomainError("error.mediaNotInReview")
        }
        guard latestCut(for: asset.contentId)?.id == asset.id else {
            throw DomainError("error.notLatestVersion")
        }
        return (index, asset, content)
    }

    func approveMedia(mediaId: String) throws {
        let (index, asset, content) = try reviewableMedia(mediaId)
        data.media[index].status = .approved
        advance(contentId: asset.contentId, to: .scheduled)
        log(.approved, .media, mediaId, ActivityParams(.mediaApproved, title: content.title, version: asset.version, fileName: asset.fileName))
        persist()
    }

    func requestMediaChanges(mediaId: String, note: String) throws {
        let (index, asset, content) = try reviewableMedia(mediaId)
        let text = Self.trimmed(note)
        guard !text.isEmpty else { throw DomainError.noteRequired }
        let comment = ReviewComment(
            id: IDGenerator.make("rc"),
            authorId: data.workspace.currentUserId,
            text: text,
            timestampSec: nil,
            createdAt: now(),
            resolved: false
        )
        data.media[index].status = .changesRequested
        data.media[index].comments.append(comment)
        setStage(contentId: asset.contentId, to: .edit)
        log(.changesRequested, .media, mediaId, ActivityParams(.mediaChangesRequested, title: content.title, version: asset.version, fileName: asset.fileName))
        persist()
    }

    /// Comment permission incl. the rule that users without `media.viewRaw` never touch raw footage.
    private func authorizeComment(on asset: MediaAsset) throws -> ContentItem {
        let content = try requireContent(asset.contentId)
        try authorize(.mediaComment, clientId: content.clientId)
        if asset.kind == .raw {
            try authorize(.mediaViewRaw, clientId: content.clientId)
        }
        return content
    }

    func addComment(mediaId: String, text: String, timestampSec: Double?) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        let content = try authorizeComment(on: asset)
        let body = Self.trimmed(text)
        guard !body.isEmpty else { throw DomainError.required("field.comment") }
        var stamp: Double? = nil
        if let value = timestampSec, value.isFinite {
            var rounded = max(0, (value * 10).rounded() / 10)
            if let duration = asset.durationSec { rounded = min(rounded, duration) }
            stamp = rounded
        }
        let comment = ReviewComment(
            id: IDGenerator.make("rc"),
            authorId: data.workspace.currentUserId,
            text: body,
            timestampSec: stamp,
            createdAt: now(),
            resolved: false
        )
        data.media[index].comments.append(comment)
        log(.commented, .media, mediaId, ActivityParams(.mediaCommented, title: content.title, fileName: asset.fileName))
        persist()
    }

    func toggleCommentResolved(mediaId: String, commentId: String) {
        guard let mIndex = data.media.firstIndex(where: { $0.id == mediaId }),
              (try? authorizeComment(on: data.media[mIndex])) != nil,
              let cIndex = data.media[mIndex].comments.firstIndex(where: { $0.id == commentId }) else { return }
        data.media[mIndex].comments[cIndex].resolved.toggle()
        persist()
    }

    // MARK: - Approvals inbox (DOMAIN_RULES: Freigaben-Eingang)

    /// Current scripts in review, oldest first.
    var pendingScriptApprovals: [Script] {
        scopedContents
            .compactMap { currentScript(for: $0.id) }
            .filter { $0.status == .inReview }
            .sorted { $0.updatedAt < $1.updatedAt }
    }

    /// Newest cut/final per content if it is in review, oldest first.
    var pendingMediaApprovals: [MediaAsset] {
        scopedContents
            .compactMap { latestCut(for: $0.id) }
            .filter { $0.status == .inReview }
            .sorted { $0.uploadedAt < $1.uploadedAt }
    }

    /// Scripts and cuts together, oldest first.
    var approvalInbox: [ApprovalItem] {
        let items = pendingScriptApprovals.map(ApprovalItem.script) + pendingMediaApprovals.map(ApprovalItem.media)
        return items.sorted { $0.since < $1.since }
    }

    var pendingApprovalCount: Int { pendingScriptApprovals.count + pendingMediaApprovals.count }

    // MARK: - Shoots

    @discardableResult
    func saveShoot(_ draft: Shoot) throws -> Shoot {
        let existingIndex = data.shoots.firstIndex { $0.id == draft.id }
        guard data.clients.contains(where: { $0.id == draft.clientId }) else { throw DomainError.notFound("entity.client") }
        try authorize(.shootManage, clientId: existingIndex.map { data.shoots[$0].clientId } ?? draft.clientId)
        let title = Self.trimmed(draft.title)
        guard !title.isEmpty else { throw DomainError.required("field.title") }
        let locationName = Self.trimmed(draft.location.name)
        guard !locationName.isEmpty else { throw DomainError.required("field.location") }
        guard DateUtils.date(fromDay: draft.date) != nil,
              DateUtils.date(fromTime: draft.startTime) != nil,
              DateUtils.date(fromTime: draft.endTime) != nil else {
            throw DomainError("error.invalidDate")
        }
        guard draft.startTime <= draft.endTime else {
            throw DomainError("error.timeOrder")
        }
        // Only existing contents of the same client can be linked – never dropped silently.
        let contentIds = Self.unique(draft.contentIds)
        for id in contentIds {
            let content = try requireContent(id)
            guard content.clientId == draft.clientId else {
                throw DomainError("error.otherClient", ["title": content.title])
            }
        }

        var shoot = draft
        shoot.title = title
        shoot.location.name = locationName
        shoot.location.address = draft.location.address.nilIfBlank
        shoot.location.notes = draft.location.notes.nilIfBlank
        shoot.contentIds = contentIds
        shoot.teamIds = Self.unique(draft.teamIds).filter { member($0) != nil }
        shoot.equipment = Self.unique(draft.equipment.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        shoot.schedule = draft.schedule
            .map { CallSheetEntry(time: $0.time, label: $0.label.trimmingCharacters(in: .whitespaces)) }
            .filter { !$0.label.isEmpty && DateUtils.date(fromTime: $0.time) != nil }
            .sorted { $0.time < $1.time }
        shoot.notes = draft.notes.nilIfBlank

        let isNew = existingIndex == nil
        if let existingIndex {
            data.shoots[existingIndex] = shoot
        } else {
            shoot.id = IDGenerator.make("sh")
            data.shoots.append(shoot)
        }
        linkContents(shootId: shoot.id, contentIds: shoot.contentIds)

        log(isNew ? .created : .updated, .shoot, shoot.id, isNew ? ActivityParams(.shootCreated, title: shoot.title, date: shoot.date) : ActivityParams(.shootUpdated, title: shoot.title))
        persist()
        return shoot
    }

    /// Keeps Content.shootId and Shoot.contentIds consistent (a content belongs to at most one shoot).
    private func linkContents(shootId: String, contentIds: [String]) {
        let wanted = Set(contentIds)
        for index in data.shoots.indices where data.shoots[index].id != shootId {
            data.shoots[index].contentIds.removeAll { wanted.contains($0) }
        }
        let timestamp = now()
        for index in data.contents.indices {
            let linked = wanted.contains(data.contents[index].id)
            if linked && data.contents[index].shootId != shootId {
                data.contents[index].shootId = shootId
                data.contents[index].updatedAt = timestamp
            } else if !linked && data.contents[index].shootId == shootId {
                data.contents[index].shootId = nil
                data.contents[index].updatedAt = timestamp
            }
        }
    }

    func deleteShoot(_ shootId: String) throws {
        guard let removed = rawShoot(shootId) else { throw DomainError.notFound("entity.shoot") }
        try authorize(.shootManage, clientId: removed.clientId)
        linkContents(shootId: shootId, contentIds: [])
        data.shoots.removeAll { $0.id == shootId }
        // Activity entries pointing to a deleted shoot would break referential integrity.
        data.activity.removeAll { $0.targetType == .shoot && $0.targetId == shootId }
        // Same as the web app: the deletion itself is logged against the client.
        log(.updated, .client, removed.clientId, ActivityParams(.shootDeleted, title: removed.title))
        persist()
    }

    static func newShootDraft(clientId: String, date: Date = Date()) -> Shoot {
        Shoot(
            id: "new",
            clientId: clientId,
            title: "",
            date: DateUtils.dayString(from: date),
            startTime: "09:00",
            endTime: "13:00",
            status: .planned,
            location: ShootLocation(name: "", address: nil, notes: nil),
            teamIds: [],
            contentIds: [],
            equipment: [],
            schedule: [],
            notes: nil
        )
    }
}

extension Optional where Wrapped == String {
    /// Trimmed value, or nil when empty / whitespace only.
    var nilIfBlank: String? {
        guard let value = self?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
