import Foundation

// Codable models 1:1 to contracts/social_studio/v1.schema.json (camelCase keys).
// Contract fields with `date` (yyyy-MM-dd) and `time` (HH:mm) patterns stay `String`
// so that round-tripping never changes their representation. `dateTime` fields are `Date`
// and are coded via `WorkspaceCoding` (ISO 8601, UTC, "Z").

// MARK: - Root

struct Workspace: Codable, Equatable {
    var schemaVersion: Int
    var workspace: WorkspaceInfo
    var team: [TeamMember]
    var clients: [Client]
    var contents: [ContentItem]
    var scripts: [Script]
    var shots: [Shot]
    var shoots: [Shoot]
    var media: [MediaAsset]
    var activity: [Activity]
}

struct WorkspaceInfo: Codable, Equatable {
    var id: String
    var name: String
    var currentUserId: String
}

// MARK: - Enums

enum Platform: String, Codable, CaseIterable, Identifiable {
    case instagram, tiktok, youtube, linkedin, facebook, pinterest
    var id: String { rawValue }
    var label: String {
        switch self {
        case .instagram: return "Instagram"
        case .tiktok: return "TikTok"
        case .youtube: return "YouTube"
        case .linkedin: return "LinkedIn"
        case .facebook: return "Facebook"
        case .pinterest: return "Pinterest"
        }
    }
}

enum ContentFormat: String, Codable, CaseIterable, Identifiable {
    case reel, tiktok, short, story, carousel, post, longform
    var id: String { rawValue }
    var label: String {
        switch self {
        case .reel: return "Reel"
        case .tiktok: return "TikTok"
        case .short: return "Short"
        case .story: return "Story"
        case .carousel: return "Karussell"
        case .post: return "Post"
        case .longform: return "Langvideo"
        }
    }
    var symbol: String {
        switch self {
        case .reel, .tiktok, .short: return "play.rectangle.on.rectangle"
        case .story: return "circle.dashed"
        case .carousel: return "square.stack"
        case .post: return "photo"
        case .longform: return "film"
        }
    }
}

enum AspectRatio: String, Codable, CaseIterable, Identifiable {
    case portrait = "9:16"
    case vertical = "4:5"
    case square = "1:1"
    case landscape = "16:9"
    var id: String { rawValue }
    var label: String { rawValue }
}

enum Stage: String, Codable, CaseIterable, Identifiable, Comparable {
    case idea
    case script
    case scriptReview = "script_review"
    case shoot
    case edit
    case cutReview = "cut_review"
    case scheduled
    case published

    var id: String { rawValue }

    /// Position in the pipeline (0…7), see DOMAIN_RULES.md.
    var index: Int { Stage.allCases.firstIndex(of: self) ?? 0 }

    static func < (lhs: Stage, rhs: Stage) -> Bool { lhs.index < rhs.index }

    var label: String {
        switch self {
        case .idea: return "Idee"
        case .script: return "Skript"
        case .scriptReview: return "Skript-Freigabe"
        case .shoot: return "Dreh"
        case .edit: return "Schnitt"
        case .cutReview: return "Schnitt-Freigabe"
        case .scheduled: return "Geplant"
        case .published: return "Veröffentlicht"
        }
    }

    var symbol: String {
        switch self {
        case .idea: return "lightbulb"
        case .script: return "doc.text"
        case .scriptReview: return "doc.text.magnifyingglass"
        case .shoot: return "video"
        case .edit: return "scissors"
        case .cutReview: return "eye"
        case .scheduled: return "calendar.badge.clock"
        case .published: return "checkmark.circle"
        }
    }
}

enum TeamRole: String, Codable, CaseIterable, Identifiable {
    case lead, strategist, creator, videographer, editor, client
    var id: String { rawValue }
    var label: String {
        switch self {
        case .lead: return "Leitung"
        case .strategist: return "Strategie"
        case .creator: return "Creator"
        case .videographer: return "Videograf:in"
        case .editor: return "Cutter:in"
        case .client: return "Kunde"
        }
    }
}

enum ScriptStatus: String, Codable, CaseIterable, Identifiable {
    case draft
    case inReview = "in_review"
    case changesRequested = "changes_requested"
    case approved
    var id: String { rawValue }
    var label: String {
        switch self {
        case .draft: return "Entwurf"
        case .inReview: return "In Freigabe"
        case .changesRequested: return "Änderungen angefordert"
        case .approved: return "Freigegeben"
        }
    }
}

enum Framing: String, Codable, CaseIterable, Identifiable {
    case extremeWide = "extreme_wide"
    case wide
    case medium
    case mediumClose = "medium_close"
    case closeUp = "close_up"
    case extremeCloseUp = "extreme_close_up"
    case detail
    var id: String { rawValue }
    var label: String {
        switch self {
        case .extremeWide: return "Panorama / Supertotale"
        case .wide: return "Totale"
        case .medium: return "Halbnah"
        case .mediumClose: return "Nah"
        case .closeUp: return "Großaufnahme"
        case .extremeCloseUp: return "Detail-Groß"
        case .detail: return "Detail"
        }
    }
}

enum CameraAngle: String, Codable, CaseIterable, Identifiable {
    case eyeLevel = "eye_level"
    case high
    case low
    case birdsEye = "birds_eye"
    case wormsEye = "worms_eye"
    case dutch
    case pov
    case overShoulder = "over_shoulder"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .eyeLevel: return "Augenhöhe"
        case .high: return "Aufsicht"
        case .low: return "Untersicht"
        case .birdsEye: return "Vogelperspektive"
        case .wormsEye: return "Froschperspektive"
        case .dutch: return "Gekippt (Dutch)"
        case .pov: return "POV"
        case .overShoulder: return "Über die Schulter"
        }
    }
}

enum CameraMovement: String, Codable, CaseIterable, Identifiable {
    case staticShot = "static"
    case pan
    case tilt
    case dolly
    case gimbalFollow = "gimbal_follow"
    case handheld
    case zoom
    case orbit
    case slider
    var id: String { rawValue }
    var label: String {
        switch self {
        case .staticShot: return "Statisch"
        case .pan: return "Schwenk"
        case .tilt: return "Neigen (Tilt)"
        case .dolly: return "Fahrt (Dolly)"
        case .gimbalFollow: return "Gimbal-Verfolgung"
        case .handheld: return "Handkamera"
        case .zoom: return "Zoom"
        case .orbit: return "Kreisfahrt"
        case .slider: return "Slider"
        }
    }
}

enum ShootStatus: String, Codable, CaseIterable, Identifiable {
    case planned, confirmed, done, cancelled
    var id: String { rawValue }
    var label: String {
        switch self {
        case .planned: return "Geplant"
        case .confirmed: return "Bestätigt"
        case .done: return "Abgedreht"
        case .cancelled: return "Abgesagt"
        }
    }
}

enum MediaKind: String, Codable, CaseIterable, Identifiable {
    case raw
    case cut
    case finalCut = "final"
    case thumbnail
    var id: String { rawValue }
    var label: String {
        switch self {
        case .raw: return "Rohmaterial"
        case .cut: return "Schnitt"
        case .finalCut: return "Final"
        case .thumbnail: return "Thumbnail"
        }
    }
    /// Cut and final versions share one version counter and go through review.
    var isReviewable: Bool { self == .cut || self == .finalCut }
}

enum MediaStatus: String, Codable, CaseIterable, Identifiable {
    case uploaded
    case readyForEdit = "ready_for_edit"
    case inEdit = "in_edit"
    case inReview = "in_review"
    case changesRequested = "changes_requested"
    case approved
    var id: String { rawValue }
    var label: String {
        switch self {
        case .uploaded: return "Hochgeladen"
        case .readyForEdit: return "Zum Schnitt freigegeben"
        case .inEdit: return "Im Schnitt"
        case .inReview: return "In Freigabe"
        case .changesRequested: return "Änderungen angefordert"
        case .approved: return "Freigegeben"
        }
    }
}

enum ActivityKind: String, Codable, CaseIterable {
    case created, updated
    case stageChanged = "stage_changed"
    case submitted, approved
    case changesRequested = "changes_requested"
    case uploaded
    case releasedForEdit = "released_for_edit"
    case commented
}

enum ActivityTarget: String, Codable, CaseIterable {
    case content, script, shoot, media, client
}

// MARK: - Entities

struct TeamMember: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var name: String
    var role: TeamRole
    var email: String?
    var clientId: String?

    var initials: String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return String(letters).uppercased()
    }
}

struct ClientHandles: Codable, Equatable, Hashable {
    var instagram: String?
    var tiktok: String?
    var youtube: String?
    var linkedin: String?
    var facebook: String?
    var pinterest: String?

    func handle(for platform: Platform) -> String? {
        switch platform {
        case .instagram: return instagram
        case .tiktok: return tiktok
        case .youtube: return youtube
        case .linkedin: return linkedin
        case .facebook: return facebook
        case .pinterest: return pinterest
        }
    }
}

struct Client: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var name: String
    var industry: String?
    var color: String
    var active: Bool
    var handles: ClientHandles?
    var contactName: String?
    var contactEmail: String?
    var brandNotes: String?
    var pillars: [String]?
}

struct ContentItem: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var clientId: String
    var title: String
    var format: ContentFormat
    var platforms: [Platform]
    var stage: Stage
    var pillar: String?
    var brief: String?
    var assigneeIds: [String]
    /// yyyy-MM-dd
    var dueDate: String?
    var publishAt: Date?
    var shootId: String?
    var createdAt: Date
    var updatedAt: Date
}

struct ScriptScene: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var title: String
    var voiceover: String?
    var onScreenText: String?
    var visual: String?
    var durationSec: Double?
}

struct Script: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var contentId: String
    var version: Int
    var status: ScriptStatus
    var hook: String
    var scenes: [ScriptScene]
    var caption: String?
    var hashtags: [String]?
    var cta: String?
    var reviewNote: String?
    var updatedAt: Date

    var totalDurationSec: Double { scenes.compactMap(\.durationSec).reduce(0, +) }
    var isEditable: Bool { status == .draft || status == .changesRequested }
}

struct Shot: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var contentId: String
    var sceneId: String?
    var order: Int
    var description: String
    var framing: Framing
    var angle: CameraAngle
    var movement: CameraMovement
    var aspectRatio: AspectRatio
    var lens: String?
    var notes: String?
    var done: Bool
}

struct CallSheetEntry: Codable, Equatable, Hashable {
    /// HH:mm
    var time: String
    var label: String
}

struct ShootLocation: Codable, Equatable, Hashable {
    var name: String
    var address: String?
    var notes: String?
}

struct Shoot: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var clientId: String
    var title: String
    /// yyyy-MM-dd
    var date: String
    /// HH:mm
    var startTime: String
    /// HH:mm
    var endTime: String
    var status: ShootStatus
    var location: ShootLocation
    var teamIds: [String]
    var contentIds: [String]
    var equipment: [String]
    var schedule: [CallSheetEntry]
    var notes: String?
}

struct ReviewComment: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var authorId: String
    var text: String
    var timestampSec: Double?
    var createdAt: Date
    var resolved: Bool
}

struct MediaAsset: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var contentId: String
    var kind: MediaKind
    var fileName: String
    var mimeType: String?
    var sizeBytes: Int64?
    var durationSec: Double?
    var version: Int
    var status: MediaStatus
    var storageKey: String?
    var uploadedById: String
    var uploadedAt: Date
    var comments: [ReviewComment]
}

struct Activity: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var actorId: String
    var kind: ActivityKind
    var targetType: ActivityTarget
    var targetId: String
    var message: String
    var at: Date
}

// MARK: - IDs

enum IDGenerator {
    /// Generates an id matching the contract pattern `^[a-z0-9][a-z0-9_-]{1,63}$`.
    static func make(_ prefix: String) -> String {
        let raw = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        return "\(prefix)_\(raw.prefix(12))"
    }
}
