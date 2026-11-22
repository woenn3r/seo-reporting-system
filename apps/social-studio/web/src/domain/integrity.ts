// Referential integrity of a workspace – everything the JSON Schema cannot express.
// Mirrors app/tests/test_social_studio_contract.py; used when loading/importing data.

import type { Workspace } from "./types";

export function integrityErrors(ws: Workspace, limit = 20): string[] {
  const errors: string[] = [];
  const add = (msg: string) => {
    if (errors.length < limit) errors.push(msg);
  };
  const ids = <T extends { id: string }>(name: string, list: T[]): Set<string> => {
    const set = new Set<string>();
    for (const x of list) {
      if (set.has(x.id)) add(`${name}: duplicate id ${x.id}`);
      set.add(x.id);
    }
    return set;
  };
  const team = ids("team", ws.team);
  const clients = ids("clients", ws.clients);
  const contents = ids("contents", ws.contents);
  const scripts = ids("scripts", ws.scripts);
  const shoots = ids("shoots", ws.shoots);
  const media = ids("media", ws.media);
  ids("shots", ws.shots);
  ids("activity", ws.activity);
  const contentById = new Map(ws.contents.map((c) => [c.id, c]));
  const shootById = new Map(ws.shoots.map((s) => [s.id, s]));

  if (!team.has(ws.workspace.currentUserId)) add(`workspace.currentUserId ${ws.workspace.currentUserId} is not a team member`);
  for (const m of ws.team) if (m.role === "client" && !(m.clientId && clients.has(m.clientId))) add(`team ${m.id}: client user without valid clientId`);
  for (const c of ws.contents) {
    if (!clients.has(c.clientId)) add(`content ${c.id}: unknown client ${c.clientId}`);
    for (const u of c.assigneeIds) if (!team.has(u)) add(`content ${c.id}: unknown assignee ${u}`);
    if (c.shootId !== undefined) {
      const shoot = shootById.get(c.shootId);
      if (!shoot) add(`content ${c.id}: unknown shoot ${c.shootId}`);
      else if (!shoot.contentIds.includes(c.id)) add(`content ${c.id}: shoot ${c.shootId} does not list it`);
    }
  }
  for (const s of ws.scripts) if (!contents.has(s.contentId)) add(`script ${s.id}: unknown content ${s.contentId}`);
  for (const s of ws.shots) if (!contents.has(s.contentId)) add(`shot ${s.id}: unknown content ${s.contentId}`);
  for (const s of ws.shoots) {
    if (!clients.has(s.clientId)) add(`shoot ${s.id}: unknown client ${s.clientId}`);
    if (s.startTime > s.endTime) add(`shoot ${s.id}: ends before it starts`);
    for (const u of s.teamIds) if (!team.has(u)) add(`shoot ${s.id}: unknown team member ${u}`);
    for (const cid of s.contentIds) {
      const c = contentById.get(cid);
      if (!c) add(`shoot ${s.id}: unknown content ${cid}`);
      else if (c.clientId !== s.clientId) add(`shoot ${s.id}: content ${cid} belongs to another client`);
      else if (c.shootId !== s.id) add(`shoot ${s.id}: content ${cid} does not point back`);
    }
  }
  for (const m of ws.media) {
    if (!contents.has(m.contentId)) add(`media ${m.id}: unknown content ${m.contentId}`);
    if (!team.has(m.uploadedById)) add(`media ${m.id}: unknown uploader ${m.uploadedById}`);
    for (const c of m.comments) if (!team.has(c.authorId)) add(`media ${m.id}: comment ${c.id} by unknown author`);
  }
  const targets = { content: contents, script: scripts, shoot: shoots, media, client: clients };
  for (const a of ws.activity) {
    if (!team.has(a.actorId)) add(`activity ${a.id}: unknown actor ${a.actorId}`);
    if (!targets[a.targetType].has(a.targetId)) add(`activity ${a.id}: dangling ${a.targetType} ${a.targetId}`);
  }
  return errors;
}
