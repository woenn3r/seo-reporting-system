import Foundation

/// Referential integrity of a workspace – everything the JSON Schema cannot express.
/// Mirrors apps/social-studio/web/src/domain/integrity.ts and
/// app/tests/test_social_studio_contract.py; used when loading data (DOMAIN_RULES: Datenintegrität).
enum WorkspaceIntegrity {
    static func errors(in ws: Workspace, limit: Int = 20) -> [String] {
        var errors: [String] = []
        func add(_ message: String) {
            if errors.count < limit { errors.append(message) }
        }
        func ids(_ name: String, _ list: [String]) -> Set<String> {
            var seen = Set<String>()
            for id in list {
                if seen.contains(id) { add("\(name): duplicate id \(id)") }
                seen.insert(id)
            }
            return seen
        }

        let team = ids("team", ws.team.map(\.id))
        let clients = ids("clients", ws.clients.map(\.id))
        let contents = ids("contents", ws.contents.map(\.id))
        let scripts = ids("scripts", ws.scripts.map(\.id))
        let shoots = ids("shoots", ws.shoots.map(\.id))
        let media = ids("media", ws.media.map(\.id))
        _ = ids("shots", ws.shots.map(\.id))
        _ = ids("activity", ws.activity.map(\.id))

        var contentById: [String: ContentItem] = [:]
        for content in ws.contents { contentById[content.id] = content }
        var shootById: [String: Shoot] = [:]
        for shoot in ws.shoots { shootById[shoot.id] = shoot }

        if team.isEmpty { add("team is empty") }
        if !team.contains(ws.workspace.currentUserId) {
            add("workspace.currentUserId \(ws.workspace.currentUserId) is not a team member")
        }
        for member in ws.team where member.role == .client {
            if let clientId = member.clientId, clients.contains(clientId) { continue }
            add("team \(member.id): client user without valid clientId")
        }
        for content in ws.contents {
            if !clients.contains(content.clientId) { add("content \(content.id): unknown client \(content.clientId)") }
            for user in content.assigneeIds where !team.contains(user) {
                add("content \(content.id): unknown assignee \(user)")
            }
            if let shootId = content.shootId {
                if let shoot = shootById[shootId] {
                    if !shoot.contentIds.contains(content.id) { add("content \(content.id): shoot \(shootId) does not list it") }
                } else {
                    add("content \(content.id): unknown shoot \(shootId)")
                }
            }
        }
        for script in ws.scripts where !contents.contains(script.contentId) {
            add("script \(script.id): unknown content \(script.contentId)")
        }
        for shot in ws.shots where !contents.contains(shot.contentId) {
            add("shot \(shot.id): unknown content \(shot.contentId)")
        }
        for shoot in ws.shoots {
            if !clients.contains(shoot.clientId) { add("shoot \(shoot.id): unknown client \(shoot.clientId)") }
            if shoot.startTime > shoot.endTime { add("shoot \(shoot.id): ends before it starts") }
            for user in shoot.teamIds where !team.contains(user) {
                add("shoot \(shoot.id): unknown team member \(user)")
            }
            for contentId in shoot.contentIds {
                if let content = contentById[contentId] {
                    if content.clientId != shoot.clientId {
                        add("shoot \(shoot.id): content \(contentId) belongs to another client")
                    } else if content.shootId != shoot.id {
                        add("shoot \(shoot.id): content \(contentId) does not point back")
                    }
                } else {
                    add("shoot \(shoot.id): unknown content \(contentId)")
                }
            }
        }
        for asset in ws.media {
            if !contents.contains(asset.contentId) { add("media \(asset.id): unknown content \(asset.contentId)") }
            if !team.contains(asset.uploadedById) { add("media \(asset.id): unknown uploader \(asset.uploadedById)") }
            for comment in asset.comments where !team.contains(comment.authorId) {
                add("media \(asset.id): comment \(comment.id) by unknown author")
            }
        }
        for entry in ws.activity {
            if !team.contains(entry.actorId) { add("activity \(entry.id): unknown actor \(entry.actorId)") }
            let known: Bool
            switch entry.targetType {
            case .content: known = contents.contains(entry.targetId)
            case .script: known = scripts.contains(entry.targetId)
            case .shoot: known = shoots.contains(entry.targetId)
            case .media: known = media.contains(entry.targetId)
            case .client: known = clients.contains(entry.targetId)
            }
            if !known { add("activity \(entry.id): dangling \(entry.targetType.rawValue) \(entry.targetId)") }
        }
        return errors
    }
}
