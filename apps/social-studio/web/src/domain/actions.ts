// Pure workflow actions. Implements apps/social-studio/DOMAIN_RULES.md.
// Every action takes the current workspace + a context and returns a NEW workspace (no mutation).

import {
  STAGES,
  type Activity,
  type ActivityKind,
  type Client,
  type Content,
  type ID,
  type MediaAsset,
  type MediaKind,
  type Scene,
  type Script,
  type Shoot,
  type Shot,
  type Stage,
  type TargetType,
  type TeamMember,
  type Workspace,
} from "./types";
import { STAGE_LABEL } from "./labels";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export interface Ctx {
  now: string;
  actorId: ID;
  newId: (prefix: string) => ID;
}

export interface Result<T = undefined> {
  ws: Workspace;
  value: T;
}

// ---------- helpers ----------

export const stageIndex = (s: Stage): number => STAGES.indexOf(s);

function find<T extends { id: ID }>(list: T[], id: ID, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new DomainError(`${what} nicht gefunden (${id}).`);
  return item;
}

function replace<T extends { id: ID }>(list: T[], next: T): T[] {
  return list.map((x) => (x.id === next.id ? next : x));
}

function log(ws: Workspace, ctx: Ctx, kind: ActivityKind, targetType: TargetType, targetId: ID, message: string): Workspace {
  const entry: Activity = { id: ctx.newId("a"), actorId: ctx.actorId, kind, targetType, targetId, message, at: ctx.now };
  return { ...ws, activity: [...ws.activity, entry] };
}

function setStage(ws: Workspace, ctx: Ctx, contentId: ID, stage: Stage, mode: "forward" | "force"): Workspace {
  const content = find(ws.contents, contentId, "Content");
  if (content.stage === stage) return ws;
  if (mode === "forward" && stageIndex(stage) <= stageIndex(content.stage)) return ws;
  const next: Content = { ...content, stage, updatedAt: ctx.now };
  return { ...ws, contents: replace(ws.contents, next) };
}

function requireText(text: string | undefined, what: string): string {
  const t = (text ?? "").trim();
  if (!t) throw new DomainError(`${what} darf nicht leer sein.`);
  return t;
}

function stripEmpty<T extends object>(obj: T): T {
  // Contract: optional fields are omitted rather than set to "" / undefined.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === "") continue;
    out[k] = v;
  }
  return out as T;
}

export function contentTitle(ws: Workspace, contentId: ID): string {
  return ws.contents.find((c) => c.id === contentId)?.title ?? "Unbekannter Content";
}

// ---------- contents ----------

export interface NewContentInput {
  clientId: ID;
  title: string;
  format: Content["format"];
  platforms: Content["platforms"];
  pillar?: string;
  brief?: string;
  dueDate?: string;
  assigneeIds?: ID[];
}

export function createContent(ws: Workspace, ctx: Ctx, input: NewContentInput): Result<ID> {
  find(ws.clients, input.clientId, "Kunde");
  const title = requireText(input.title, "Titel");
  if (input.platforms.length === 0) throw new DomainError("Mindestens eine Plattform wählen.");
  const id = ctx.newId("ct");
  const content: Content = stripEmpty({
    id,
    clientId: input.clientId,
    title,
    format: input.format,
    platforms: [...new Set(input.platforms)],
    stage: "idea",
    pillar: input.pillar,
    brief: input.brief?.trim(),
    assigneeIds: [...new Set(input.assigneeIds ?? [])],
    dueDate: input.dueDate,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
  let next: Workspace = { ...ws, contents: [...ws.contents, content] };
  next = log(next, ctx, "created", "content", id, `hat „${title}“ angelegt`);
  return { ws: next, value: id };
}

export type ContentPatch = Partial<Pick<Content, "title" | "format" | "platforms" | "pillar" | "brief" | "assigneeIds" | "dueDate" | "publishAt">>;

export function updateContent(ws: Workspace, ctx: Ctx, id: ID, patch: ContentPatch): Workspace {
  const content = find(ws.contents, id, "Content");
  if (patch.title !== undefined) requireText(patch.title, "Titel");
  if (patch.platforms !== undefined && patch.platforms.length === 0) throw new DomainError("Mindestens eine Plattform wählen.");
  const merged = { ...content, ...patch, updatedAt: ctx.now };
  // allow clearing optional fields by passing ""
  const next = stripEmpty(merged) as Content;
  return { ...ws, contents: replace(ws.contents, next) };
}

export function moveStage(ws: Workspace, ctx: Ctx, id: ID, stage: Stage): Workspace {
  const content = find(ws.contents, id, "Content");
  if (content.stage === stage) return ws;
  const next = setStage(ws, ctx, id, stage, "force");
  return log(next, ctx, "stage_changed", "content", id, `hat „${content.title}“ nach „${STAGE_LABEL[stage]}“ verschoben`);
}

export function deleteContent(ws: Workspace, ctx: Ctx, id: ID): Result<string[]> {
  const content = find(ws.contents, id, "Content");
  const removedMedia = ws.media.filter((m) => m.contentId === id);
  const removedScriptIds = new Set(ws.scripts.filter((s) => s.contentId === id).map((s) => s.id));
  const removedMediaIds = new Set(removedMedia.map((m) => m.id));
  let next: Workspace = {
    ...ws,
    contents: ws.contents.filter((c) => c.id !== id),
    scripts: ws.scripts.filter((s) => s.contentId !== id),
    shots: ws.shots.filter((s) => s.contentId !== id),
    media: ws.media.filter((m) => m.contentId !== id),
    shoots: ws.shoots.map((s) => (s.contentIds.includes(id) ? { ...s, contentIds: s.contentIds.filter((c) => c !== id) } : s)),
    // activity entries pointing to removed targets would dangle -> drop them
    activity: ws.activity.filter(
      (a) =>
        !(a.targetType === "content" && a.targetId === id) &&
        !(a.targetType === "script" && removedScriptIds.has(a.targetId)) &&
        !(a.targetType === "media" && removedMediaIds.has(a.targetId)),
    ),
  };
  next = log(next, ctx, "updated", "client", content.clientId, `hat „${content.title}“ gelöscht`);
  return { ws: next, value: removedMedia.flatMap((m) => (m.storageKey ? [m.storageKey] : [])) };
}

// ---------- scripts ----------

export function currentScript(ws: Workspace, contentId: ID): Script | undefined {
  return ws.scripts
    .filter((s) => s.contentId === contentId)
    .reduce<Script | undefined>((best, s) => (!best || s.version > best.version ? s : best), undefined);
}

export function createScript(ws: Workspace, ctx: Ctx, contentId: ID): Result<ID> {
  const content = find(ws.contents, contentId, "Content");
  if (currentScript(ws, contentId)) throw new DomainError("Für diesen Content existiert bereits ein Skript.");
  const id = ctx.newId("sc");
  const script: Script = {
    id,
    contentId,
    version: 1,
    status: "draft",
    hook: "",
    scenes: [{ id: ctx.newId("s"), title: "Hook" }],
    hashtags: [],
    updatedAt: ctx.now,
  };
  let next: Workspace = { ...ws, scripts: [...ws.scripts, script] };
  next = setStage(next, ctx, contentId, "script", "forward");
  next = log(next, ctx, "created", "script", id, `hat ein Skript für „${content.title}“ angelegt`);
  return { ws: next, value: id };
}

export type ScriptPatch = Partial<Pick<Script, "hook" | "scenes" | "caption" | "hashtags" | "cta">>;

export function updateScript(ws: Workspace, ctx: Ctx, scriptId: ID, patch: ScriptPatch): Workspace {
  const script = find(ws.scripts, scriptId, "Skript");
  if (script.status !== "draft" && script.status !== "changes_requested") {
    throw new DomainError("Nur Entwürfe oder Skripte mit angeforderten Änderungen können bearbeitet werden. Lege eine neue Version an.");
  }
  if (patch.hashtags) {
    for (const h of patch.hashtags) {
      if (!/^#\S+$/.test(h)) throw new DomainError(`Ungültiger Hashtag: „${h}“ (Format: #wort).`);
    }
  }
  if (patch.scenes) patch = { ...patch, scenes: patch.scenes.map((s) => stripEmpty(s) as Scene) };
  const next = stripEmpty({ ...script, ...patch, updatedAt: ctx.now }) as Script;
  return { ...ws, scripts: replace(ws.scripts, next) };
}

export function newScriptVersion(ws: Workspace, ctx: Ctx, scriptId: ID): Result<ID> {
  const script = find(ws.scripts, scriptId, "Skript");
  const latest = currentScript(ws, script.contentId);
  if (latest?.id !== script.id) throw new DomainError("Neue Versionen können nur von der aktuellen Version erstellt werden.");
  if (script.status !== "approved" && script.status !== "in_review") {
    throw new DomainError("Entwürfe können direkt bearbeitet werden – keine neue Version nötig.");
  }
  const id = ctx.newId("sc");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  const copy: Script = { ...rest, id, version: script.version + 1, status: "draft", updatedAt: ctx.now };
  let next: Workspace = { ...ws, scripts: [...ws.scripts, copy] };
  next = log(next, ctx, "created", "script", id, `hat Version ${copy.version} von „${contentTitle(ws, script.contentId)}“ angelegt`);
  return { ws: next, value: id };
}

export function submitScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "Skript");
  if (script.status !== "draft" && script.status !== "changes_requested") {
    throw new DomainError("Nur Entwürfe können zur Freigabe gesendet werden.");
  }
  if (!script.hook.trim() && script.scenes.length === 0) throw new DomainError("Das Skript ist leer.");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "in_review", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script_review", "forward");
  return log(next, ctx, "submitted", "script", scriptId, `hat das Skript „${contentTitle(ws, script.contentId)}“ (v${script.version}) zur Freigabe eingereicht`);
}

export function approveScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "Skript");
  if (script.status !== "in_review") throw new DomainError("Nur Skripte in Freigabe können freigegeben werden.");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...rest, status: "approved", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "shoot", "forward");
  return log(next, ctx, "approved", "script", scriptId, `hat das Skript „${contentTitle(ws, script.contentId)}“ (v${script.version}) freigegeben`);
}

export function requestScriptChanges(ws: Workspace, ctx: Ctx, scriptId: ID, note: string): Workspace {
  const script = find(ws.scripts, scriptId, "Skript");
  if (script.status !== "in_review") throw new DomainError("Änderungen können nur für Skripte in Freigabe angefordert werden.");
  const reviewNote = requireText(note, "Die Rückmeldung");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "changes_requested", reviewNote, updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script", "force");
  return log(next, ctx, "changes_requested", "script", scriptId, `hat Änderungen am Skript „${contentTitle(ws, script.contentId)}“ angefordert`);
}

// ---------- shots ----------

export type ShotInput = Omit<Shot, "id" | "contentId" | "order" | "done">;

export function shotsFor(ws: Workspace, contentId: ID): Shot[] {
  return ws.shots.filter((s) => s.contentId === contentId).sort((a, b) => a.order - b.order);
}

export function addShot(ws: Workspace, ctx: Ctx, contentId: ID, input: ShotInput): Result<ID> {
  find(ws.contents, contentId, "Content");
  requireText(input.description, "Beschreibung");
  const existing = shotsFor(ws, contentId);
  const id = ctx.newId("shot");
  const shot = stripEmpty({ ...input, description: input.description.trim(), id, contentId, order: existing.length, done: false }) as Shot;
  return { ws: { ...ws, shots: [...ws.shots, shot] }, value: id };
}

export function updateShot(ws: Workspace, _ctx: Ctx, shotId: ID, patch: Partial<ShotInput & { done: boolean }>): Workspace {
  const shot = find(ws.shots, shotId, "Shot");
  if (patch.description !== undefined) requireText(patch.description, "Beschreibung");
  const next = stripEmpty({ ...shot, ...patch }) as Shot;
  return { ...ws, shots: replace(ws.shots, next) };
}

export function deleteShot(ws: Workspace, _ctx: Ctx, shotId: ID): Workspace {
  const shot = find(ws.shots, shotId, "Shot");
  const remaining = shotsFor(ws, shot.contentId).filter((s) => s.id !== shotId);
  const reordered = new Map(remaining.map((s, i) => [s.id, i]));
  return {
    ...ws,
    shots: ws.shots.filter((s) => s.id !== shotId).map((s) => (reordered.has(s.id) ? { ...s, order: reordered.get(s.id)! } : s)),
  };
}

export function moveShot(ws: Workspace, _ctx: Ctx, shotId: ID, direction: -1 | 1): Workspace {
  const shot = find(ws.shots, shotId, "Shot");
  const list = shotsFor(ws, shot.contentId);
  const idx = list.findIndex((s) => s.id === shotId);
  const target = idx + direction;
  if (target < 0 || target >= list.length) return ws;
  const swapped = [...list];
  [swapped[idx], swapped[target]] = [swapped[target]!, swapped[idx]!];
  const order = new Map(swapped.map((s, i) => [s.id, i]));
  return { ...ws, shots: ws.shots.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)! } : s)) };
}

// ---------- shoots ----------

export type ShootInput = Omit<Shoot, "id">;

function validateShoot(ws: Workspace, input: ShootInput): void {
  find(ws.clients, input.clientId, "Kunde");
  requireText(input.title, "Titel");
  requireText(input.location.name, "Location");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError("Ungültiges Datum.");
  if (input.startTime > input.endTime) throw new DomainError("Ende liegt vor dem Beginn.");
  for (const cid of input.contentIds) {
    const c = find(ws.contents, cid, "Content");
    if (c.clientId !== input.clientId) throw new DomainError(`„${c.title}“ gehört zu einem anderen Kunden.`);
  }
}

/** Keeps Content.shootId and Shoot.contentIds consistent (a content belongs to at most one shoot). */
function linkContents(ws: Workspace, ctx: Ctx, shootId: ID, contentIds: ID[]): Workspace {
  const wanted = new Set(contentIds);
  return {
    ...ws,
    shoots: ws.shoots.map((s) => (s.id === shootId ? s : { ...s, contentIds: s.contentIds.filter((c) => !wanted.has(c)) })),
    contents: ws.contents.map((c) => {
      if (wanted.has(c.id) && c.shootId !== shootId) return { ...c, shootId, updatedAt: ctx.now };
      if (!wanted.has(c.id) && c.shootId === shootId) {
        const { shootId: _drop, ...rest } = c;
        void _drop;
        return { ...rest, updatedAt: ctx.now };
      }
      return c;
    }),
  };
}

export function createShoot(ws: Workspace, ctx: Ctx, input: ShootInput): Result<ID> {
  validateShoot(ws, input);
  const id = ctx.newId("sh");
  const shoot = stripEmpty({ ...input, contentIds: [...new Set(input.contentIds)], id }) as Shoot;
  let next: Workspace = { ...ws, shoots: [...ws.shoots, shoot] };
  next = linkContents(next, ctx, id, shoot.contentIds);
  next = log(next, ctx, "created", "shoot", id, `hat den Dreh „${shoot.title}“ am ${input.date} geplant`);
  return { ws: next, value: id };
}

export function updateShoot(ws: Workspace, ctx: Ctx, id: ID, input: ShootInput): Workspace {
  find(ws.shoots, id, "Dreh");
  validateShoot(ws, input);
  const shoot = stripEmpty({ ...input, contentIds: [...new Set(input.contentIds)], id }) as Shoot;
  let next: Workspace = { ...ws, shoots: replace(ws.shoots, shoot) };
  next = linkContents(next, ctx, id, shoot.contentIds);
  return log(next, ctx, "updated", "shoot", id, `hat den Dreh „${shoot.title}“ aktualisiert`);
}

export function deleteShoot(ws: Workspace, ctx: Ctx, id: ID): Workspace {
  const shoot = find(ws.shoots, id, "Dreh");
  let next = linkContents(ws, ctx, id, []);
  next = {
    ...next,
    shoots: next.shoots.filter((s) => s.id !== id),
    activity: next.activity.filter((a) => !(a.targetType === "shoot" && a.targetId === id)),
  };
  return log(next, ctx, "updated", "client", shoot.clientId, `hat den Dreh „${shoot.title}“ gelöscht`);
}

// ---------- media ----------

export interface NewMediaInput {
  contentId: ID;
  kind: MediaKind;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  storageKey?: string;
}

export function mediaFor(ws: Workspace, contentId: ID): MediaAsset[] {
  return ws.media.filter((m) => m.contentId === contentId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function addMedia(ws: Workspace, ctx: Ctx, input: NewMediaInput): Result<ID> {
  const content = find(ws.contents, input.contentId, "Content");
  requireText(input.fileName, "Dateiname");
  const isReviewable = input.kind === "cut" || input.kind === "final";
  const sameTrack = ws.media.filter(
    (m) => m.contentId === input.contentId && (isReviewable ? m.kind === "cut" || m.kind === "final" : m.kind === input.kind),
  );
  const version = sameTrack.reduce((max, m) => Math.max(max, m.version), 0) + 1;
  const id = ctx.newId("m");
  const asset = stripEmpty({
    id,
    contentId: input.contentId,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes !== undefined ? Math.max(0, Math.round(input.sizeBytes)) : undefined,
    durationSec: input.durationSec !== undefined && Number.isFinite(input.durationSec) ? Math.max(0, input.durationSec) : undefined,
    version,
    status: isReviewable ? "in_review" : "uploaded",
    storageKey: input.storageKey,
    uploadedById: ctx.actorId,
    uploadedAt: ctx.now,
    comments: [],
  }) as MediaAsset;
  let next: Workspace = { ...ws, media: [...ws.media, asset] };
  if (isReviewable) next = setStage(next, ctx, input.contentId, "cut_review", "forward");
  const what = input.kind === "raw" ? "Rohmaterial" : input.kind === "thumbnail" ? "ein Thumbnail" : `Schnitt v${version}`;
  return { ws: log(next, ctx, "uploaded", "media", id, `hat ${what} für „${content.title}“ hochgeladen`), value: id };
}

function setMediaStatus(ws: Workspace, ctx: Ctx, asset: MediaAsset, status: MediaAsset["status"]): Workspace {
  void ctx;
  return { ...ws, media: replace(ws.media, { ...asset, status }) };
}

export function releaseForEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  if (asset.kind !== "raw" || asset.status !== "uploaded") throw new DomainError("Nur hochgeladenes Rohmaterial kann zum Schnitt freigegeben werden.");
  let next = setMediaStatus(ws, ctx, asset, "ready_for_edit");
  next = setStage(next, ctx, asset.contentId, "edit", "forward");
  return log(next, ctx, "released_for_edit", "media", mediaId, `hat Rohmaterial „${asset.fileName}“ zum Schnitt freigegeben`);
}

export function startEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  if (asset.kind !== "raw" || asset.status !== "ready_for_edit") throw new DomainError("Schnitt kann nur für freigegebenes Rohmaterial gestartet werden.");
  const next = setMediaStatus(ws, ctx, asset, "in_edit");
  return log(next, ctx, "updated", "media", mediaId, `hat mit dem Schnitt von „${asset.fileName}“ begonnen`);
}

export function approveMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  if ((asset.kind !== "cut" && asset.kind !== "final") || asset.status !== "in_review") throw new DomainError("Nur Schnittversionen in Freigabe können freigegeben werden.");
  let next = setMediaStatus(ws, ctx, asset, "approved");
  next = setStage(next, ctx, asset.contentId, "scheduled", "forward");
  return log(next, ctx, "approved", "media", mediaId, `hat ${asset.kind === "final" ? "die finale Version" : `Schnitt v${asset.version}`} von „${contentTitle(ws, asset.contentId)}“ freigegeben`);
}

export function requestMediaChanges(ws: Workspace, ctx: Ctx, mediaId: ID, note: string): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  if ((asset.kind !== "cut" && asset.kind !== "final") || asset.status !== "in_review") throw new DomainError("Änderungen können nur für Schnittversionen in Freigabe angefordert werden.");
  const text = requireText(note, "Die Rückmeldung");
  const comment = { id: ctx.newId("rc"), authorId: ctx.actorId, text, createdAt: ctx.now, resolved: false };
  let next: Workspace = { ...ws, media: replace(ws.media, { ...asset, status: "changes_requested", comments: [...asset.comments, comment] }) };
  next = setStage(next, ctx, asset.contentId, "edit", "force");
  return log(next, ctx, "changes_requested", "media", mediaId, `hat Änderungen an Schnitt v${asset.version} von „${contentTitle(ws, asset.contentId)}“ angefordert`);
}

export function addComment(ws: Workspace, ctx: Ctx, mediaId: ID, text: string, timestampSec?: number): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  const body = requireText(text, "Kommentar");
  let ts: number | undefined;
  if (timestampSec !== undefined && Number.isFinite(timestampSec)) {
    ts = Math.max(0, Math.round(timestampSec * 10) / 10);
    if (asset.durationSec !== undefined) ts = Math.min(ts, asset.durationSec);
  }
  const comment = stripEmpty({ id: ctx.newId("rc"), authorId: ctx.actorId, text: body, timestampSec: ts, createdAt: ctx.now, resolved: false });
  const next: Workspace = { ...ws, media: replace(ws.media, { ...asset, comments: [...asset.comments, comment] }) };
  return log(next, ctx, "commented", "media", mediaId, `hat „${asset.fileName}“ kommentiert`);
}

export function toggleCommentResolved(ws: Workspace, _ctx: Ctx, mediaId: ID, commentId: ID): Workspace {
  const asset = find(ws.media, mediaId, "Datei");
  const comments = asset.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c));
  return { ...ws, media: replace(ws.media, { ...asset, comments }) };
}

export function deleteMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Result<string | undefined> {
  const asset = find(ws.media, mediaId, "Datei");
  let next: Workspace = {
    ...ws,
    media: ws.media.filter((m) => m.id !== mediaId),
    activity: ws.activity.filter((a) => !(a.targetType === "media" && a.targetId === mediaId)),
  };
  next = log(next, ctx, "updated", "content", asset.contentId, `hat „${asset.fileName}“ gelöscht`);
  return { ws: next, value: asset.storageKey };
}

// ---------- clients & team ----------

export type ClientInput = Omit<Client, "id">;

export function createClient(ws: Workspace, ctx: Ctx, input: ClientInput): Result<ID> {
  requireText(input.name, "Name");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new DomainError("Farbe muss als #RRGGBB angegeben werden.");
  const id = ctx.newId("c");
  const client = stripEmpty({ ...input, name: input.name.trim(), id }) as Client;
  const next: Workspace = { ...ws, clients: [...ws.clients, client] };
  return { ws: log(next, ctx, "created", "client", id, `hat den Kunden „${client.name}“ angelegt`), value: id };
}

export function updateClient(ws: Workspace, ctx: Ctx, id: ID, input: ClientInput): Workspace {
  find(ws.clients, id, "Kunde");
  requireText(input.name, "Name");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new DomainError("Farbe muss als #RRGGBB angegeben werden.");
  const client = stripEmpty({ ...input, name: input.name.trim(), id }) as Client;
  return log({ ...ws, clients: replace(ws.clients, client) }, ctx, "updated", "client", id, `hat den Kunden „${client.name}“ aktualisiert`);
}

export type MemberInput = Omit<TeamMember, "id">;

export function addMember(ws: Workspace, ctx: Ctx, input: MemberInput): Result<ID> {
  requireText(input.name, "Name");
  if (input.role === "client") find(ws.clients, input.clientId ?? "", "Kunde");
  const id = ctx.newId("u");
  const member = stripEmpty({ ...input, name: input.name.trim(), clientId: input.role === "client" ? input.clientId : undefined, id }) as TeamMember;
  return { ws: { ...ws, team: [...ws.team, member] }, value: id };
}

export function setCurrentUser(ws: Workspace, userId: ID): Workspace {
  find(ws.team, userId, "Nutzer");
  return { ...ws, workspace: { ...ws.workspace, currentUserId: userId } };
}
