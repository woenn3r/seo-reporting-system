import Foundation

// MARK: - JSON coding (contract: dateTime = ISO 8601, emitted in UTC with "Z")

enum WorkspaceCoding {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = parseDateTime(string) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Ungültiges ISO-8601-Datum: \(string)"
            )
        }
        return decoder
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatDateTime(date))
        }
        return encoder
    }

    /// Accepts ISO 8601 with and without fractional seconds and with "Z" or numeric offsets.
    static func parseDateTime(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: string)
    }

    /// Always UTC with "Z", whole seconds (matches the seed data format).
    static func formatDateTime(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}

// MARK: - Storage

enum PersistenceError: LocalizedError {
    case seedMissing
    case mediaImportFailed(String)
    /// Stored data decoded but is not consistent (DOMAIN_RULES: Datenintegrität).
    case inconsistent(String)

    var errorDescription: String? {
        switch self {
        case .seedMissing:
            return L10n.t("ios.error.seedMissing")
        case .mediaImportFailed(let reason):
            return L10n.t("ios.error.mediaImport", ["reason": reason])
        case .inconsistent(let detail):
            return L10n.t("ios.error.inconsistent", ["detail": detail])
        }
    }
}

/// Stores the workspace as JSON in Application Support and media files in
/// Application Support/SocialStudio/Media. `storageKey` = file name inside that folder.
struct Persistence: Sendable {
    let baseURL: URL

    var workspaceURL: URL { baseURL.appendingPathComponent("workspace.json") }
    var mediaDirectory: URL { baseURL.appendingPathComponent("Media", isDirectory: true) }

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    static func standard() throws -> Persistence {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let base = support.appendingPathComponent("SocialStudio", isDirectory: true)
        let persistence = Persistence(baseURL: base)
        try persistence.ensureDirectories()
        return persistence
    }

    func ensureDirectories() throws {
        try FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: mediaDirectory, withIntermediateDirectories: true)
    }

    /// Returns `nil` when nothing has been saved yet (first launch).
    /// Throws when the file cannot be decoded (corrupt, newer contract) or fails the integrity check.
    func load() throws -> Workspace? {
        guard FileManager.default.fileExists(atPath: workspaceURL.path) else { return nil }
        let data = try Data(contentsOf: workspaceURL)
        let workspace = try WorkspaceCoding.decoder().decode(Workspace.self, from: data)
        if let problem = WorkspaceIntegrity.errors(in: workspace).first {
            throw PersistenceError.inconsistent(problem)
        }
        return workspace
    }

    /// Moves an unreadable workspace file aside so it is never overwritten.
    /// Returns the new file name, or nil if there was nothing to move.
    @discardableResult
    func quarantineUnreadableWorkspace(now: Date = Date()) throws -> String? {
        let fm = FileManager.default
        guard fm.fileExists(atPath: workspaceURL.path) else { return nil }
        let stamp = Int(now.timeIntervalSince1970)
        var name = "workspace.unreadable-\(stamp).json"
        var counter = 1
        while fm.fileExists(atPath: baseURL.appendingPathComponent(name).path) {
            counter += 1
            name = "workspace.unreadable-\(stamp)-\(counter).json"
        }
        try fm.moveItem(at: workspaceURL, to: baseURL.appendingPathComponent(name))
        return name
    }

    func save(_ workspace: Workspace) throws {
        try ensureDirectories()
        let data = try WorkspaceCoding.encoder().encode(workspace)
        try data.write(to: workspaceURL, options: [.atomic])
    }

    /// Deletes saved workspace and all imported media.
    func reset() throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: workspaceURL.path) {
            try fm.removeItem(at: workspaceURL)
        }
        if fm.fileExists(atPath: mediaDirectory.path) {
            try fm.removeItem(at: mediaDirectory)
        }
        try ensureDirectories()
    }

    /// Copies a file into the media folder and returns its storage key.
    func importMedia(from source: URL, originalName: String) throws -> String {
        try ensureDirectories()
        let ext = (originalName as NSString).pathExtension
        let base = IDGenerator.make("file")
        let key = ext.isEmpty ? base : "\(base).\(ext.lowercased())"
        let destination = mediaDirectory.appendingPathComponent(key)
        do {
            try FileManager.default.copyItem(at: source, to: destination)
        } catch {
            throw PersistenceError.mediaImportFailed(error.localizedDescription)
        }
        return key
    }

    /// Removes a stored media file (no-op for unknown keys).
    func removeMedia(storageKey: String) {
        guard let url = mediaURL(for: storageKey) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// URL of a stored media file, or nil if the key is unknown / file missing.
    func mediaURL(for storageKey: String) -> URL? {
        // Guard against path traversal: keys are plain file names.
        guard !storageKey.isEmpty, !storageKey.contains("/"), !storageKey.contains("..") else { return nil }
        let url = mediaDirectory.appendingPathComponent(storageKey)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: Seed

    static func loadSeed(bundle: Bundle = .main) throws -> Workspace {
        guard let url = bundle.url(forResource: "workspace", withExtension: "json") else {
            throw PersistenceError.seedMissing
        }
        let data = try Data(contentsOf: url)
        return try WorkspaceCoding.decoder().decode(Workspace.self, from: data)
    }
}
