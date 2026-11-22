import Foundation

/// Central role/permission rules (DOMAIN_RULES.md → "Rollen & Rechte").
/// Mirrors apps/social-studio/web/src/domain/permissions.ts – same names, same matrix.
/// Single source for BOTH the UI (hide/disable) and the store actions (enforce).
/// A future backend must apply the same matrix server-side; the client check is convenience, not security.
enum Permission: String, CaseIterable {
    /// create, edit, move stage, delete
    case contentManage = "content.manage"
    /// create, edit, new version, submit for approval
    case scriptEdit = "script.edit"
    /// approve / request changes
    case scriptReview = "script.review"
    /// add, edit, reorder, tick off, delete
    case shotsManage = "shots.manage"
    /// plan, edit, delete
    case shootManage = "shoot.manage"
    case mediaUpload = "media.upload"
    /// release raw for editing, start editing, delete
    case mediaManage = "media.manage"
    /// approve / request changes on cuts
    case mediaReview = "media.review"
    case mediaComment = "media.comment"
    case mediaViewRaw = "media.viewRaw"
    /// brand notes, shot notes
    case notesViewInternal = "notes.viewInternal"
    case adminClients = "admin.clients"
    case adminTeam = "admin.team"
    /// import / reset
    case adminWorkspace = "admin.workspace"
}

enum Permissions {
    static let agency: Set<Permission> = Set(Permission.allCases)
    static let client: Set<Permission> = [.scriptReview, .mediaReview, .mediaComment]

    /// To add a role: extend `TeamRole` + the contract enum, then grant permissions here.
    static func granted(to role: TeamRole) -> Set<Permission> {
        switch role {
        case .lead, .strategist, .creator, .videographer, .editor: return agency
        case .client: return client
        }
    }

    /// May `member` do `permission`? If `clientId` is given, client users are additionally
    /// limited to their own client (agency roles work across all clients).
    static func can(_ member: TeamMember?, _ permission: Permission, clientId: String? = nil) -> Bool {
        guard let member else { return false }
        guard granted(to: member.role).contains(permission) else { return false }
        if member.role == .client, let clientId, member.clientId != clientId { return false }
        return true
    }
}

/// Activity that reveals raw footage / internal file handling – hidden from users without `media.viewRaw`.
extension ActivityEvent {
    var isInternal: Bool {
        switch self {
        case .mediaUploadedRaw, .mediaReleased, .mediaEditStarted, .mediaDeleted: return true
        default: return false
        }
    }
}
