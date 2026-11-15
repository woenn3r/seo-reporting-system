import Foundation
import Observation

/// Errors for workflow actions that violate apps/social-studio/DOMAIN_RULES.md.
enum DomainError: LocalizedError, Equatable {
    case notFound(String)
    case invalidTransition(String)
    case noteRequired
    case notAllowed(String)
    case invalidInput(String)

    var errorDescription: String? {
        switch self {
        case .notFound(let what): return "\(what) wurde nicht gefunden."
        case .invalidTransition(let reason): return reason
        case .noteRequired: return "Bitte beschreibe, was geändert werden soll."
        case .notAllowed(let reason): return reason
        case .invalidInput(let reason): return reason
        }
    }
}

/// Single source of state for the app. All workflow transitions live here and mirror
/// apps/social-studio/DOMAIN_RULES.md (and web/src/domain/actions.ts).
@MainActor
@Observable
final class WorkspaceStore {
    private(set) var data: Workspace
    /// nil = "Alle Kunden"
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
            let persistence = try Persistence.standard()
            if let saved = try persistence.load() {
                return WorkspaceStore(data: saved, persistence: persistence)
            }
            let seed = try Persistence.loadSeed()
            let store = WorkspaceStore(data: seed, persistence: persistence)
            store.persist()
            return store
        } catch {
            // Fall back to the seed in memory so the app stays usable; surface the error.
            let fallback = (try? Persistence.loadSeed()) ?? WorkspaceStore.emptyWorkspace()
            let store = WorkspaceStore(data: fallback, persistence: try? Persistence.standard())
            store.lastError = "Gespeicherte Daten konnten nicht geladen werden: \(error.localizedDescription)"
            return store
        }
    }

    static func emptyWorkspace() -> Workspace {
        Workspace(
            schemaVersion: 1,
            workspace: WorkspaceInfo(id: "ws_local", name: "Agentur", currentUserId: "u_local"),
            team: [TeamMember(id: "u_local", name: "Ich", role: .lead, email: nil, clientId: nil)],
            clients: [], contents: [], scripts: [], shots: [], shoots: [], media: [], activity: []
        )
    }

    // MARK: - Error handling helper for views

    /// Runs an action and turns thrown errors into `lastError`. Returns true on success.
    @discardableResult
    func perform(_ action: () throws -> Void) -> Bool {
        do {
            try action()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    // MARK: - Persistence

    private func persist() {
        guard let persistence else { return }
        do {
            try persistence.save(data)
        } catch {
            lastError = "Speichern fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    func resetDemoData() throws {
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

    // MARK: - Current user & visibility (DOMAIN_RULES: Rollen & Sichtbarkeit)

    var currentUser: TeamMember? {
        data.team.first { $0.id == data.workspace.currentUserId }
    }

    var isClientUser: Bool { currentUser?.role == .client }

    /// Clients cannot see raw footage.
    var canSeeRawMedia: Bool { !isClientUser }
    /// Clients cannot see brandNotes and shot notes.
    var canSeeInternalNotes: Bool { !isClientUser }
    /// Upload / planning actions are agency-only.
    var canEditProduction: Bool { !isClientUser }

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

    func client(_ id: String) -> Client? { data.clients.first { $0.id == id } }
    func member(_ id: String) -> TeamMember? { data.team.first { $0.id == id } }
    func content(_ id: String) -> ContentItem? { data.contents.first { $0.id == id } }
    func shoot(_ id: String) -> Shoot? { data.shoots.first { $0.id == id } }
    func script(_ id: String) -> Script? { data.scripts.first { $0.id == id } }
    func mediaAsset(_ id: String) -> MediaAsset? { data.media.first { $0.id == id } }

    var agencyTeam: [TeamMember] { data.team.filter { $0.role != .client } }

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

    var scopedActivity: [Activity] {
        let contentIds = Set(scopedContents.map(\.id))
        let scriptIds = Set(data.scripts.filter { contentIds.contains($0.contentId) }.map(\.id))
        let mediaIds = Set(visibleMedia(data.media).filter { contentIds.contains($0.contentId) }.map(\.id))
        let shootIds = Set(scopedShoots.map(\.id))
        let clientIds = scopedClientIds
        return data.activity
            .filter { activity in
                switch activity.targetType {
                case .content: return contentIds.contains(activity.targetId)
                case .script: return scriptIds.contains(activity.targetId)
                case .media: return mediaIds.contains(activity.targetId)
                case .shoot: return shootIds.contains(activity.targetId)
                case .client: return clientIds.contains(activity.targetId)
                }
            }
            .sorted { $0.at > $1.at }
    }

    private func visibleMedia(_ assets: [MediaAsset]) -> [MediaAsset] {
        canSeeRawMedia ? assets : assets.filter { $0.kind != .raw }
    }

    // MARK: - Activity

    private func log(_ kind: ActivityKind, _ target: ActivityTarget, _ targetId: String, _ message: String) {
        let entry = Activity(
            id: IDGenerator.make("a"),
            actorId: data.workspace.currentUserId,
            kind: kind,
            targetType: target,
            targetId: targetId,
            message: message,
            at: now()
        )
        data.activity.insert(entry, at: 0)
    }

    // MARK: - Content & pipeline

    private func contentIndex(_ id: String) throws -> Int {
        guard let index = data.contents.firstIndex(where: { $0.id == id }) else {
            throw DomainError.notFound("Content")
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

    /// Explicit step back ("Änderungen angefordert").
    private func setStage(contentId: String, to stage: Stage) {
        guard let index = data.contents.firstIndex(where: { $0.id == contentId }) else { return }
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
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DomainError.invalidInput("Bitte einen Titel angeben.") }
        guard !platforms.isEmpty else { throw DomainError.invalidInput("Bitte mindestens eine Plattform wählen.") }
        guard client(clientId) != nil else { throw DomainError.notFound("Kunde") }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Content anlegen.") }
        var uniquePlatforms: [Platform] = []
        for platform in platforms where !uniquePlatforms.contains(platform) {
            uniquePlatforms.append(platform)
        }
        let timestamp = now()
        let item = ContentItem(
            id: IDGenerator.make("ct"),
            clientId: clientId,
            title: trimmed,
            format: format,
            platforms: uniquePlatforms,
            stage: .idea,
            pillar: pillar.nilIfBlank,
            brief: brief.nilIfBlank,
            assigneeIds: Array(Set(assigneeIds)).sorted(),
            dueDate: dueDate,
            publishAt: nil,
            shootId: nil,
            createdAt: timestamp,
            updatedAt: timestamp
        )
        data.contents.append(item)
        log(.created, .content, item.id, "hat „\(item.title)“ angelegt")
        persist()
        return item
    }

    func updateContent(_ updated: ContentItem) throws {
        let index = try contentIndex(updated.id)
        guard !updated.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DomainError.invalidInput("Bitte einen Titel angeben.")
        }
        guard !updated.platforms.isEmpty else {
            throw DomainError.invalidInput("Bitte mindestens eine Plattform wählen.")
        }
        var copy = updated
        copy.updatedAt = now()
        data.contents[index] = copy
        log(.updated, .content, copy.id, "hat „\(copy.title)“ bearbeitet")
        persist()
    }

    /// Manual stage change – allowed in any direction (DOMAIN_RULES: Pipeline).
    func moveStage(contentId: String, to stage: Stage) throws {
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann die Pipeline ändern.") }
        let index = try contentIndex(contentId)
        guard data.contents[index].stage != stage else { return }
        data.contents[index].stage = stage
        data.contents[index].updatedAt = now()
        log(.stageChanged, .content, contentId, "hat „\(data.contents[index].title)“ nach „\(stage.label)“ verschoben")
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
            throw DomainError.notFound("Skript")
        }
        return index
    }

    private func contentTitle(_ contentId: String) -> String {
        content(contentId)?.title ?? "Content"
    }

    @discardableResult
    func createScript(contentId: String) throws -> Script {
        _ = try contentIndex(contentId)
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Skripte anlegen.") }
        if let existing = currentScript(for: contentId) {
            throw DomainError.invalidTransition("Es gibt bereits ein Skript (v\(existing.version)). Lege stattdessen eine neue Version an.")
        }
        let script = Script(
            id: IDGenerator.make("sc"),
            contentId: contentId,
            version: 1,
            status: .draft,
            hook: "",
            scenes: [ScriptScene(id: "s1", title: "Hook", voiceover: nil, onScreenText: nil, visual: nil, durationSec: nil)],
            caption: nil,
            hashtags: [],
            cta: nil,
            reviewNote: nil,
            updatedAt: now()
        )
        data.scripts.append(script)
        advance(contentId: contentId, to: .script)
        log(.created, .script, script.id, "hat ein Skript für „\(contentTitle(contentId))“ angelegt")
        persist()
        return script
    }

    /// Editing is only allowed for draft / changes_requested.
    func updateScript(_ updated: Script) throws {
        let index = try scriptIndex(updated.id)
        let existing = data.scripts[index]
        guard existing.isEditable else {
            throw DomainError.invalidTransition("Dieses Skript ist \(existing.status.label.lowercased()). Lege eine neue Version an, um es zu ändern.")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Skripte bearbeiten.") }
        let invalidTags = (updated.hashtags ?? []).filter { !Self.isValidHashtag($0) }
        guard invalidTags.isEmpty else {
            throw DomainError.invalidInput("Ungültige Hashtags: \(invalidTags.joined(separator: ", ")) (Format: #wort, ohne Leerzeichen)")
        }
        var copy = updated
        // Identity, version and status are not editable here.
        copy.id = existing.id
        copy.contentId = existing.contentId
        copy.version = existing.version
        copy.status = existing.status
        copy.updatedAt = now()
        data.scripts[index] = copy
        log(.updated, .script, copy.id, "hat das Skript „\(contentTitle(copy.contentId))“ bearbeitet")
        persist()
    }

    static func isValidHashtag(_ tag: String) -> Bool {
        tag.count > 1 && tag.hasPrefix("#") && !tag.contains(where: { $0.isWhitespace })
    }

    /// Parses free text ("#a #b, c") into contract-valid hashtags.
    static func parseHashtags(_ text: String) -> [String] {
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ","))
        var result: [String] = []
        for raw in text.components(separatedBy: separators) where !raw.isEmpty {
            let tag = raw.hasPrefix("#") ? raw : "#\(raw)"
            if isValidHashtag(tag) && !result.contains(tag) { result.append(tag) }
        }
        return result
    }

    @discardableResult
    func newScriptVersion(scriptId: String) throws -> Script {
        let index = try scriptIndex(scriptId)
        let source = data.scripts[index]
        guard source.status == .approved || source.status == .inReview else {
            throw DomainError.invalidTransition("Eine neue Version ist nur aus „Freigegeben“ oder „In Freigabe“ möglich.")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann neue Versionen anlegen.") }
        let latest = currentScript(for: source.contentId)?.version ?? source.version
        var next = source
        next.id = IDGenerator.make("sc")
        next.version = latest + 1
        next.status = .draft
        next.reviewNote = nil
        next.updatedAt = now()
        data.scripts.append(next)
        log(.created, .script, next.id, "hat Version \(next.version) des Skripts „\(contentTitle(next.contentId))“ angelegt")
        persist()
        return next
    }

    func submitScript(scriptId: String) throws {
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        guard script.isEditable else {
            throw DomainError.invalidTransition("Nur Entwürfe oder Skripte mit Änderungswunsch können eingereicht werden.")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Skripte einreichen.") }
        data.scripts[index].status = .inReview
        data.scripts[index].updatedAt = now()
        advance(contentId: script.contentId, to: .scriptReview)
        log(.submitted, .script, scriptId, "hat das Skript „\(contentTitle(script.contentId))“ zur Freigabe eingereicht")
        persist()
    }

    func approveScript(scriptId: String) throws {
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        guard script.status == .inReview else {
            throw DomainError.invalidTransition("Nur Skripte „In Freigabe“ können freigegeben werden.")
        }
        data.scripts[index].status = .approved
        data.scripts[index].reviewNote = nil
        data.scripts[index].updatedAt = now()
        advance(contentId: script.contentId, to: .shoot)
        log(.approved, .script, scriptId, "hat das Skript „\(contentTitle(script.contentId))“ freigegeben")
        persist()
    }

    func requestScriptChanges(scriptId: String, note: String) throws {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DomainError.noteRequired }
        let index = try scriptIndex(scriptId)
        let script = data.scripts[index]
        guard script.status == .inReview else {
            throw DomainError.invalidTransition("Änderungen können nur für Skripte „In Freigabe“ angefordert werden.")
        }
        data.scripts[index].status = .changesRequested
        data.scripts[index].reviewNote = trimmed
        data.scripts[index].updatedAt = now()
        setStage(contentId: script.contentId, to: .script)
        log(.changesRequested, .script, scriptId, "hat Änderungen am Skript „\(contentTitle(script.contentId))“ angefordert")
        persist()
    }

    // MARK: - Shots (Perspektiven)

    func shots(for contentId: String) -> [Shot] {
        data.shots.filter { $0.contentId == contentId }.sorted { $0.order < $1.order }
    }

    @discardableResult
    func addShot(contentId: String, draft: Shot) throws -> Shot {
        _ = try contentIndex(contentId)
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Shots planen.") }
        guard !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DomainError.invalidInput("Bitte den Shot beschreiben.")
        }
        var shot = draft
        shot.id = IDGenerator.make("shot")
        shot.contentId = contentId
        shot.order = (shots(for: contentId).map(\.order).max() ?? -1) + 1
        data.shots.append(shot)
        persist()
        return shot
    }

    func updateShot(_ updated: Shot) throws {
        guard let index = data.shots.firstIndex(where: { $0.id == updated.id }) else {
            throw DomainError.notFound("Shot")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Shots bearbeiten.") }
        guard !updated.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DomainError.invalidInput("Bitte den Shot beschreiben.")
        }
        var copy = updated
        copy.contentId = data.shots[index].contentId
        copy.order = data.shots[index].order
        data.shots[index] = copy
        persist()
    }

    func toggleShotDone(_ shotId: String) {
        guard canEditProduction, let index = data.shots.firstIndex(where: { $0.id == shotId }) else { return }
        data.shots[index].done.toggle()
        persist()
    }

    func deleteShots(contentId: String, at offsets: IndexSet) {
        guard canEditProduction else { return }
        let ordered = shots(for: contentId)
        let idsToDelete = Set(offsets.compactMap { ordered.indices.contains($0) ? ordered[$0].id : nil })
        data.shots.removeAll { idsToDelete.contains($0.id) }
        renumberShots(contentId: contentId, orderedIds: ordered.map(\.id).filter { !idsToDelete.contains($0) })
        persist()
    }

    func moveShots(contentId: String, from source: IndexSet, to destination: Int) {
        guard canEditProduction else { return }
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
            throw DomainError.notFound("Datei")
        }
        return index
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
        _ = try contentIndex(contentId)
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Dateien hochladen.") }
        let name = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { throw DomainError.invalidInput("Dateiname fehlt.") }
        let asset = MediaAsset(
            id: IDGenerator.make("m"),
            contentId: contentId,
            kind: kind,
            fileName: name,
            mimeType: mimeType,
            sizeBytes: sizeBytes.map { max(0, $0) },
            durationSec: durationSec.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil },
            version: nextMediaVersion(contentId: contentId, kind: kind),
            status: kind.isReviewable ? .inReview : .uploaded,
            storageKey: storageKey,
            uploadedById: data.workspace.currentUserId,
            uploadedAt: now(),
            comments: []
        )
        data.media.append(asset)
        if kind.isReviewable {
            advance(contentId: contentId, to: .cutReview)
        }
        log(.uploaded, .media, asset.id, "hat \(kind.label) v\(asset.version) „\(contentTitle(contentId))“ hochgeladen")
        persist()
        return asset
    }

    /// Copies a picked/imported video into app storage and registers it (DOMAIN_RULES: Hochladen).
    /// Note: in this MVP the file stays on the device; a real backend upload is an open point.
    @discardableResult
    func importVideo(contentId: String, kind: MediaKind, from url: URL, originalName: String) async throws -> MediaAsset {
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Dateien hochladen.") }
        _ = try contentIndex(contentId)
        let info = await MediaInspector.inspect(url)
        let key = try persistence?.importMedia(from: url, originalName: originalName)
        return try addMedia(
            contentId: contentId,
            kind: kind,
            fileName: originalName,
            mimeType: info.mimeType,
            sizeBytes: info.sizeBytes,
            durationSec: info.durationSec,
            storageKey: key
        )
    }

    func releaseForEdit(mediaId: String) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        guard asset.kind == .raw, asset.status == .uploaded else {
            throw DomainError.invalidTransition("Nur hochgeladenes Rohmaterial kann zum Schnitt freigegeben werden.")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Material freigeben.") }
        data.media[index].status = .readyForEdit
        advance(contentId: asset.contentId, to: .edit)
        log(.releasedForEdit, .media, mediaId, "hat Rohmaterial „\(contentTitle(asset.contentId))“ zum Schnitt freigegeben")
        persist()
    }

    func startEdit(mediaId: String) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        guard asset.kind == .raw, asset.status == .readyForEdit else {
            throw DomainError.invalidTransition("Der Schnitt kann nur für freigegebenes Rohmaterial gestartet werden.")
        }
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann den Schnitt starten.") }
        data.media[index].status = .inEdit
        log(.updated, .media, mediaId, "hat den Schnitt für „\(contentTitle(asset.contentId))“ gestartet")
        persist()
    }

    func approveMedia(mediaId: String) throws {
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        guard asset.kind.isReviewable, asset.status == .inReview else {
            throw DomainError.invalidTransition("Nur Schnitte „In Freigabe“ können freigegeben werden.")
        }
        data.media[index].status = .approved
        advance(contentId: asset.contentId, to: .scheduled)
        log(.approved, .media, mediaId, "hat \(asset.kind.label) v\(asset.version) „\(contentTitle(asset.contentId))“ freigegeben")
        persist()
    }

    func requestMediaChanges(mediaId: String, note: String) throws {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DomainError.noteRequired }
        let index = try mediaIndex(mediaId)
        let asset = data.media[index]
        guard asset.kind.isReviewable, asset.status == .inReview else {
            throw DomainError.invalidTransition("Änderungen können nur für Schnitte „In Freigabe“ angefordert werden.")
        }
        let comment = ReviewComment(
            id: IDGenerator.make("rc"),
            authorId: data.workspace.currentUserId,
            text: trimmed,
            timestampSec: nil,
            createdAt: now(),
            resolved: false
        )
        data.media[index].status = .changesRequested
        data.media[index].comments.append(comment)
        setStage(contentId: asset.contentId, to: .edit)
        log(.changesRequested, .media, mediaId, "hat Änderungen an \(asset.kind.label) v\(asset.version) „\(contentTitle(asset.contentId))“ angefordert")
        persist()
    }

    func addComment(mediaId: String, text: String, timestampSec: Double?) throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DomainError.invalidInput("Kommentar ist leer.") }
        let index = try mediaIndex(mediaId)
        if data.media[index].kind == .raw && !canSeeRawMedia {
            throw DomainError.notAllowed("Kein Zugriff auf Rohmaterial.")
        }
        var stamp = timestampSec.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
        if let duration = data.media[index].durationSec, let value = stamp {
            stamp = min(value, duration)
        }
        let comment = ReviewComment(
            id: IDGenerator.make("rc"),
            authorId: data.workspace.currentUserId,
            text: trimmed,
            timestampSec: stamp,
            createdAt: now(),
            resolved: false
        )
        data.media[index].comments.append(comment)
        log(.commented, .media, mediaId, "hat \(data.media[index].kind.label) v\(data.media[index].version) kommentiert")
        persist()
    }

    func toggleCommentResolved(mediaId: String, commentId: String) {
        guard let mIndex = data.media.firstIndex(where: { $0.id == mediaId }),
              let cIndex = data.media[mIndex].comments.firstIndex(where: { $0.id == commentId }) else { return }
        data.media[mIndex].comments[cIndex].resolved.toggle()
        persist()
    }

    // MARK: - Approvals inbox (DOMAIN_RULES: Freigaben-Eingang)

    var pendingScriptApprovals: [Script] {
        let contentIds = Set(scopedContents.map(\.id))
        return data.scripts
            .filter { $0.status == .inReview && contentIds.contains($0.contentId) }
            .filter { currentScript(for: $0.contentId)?.id == $0.id }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    var pendingMediaApprovals: [MediaAsset] {
        let contentIds = Set(scopedContents.map(\.id))
        return data.media
            .filter { $0.kind.isReviewable && $0.status == .inReview && contentIds.contains($0.contentId) }
            .filter { asset in
                let newest = data.media
                    .filter { $0.contentId == asset.contentId && $0.kind.isReviewable }
                    .map(\.version)
                    .max()
                return newest == asset.version
            }
            .sorted { $0.uploadedAt > $1.uploadedAt }
    }

    var pendingApprovalCount: Int { pendingScriptApprovals.count + pendingMediaApprovals.count }

    // MARK: - Shoots

    @discardableResult
    func saveShoot(_ draft: Shoot) throws -> Shoot {
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Drehs planen.") }
        guard !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DomainError.invalidInput("Bitte einen Titel für den Dreh angeben.")
        }
        guard !draft.location.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DomainError.invalidInput("Bitte einen Drehort angeben.")
        }
        guard DateUtils.date(fromDay: draft.date) != nil,
              DateUtils.date(fromTime: draft.startTime) != nil,
              DateUtils.date(fromTime: draft.endTime) != nil else {
            throw DomainError.invalidInput("Datum oder Uhrzeit ist ungültig.")
        }
        guard draft.startTime <= draft.endTime else {
            throw DomainError.invalidInput("Das Ende muss nach dem Beginn liegen.")
        }
        guard client(draft.clientId) != nil else { throw DomainError.notFound("Kunde") }

        var shoot = draft
        // Only contents of the same client can be linked (contract test: referential integrity).
        shoot.contentIds = draft.contentIds.filter { id in content(id)?.clientId == draft.clientId }
        shoot.contentIds = shoot.contentIds.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        shoot.teamIds = draft.teamIds.reduce(into: [String]()) { if !$0.contains($1) && member($1) != nil { $0.append($1) } }
        shoot.equipment = draft.equipment.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        shoot.schedule = draft.schedule
            .filter { !$0.label.trimmingCharacters(in: .whitespaces).isEmpty && DateUtils.date(fromTime: $0.time) != nil }
            .sorted { $0.time < $1.time }
        shoot.notes = draft.notes.nilIfBlank
        shoot.location.address = draft.location.address.nilIfBlank
        shoot.location.notes = draft.location.notes.nilIfBlank

        let isNew = !data.shoots.contains { $0.id == shoot.id }
        if isNew {
            shoot.id = IDGenerator.make("sh")
            data.shoots.append(shoot)
        } else if let index = data.shoots.firstIndex(where: { $0.id == shoot.id }) {
            data.shoots[index] = shoot
        }

        // Keep Content.shootId and Shoot.contentIds in sync (both directions).
        for index in data.contents.indices {
            let contentId = data.contents[index].id
            let linked = shoot.contentIds.contains(contentId)
            if linked {
                if let previous = data.contents[index].shootId, previous != shoot.id,
                   let pIndex = data.shoots.firstIndex(where: { $0.id == previous }) {
                    data.shoots[pIndex].contentIds.removeAll { $0 == contentId }
                }
                data.contents[index].shootId = shoot.id
            } else if data.contents[index].shootId == shoot.id {
                data.contents[index].shootId = nil
            }
        }

        log(isNew ? .created : .updated, .shoot, shoot.id, isNew ? "hat den Dreh „\(shoot.title)“ geplant" : "hat den Dreh „\(shoot.title)“ aktualisiert")
        persist()
        return shoot
    }

    func deleteShoot(_ shootId: String) throws {
        guard canEditProduction else { throw DomainError.notAllowed("Nur die Agentur kann Drehs löschen.") }
        guard data.shoots.contains(where: { $0.id == shootId }) else { throw DomainError.notFound("Dreh") }
        data.shoots.removeAll { $0.id == shootId }
        for index in data.contents.indices where data.contents[index].shootId == shootId {
            data.contents[index].shootId = nil
        }
        // Activity entries pointing to a deleted shoot would break referential integrity.
        data.activity.removeAll { $0.targetType == .shoot && $0.targetId == shootId }
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
