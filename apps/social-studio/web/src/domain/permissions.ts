// Central role/permission rules (DOMAIN_RULES.md → "Rollen & Rechte").
// Single source for BOTH the UI (hide/disable) and the domain actions (enforce).
// A future backend must apply the same matrix server-side; the client check is convenience, not security.

import type { ID, Role, TeamMember, Workspace } from "./types";

export const PERMISSIONS = [
  "content.manage", // create, edit, move stage, delete
  "script.edit", // create, edit, new version, submit for approval
  "script.review", // approve / request changes
  "shots.manage", // add, edit, reorder, tick off, delete
  "shoot.manage", // plan, edit, delete
  "media.upload",
  "media.manage", // release raw for editing, start editing, delete
  "media.review", // approve / request changes on cuts
  "media.comment",
  "media.viewRaw",
  "notes.viewInternal", // brand notes, shot notes
  "admin.clients",
  "admin.team",
  "admin.workspace", // import / reset
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const AGENCY: readonly Permission[] = PERMISSIONS;
const CLIENT: readonly Permission[] = ["script.review", "media.review", "media.comment"];

/** To add a role: extend ROLES in types.ts + the contract enum, then grant permissions here. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  lead: AGENCY,
  strategist: AGENCY,
  creator: AGENCY,
  videographer: AGENCY,
  editor: AGENCY,
  client: CLIENT,
};

export const isClientRole = (m: Pick<TeamMember, "role">): boolean => m.role === "client";

/**
 * May `member` do `permission`? If `clientId` is given, client users are additionally limited
 * to their own client (agency roles work across all clients).
 */
export function can(member: TeamMember | undefined, permission: Permission, clientId?: ID): boolean {
  if (!member) return false;
  if (!ROLE_PERMISSIONS[member.role].includes(permission)) return false;
  if (isClientRole(member) && clientId !== undefined && member.clientId !== clientId) return false;
  return true;
}

export function memberOf(ws: Workspace, id: ID): TeamMember | undefined {
  return ws.team.find((m) => m.id === id);
}
