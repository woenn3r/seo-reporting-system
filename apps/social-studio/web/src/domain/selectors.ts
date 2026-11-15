// Read-side helpers incl. role-based visibility (DOMAIN_RULES.md → "Rollen & Sichtbarkeit").

import { currentScript } from "./actions";
import type { Client, Content, ID, MediaAsset, Script, Shoot, TeamMember, Workspace } from "./types";

export function currentUser(ws: Workspace): TeamMember {
  return ws.team.find((m) => m.id === ws.workspace.currentUserId) ?? ws.team[0]!;
}

export const isClientUser = (u: TeamMember): boolean => u.role === "client";

export function memberById(ws: Workspace, id: ID): TeamMember | undefined {
  return ws.team.find((m) => m.id === id);
}

export function clientById(ws: Workspace, id: ID | undefined): Client | undefined {
  return id ? ws.clients.find((c) => c.id === id) : undefined;
}

/**
 * Applies the role filter and the global client filter (sidebar switcher) to the workspace.
 * Client users never see other clients, raw footage or internal notes.
 */
export function scopedWorkspace(ws: Workspace, clientFilter: ID | null): Workspace {
  const user = currentUser(ws);
  const restrictTo = isClientUser(user) ? user.clientId ?? "__none__" : clientFilter;
  if (!restrictTo && !isClientUser(user)) return ws;

  const clients = ws.clients.filter((c) => c.id === restrictTo);
  const clientIds = new Set(clients.map((c) => c.id));
  const contents = ws.contents.filter((c) => clientIds.has(c.clientId));
  const contentIds = new Set(contents.map((c) => c.id));
  const shoots = ws.shoots.filter((s) => clientIds.has(s.clientId));
  let media = ws.media.filter((m) => contentIds.has(m.contentId));
  let shots = ws.shots.filter((s) => contentIds.has(s.contentId));
  let visibleClients = clients;
  if (isClientUser(user)) {
    media = media.filter((m) => m.kind !== "raw");
    shots = shots.map(({ notes: _n, ...rest }) => rest);
    visibleClients = clients.map(({ brandNotes: _b, ...rest }) => rest);
  }
  const mediaIds = new Set(media.map((m) => m.id));
  const scripts = ws.scripts.filter((s) => contentIds.has(s.contentId));
  const scriptIds = new Set(scripts.map((s) => s.id));
  const shootIds = new Set(shoots.map((s) => s.id));
  const activity = ws.activity.filter((a) => {
    switch (a.targetType) {
      case "content":
        return contentIds.has(a.targetId);
      case "script":
        return scriptIds.has(a.targetId);
      case "shoot":
        return shootIds.has(a.targetId);
      case "media":
        return mediaIds.has(a.targetId);
      case "client":
        return clientIds.has(a.targetId);
    }
  });
  return { ...ws, clients: visibleClients, contents, shoots, media, shots, scripts, activity };
}

export interface ApprovalItem {
  kind: "script" | "media";
  id: ID;
  content: Content;
  script?: Script;
  media?: MediaAsset;
  since: string;
}

/** Freigaben-Eingang: newest script/cut per content that is in_review. */
export function approvalInbox(ws: Workspace): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const content of ws.contents) {
    const script = currentScript(ws, content.id);
    if (script?.status === "in_review") {
      items.push({ kind: "script", id: script.id, content, script, since: script.updatedAt });
    }
    const cuts = ws.media
      .filter((m) => m.contentId === content.id && (m.kind === "cut" || m.kind === "final"))
      .sort((a, b) => b.version - a.version);
    const latest = cuts[0];
    if (latest?.status === "in_review") {
      items.push({ kind: "media", id: latest.id, content, media: latest, since: latest.uploadedAt });
    }
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

export function upcomingShoots(ws: Workspace, today: string): Shoot[] {
  return ws.shoots
    .filter((s) => s.date >= today && s.status !== "cancelled" && s.status !== "done")
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

export function editQueue(ws: Workspace): MediaAsset[] {
  return ws.media
    .filter((m) => m.kind === "raw" && (m.status === "ready_for_edit" || m.status === "in_edit"))
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export function shootProgress(ws: Workspace, shoot: Shoot): { done: number; total: number } {
  const shots = ws.shots.filter((s) => shoot.contentIds.includes(s.contentId));
  return { done: shots.filter((s) => s.done).length, total: shots.length };
}

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
