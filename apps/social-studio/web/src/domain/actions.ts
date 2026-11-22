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
import type { ActivityParams } from "./types";
import { translate, getLang, type Params, type TKey } from "../i18n";

/** Workflow rule violation. `key`/`params` are i18n data; `message` is rendered in the current UI language. */
export class DomainError extends Error {
  constructor(
    readonly key: TKey,
    readonly params: Params = {},
  ) {
    super(DomainError.render(key, params));
    this.name = "DomainError";
  }
  static render(key: TKey, params: Params = {}): string {
    // params named entity/field carry i18n keys themselves
    const p: Params = { ...params };
    for (const k of ["entity", "field"]) if (typeof p[k] === "string") p[k] = translate(getLang(), p[k] as TKey);
    return translate(getLang(), key, p);
  }
}

type Entity = "content" | "client" | "script" | "shot" | "shoot" | "media" | "member";
type FieldKey = "title" | "location" | "description" | "fileName" | "note" | "comment" | "name";

export interface Ctx {
  now: string;
  actorId: ID;
  newId: (prefix: string) => ID;
  /** Renders activity params as human-readable fallback text (stored in Activity.message). */
  describe: (p: ActivityParams) => string;
}

export interface Result<T = undefined> {
  ws: Workspace;
  value: T;
}

// ---------- helpers ----------

export const stageIndex = (s: Stage): number => STAGES.indexOf(s);

function find<T extends { id: ID }>(list: T[], id: ID, what: Entity): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new DomainError("error.notFound", { entity: `entity.${what}` });
  return item;
}

function replace<T extends { id: ID }>(list: T[], next: T): T[] {
  return list.map((x) => (x.id === next.id ? next : x));
}

function log(ws: Workspace, ctx: Ctx, kind: ActivityKind, targetType: TargetType, targetId: ID, params: ActivityParams): Workspace {
  const clean = stripEmpty(params);
  const entry: Activity = { id: ctx.newId("a"), actorId: ctx.actorId, kind, targetType, targetId, message: ctx.describe(clean), params: clean, at: ctx.now };
  return { ...ws, activity: [...ws.activity, entry] };
}

function setStage(ws: Workspace, ctx: Ctx, contentId: ID, stage: Stage, mode: "forward" | "force"): Workspace {
  const content = find(ws.contents, contentId, "content");
  if (content.stage === stage) return ws;
  if (mode === "forward" && stageIndex(stage) <= stageIndex(content.stage)) return ws;
  const next: Content = { ...content, stage, updatedAt: ctx.now };
  return { ...ws, contents: replace(ws.contents, next) };
}

function requireText(text: string | undefined, what: FieldKey): string {
  const t = (text ?? "").trim();
  if (!t) throw new DomainError("error.required", { field: `field.${what}` });
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
  find(ws.clients, input.clientId, "client");
  const title = requireText(input.title, "title");
  if (input.platforms.length === 0) throw new DomainError("error.noPlatform");
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
  next = log(next, ctx, "created", "content", id, { event: "content_created", title });
  return { ws: next, value: id };
}

export type ContentPatch = Partial<Pick<Content, "title" | "format" | "platforms" | "pillar" | "brief" | "assigneeIds" | "dueDate" | "publishAt">>;

export function updateContent(ws: Workspace, ctx: Ctx, id: ID, patch: ContentPatch): Workspace {
  const content = find(ws.contents, id, "content");
  if (patch.title !== undefined) requireText(patch.title, "title");
  if (patch.platforms !== undefined && patch.platforms.length === 0) throw new DomainError("error.noPlatform");
  const merged = { ...content, ...patch, updatedAt: ctx.now };
  // allow clearing optional fields by passing ""
  const next = stripEmpty(merged) as Content;
  return { ...ws, contents: replace(ws.contents, next) };
}

export function moveStage(ws: Workspace, ctx: Ctx, id: ID, stage: Stage): Workspace {
  const content = find(ws.contents, id, "content");
  if (content.stage === stage) return ws;
  const next = setStage(ws, ctx, id, stage, "force");
  return log(next, ctx, "stage_changed", "content", id, { event: "content_stage_changed", title: content.title, stage });
}

export function deleteContent(ws: Workspace, ctx: Ctx, id: ID): Result<string[]> {
  const content = find(ws.contents, id, "content");
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
  next = log(next, ctx, "updated", "client", content.clientId, { event: "content_deleted", title: content.title });
  return { ws: next, value: removedMedia.flatMap((m) => (m.storageKey ? [m.storageKey] : [])) };
}

// ---------- scripts ----------

export function currentScript(ws: Workspace, contentId: ID): Script | undefined {
  return ws.scripts
    .filter((s) => s.contentId === contentId)
    .reduce<Script | undefined>((best, s) => (!best || s.version > best.version ? s : best), undefined);
}

export function createScript(ws: Workspace, ctx: Ctx, contentId: ID): Result<ID> {
  const content = find(ws.contents, contentId, "content");
  if (currentScript(ws, contentId)) throw new DomainError("error.scriptExists");
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
  next = log(next, ctx, "created", "script", id, { event: "script_created", title: content.title });
  return { ws: next, value: id };
}

export type ScriptPatch = Partial<Pick<Script, "hook" | "scenes" | "caption" | "hashtags" | "cta">>;

export function updateScript(ws: Workspace, ctx: Ctx, scriptId: ID, patch: ScriptPatch): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  if (script.status !== "draft" && script.status !== "changes_requested") {
    throw new DomainError("error.scriptNotEditable");
  }
  if (patch.hashtags) {
    for (const h of patch.hashtags) {
      if (!/^#\S+$/.test(h)) throw new DomainError("error.invalidHashtag", { tag: h });
    }
  }
  if (patch.scenes) patch = { ...patch, scenes: patch.scenes.map((s) => stripEmpty(s) as Scene) };
  const next = stripEmpty({ ...script, ...patch, updatedAt: ctx.now }) as Script;
  return { ...ws, scripts: replace(ws.scripts, next) };
}

export function newScriptVersion(ws: Workspace, ctx: Ctx, scriptId: ID): Result<ID> {
  const script = find(ws.scripts, scriptId, "script");
  const latest = currentScript(ws, script.contentId);
  if (latest?.id !== script.id) throw new DomainError("error.scriptNotLatest");
  if (script.status !== "approved" && script.status !== "in_review") {
    throw new DomainError("error.scriptDraftNoVersion");
  }
  const id = ctx.newId("sc");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  const copy: Script = { ...rest, id, version: script.version + 1, status: "draft", updatedAt: ctx.now };
  let next: Workspace = { ...ws, scripts: [...ws.scripts, copy] };
  next = log(next, ctx, "created", "script", id, { event: "script_version_created", title: contentTitle(ws, script.contentId), version: copy.version });
  return { ws: next, value: id };
}

export function submitScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  if (script.status !== "draft" && script.status !== "changes_requested") {
    throw new DomainError("error.scriptNotDraft");
  }
  if (!script.hook.trim() && script.scenes.length === 0) throw new DomainError("error.scriptEmpty");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "in_review", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script_review", "forward");
  return log(next, ctx, "submitted", "script", scriptId, { event: "script_submitted", title: contentTitle(ws, script.contentId), version: script.version });
}

export function approveScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  if (script.status !== "in_review") throw new DomainError("error.scriptNotInReview");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...rest, status: "approved", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "shoot", "forward");
  return log(next, ctx, "approved", "script", scriptId, { event: "script_approved", title: contentTitle(ws, script.contentId), version: script.version });
}

export function requestScriptChanges(ws: Workspace, ctx: Ctx, scriptId: ID, note: string): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  if (script.status !== "in_review") throw new DomainError("error.scriptNotInReview");
  const reviewNote = requireText(note, "note");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "changes_requested", reviewNote, updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script", "force");
  return log(next, ctx, "changes_requested", "script", scriptId, { event: "script_changes_requested", title: contentTitle(ws, script.contentId), version: script.version });
}

// ---------- shots ----------

export type ShotInput = Omit<Shot, "id" | "contentId" | "order" | "done">;

export function shotsFor(ws: Workspace, contentId: ID): Shot[] {
  return ws.shots.filter((s) => s.contentId === contentId).sort((a, b) => a.order - b.order);
}

export function addShot(ws: Workspace, ctx: Ctx, contentId: ID, input: ShotInput): Result<ID> {
  find(ws.contents, contentId, "content");
  requireText(input.description, "description");
  const existing = shotsFor(ws, contentId);
  const id = ctx.newId("shot");
  const shot = stripEmpty({ ...input, description: input.description.trim(), id, contentId, order: existing.length, done: false }) as Shot;
  return { ws: { ...ws, shots: [...ws.shots, shot] }, value: id };
}

export function updateShot(ws: Workspace, _ctx: Ctx, shotId: ID, patch: Partial<ShotInput & { done: boolean }>): Workspace {
  const shot = find(ws.shots, shotId, "shot");
  if (patch.description !== undefined) requireText(patch.description, "description");
  const next = stripEmpty({ ...shot, ...patch }) as Shot;
  return { ...ws, shots: replace(ws.shots, next) };
}

export function deleteShot(ws: Workspace, _ctx: Ctx, shotId: ID): Workspace {
  const shot = find(ws.shots, shotId, "shot");
  const remaining = shotsFor(ws, shot.contentId).filter((s) => s.id !== shotId);
  const reordered = new Map(remaining.map((s, i) => [s.id, i]));
  return {
    ...ws,
    shots: ws.shots.filter((s) => s.id !== shotId).map((s) => (reordered.has(s.id) ? { ...s, order: reordered.get(s.id)! } : s)),
  };
}

export function moveShot(ws: Workspace, _ctx: Ctx, shotId: ID, direction: -1 | 1): Workspace {
  const shot = find(ws.shots, shotId, "shot");
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
  find(ws.clients, input.clientId, "client");
  requireText(input.title, "title");
  requireText(input.location.name, "location");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError("error.invalidDate");
  if (input.startTime > input.endTime) throw new DomainError("error.timeOrder");
  for (const cid of input.contentIds) {
    const c = find(ws.contents, cid, "content");
    if (c.clientId !== input.clientId) throw new DomainError("error.otherClient", { title: c.title });
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
  next = log(next, ctx, "created", "shoot", id, { event: "shoot_created", title: shoot.title, date: input.date });
  return { ws: next, value: id };
}

export function updateShoot(ws: Workspace, ctx: Ctx, id: ID, input: ShootInput): Workspace {
  find(ws.shoots, id, "shoot");
  validateShoot(ws, input);
  const shoot = stripEmpty({ ...input, contentIds: [...new Set(input.contentIds)], id }) as Shoot;
  let next: Workspace = { ...ws, shoots: replace(ws.shoots, shoot) };
  next = linkContents(next, ctx, id, shoot.contentIds);
  return log(next, ctx, "updated", "shoot", id, { event: "shoot_updated", title: shoot.title });
}

export function deleteShoot(ws: Workspace, ctx: Ctx, id: ID): Workspace {
  const shoot = find(ws.shoots, id, "shoot");
  let next = linkContents(ws, ctx, id, []);
  next = {
    ...next,
    shoots: next.shoots.filter((s) => s.id !== id),
    activity: next.activity.filter((a) => !(a.targetType === "shoot" && a.targetId === id)),
  };
  return log(next, ctx, "updated", "client", shoot.clientId, { event: "shoot_deleted", title: shoot.title });
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
  const content = find(ws.contents, input.contentId, "content");
  requireText(input.fileName, "fileName");
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
  const event = input.kind === "raw" ? "media_uploaded_raw" : input.kind === "thumbnail" ? "media_uploaded_thumbnail" : "media_uploaded_cut";
  return { ws: log(next, ctx, "uploaded", "media", id, { event, title: content.title, version: isReviewable ? version : undefined, fileName: input.fileName }), value: id };
}

function setMediaStatus(ws: Workspace, ctx: Ctx, asset: MediaAsset, status: MediaAsset["status"]): Workspace {
  void ctx;
  return { ...ws, media: replace(ws.media, { ...asset, status }) };
}

export function releaseForEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  if (asset.kind !== "raw" || asset.status !== "uploaded") throw new DomainError("error.rawNotUploaded");
  let next = setMediaStatus(ws, ctx, asset, "ready_for_edit");
  next = setStage(next, ctx, asset.contentId, "edit", "forward");
  return log(next, ctx, "released_for_edit", "media", mediaId, { event: "media_released", title: contentTitle(ws, asset.contentId), fileName: asset.fileName });
}

export function startEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  if (asset.kind !== "raw" || asset.status !== "ready_for_edit") throw new DomainError("error.rawNotReleased");
  const next = setMediaStatus(ws, ctx, asset, "in_edit");
  return log(next, ctx, "updated", "media", mediaId, { event: "media_edit_started", title: contentTitle(ws, asset.contentId), fileName: asset.fileName });
}

export function approveMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  if ((asset.kind !== "cut" && asset.kind !== "final") || asset.status !== "in_review") throw new DomainError("error.mediaNotInReview");
  let next = setMediaStatus(ws, ctx, asset, "approved");
  next = setStage(next, ctx, asset.contentId, "scheduled", "forward");
  return log(next, ctx, "approved", "media", mediaId, { event: "media_approved", title: contentTitle(ws, asset.contentId), version: asset.version, fileName: asset.fileName });
}

export function requestMediaChanges(ws: Workspace, ctx: Ctx, mediaId: ID, note: string): Workspace {
  const asset = find(ws.media, mediaId, "media");
  if ((asset.kind !== "cut" && asset.kind !== "final") || asset.status !== "in_review") throw new DomainError("error.mediaNotInReview");
  const text = requireText(note, "note");
  const comment = { id: ctx.newId("rc"), authorId: ctx.actorId, text, createdAt: ctx.now, resolved: false };
  let next: Workspace = { ...ws, media: replace(ws.media, { ...asset, status: "changes_requested", comments: [...asset.comments, comment] }) };
  next = setStage(next, ctx, asset.contentId, "edit", "force");
  return log(next, ctx, "changes_requested", "media", mediaId, { event: "media_changes_requested", title: contentTitle(ws, asset.contentId), version: asset.version, fileName: asset.fileName });
}

export function addComment(ws: Workspace, ctx: Ctx, mediaId: ID, text: string, timestampSec?: number): Workspace {
  const asset = find(ws.media, mediaId, "media");
  const body = requireText(text, "comment");
  let ts: number | undefined;
  if (timestampSec !== undefined && Number.isFinite(timestampSec)) {
    ts = Math.max(0, Math.round(timestampSec * 10) / 10);
    if (asset.durationSec !== undefined) ts = Math.min(ts, asset.durationSec);
  }
  const comment = stripEmpty({ id: ctx.newId("rc"), authorId: ctx.actorId, text: body, timestampSec: ts, createdAt: ctx.now, resolved: false });
  const next: Workspace = { ...ws, media: replace(ws.media, { ...asset, comments: [...asset.comments, comment] }) };
  return log(next, ctx, "commented", "media", mediaId, { event: "media_commented", title: contentTitle(ws, asset.contentId), fileName: asset.fileName });
}

export function toggleCommentResolved(ws: Workspace, _ctx: Ctx, mediaId: ID, commentId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  const comments = asset.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c));
  return { ...ws, media: replace(ws.media, { ...asset, comments }) };
}

export function deleteMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Result<string | undefined> {
  const asset = find(ws.media, mediaId, "media");
  let next: Workspace = {
    ...ws,
    media: ws.media.filter((m) => m.id !== mediaId),
    activity: ws.activity.filter((a) => !(a.targetType === "media" && a.targetId === mediaId)),
  };
  next = log(next, ctx, "updated", "content", asset.contentId, { event: "media_deleted", title: contentTitle(ws, asset.contentId), fileName: asset.fileName });
  return { ws: next, value: asset.storageKey };
}

// ---------- clients & team ----------

export type ClientInput = Omit<Client, "id">;

export function createClient(ws: Workspace, ctx: Ctx, input: ClientInput): Result<ID> {
  requireText(input.name, "name");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new DomainError("error.invalidColor");
  const id = ctx.newId("c");
  const client = stripEmpty({ ...input, name: input.name.trim(), id }) as Client;
  const next: Workspace = { ...ws, clients: [...ws.clients, client] };
  return { ws: log(next, ctx, "created", "client", id, { event: "client_created", title: client.name }), value: id };
}

export function updateClient(ws: Workspace, ctx: Ctx, id: ID, input: ClientInput): Workspace {
  find(ws.clients, id, "client");
  requireText(input.name, "name");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new DomainError("error.invalidColor");
  const client = stripEmpty({ ...input, name: input.name.trim(), id }) as Client;
  return log({ ...ws, clients: replace(ws.clients, client) }, ctx, "updated", "client", id, { event: "client_updated", title: client.name });
}

export type MemberInput = Omit<TeamMember, "id">;

export function addMember(ws: Workspace, ctx: Ctx, input: MemberInput): Result<ID> {
  requireText(input.name, "name");
  if (input.role === "client") find(ws.clients, input.clientId ?? "", "client");
  const id = ctx.newId("u");
  const member = stripEmpty({ ...input, name: input.name.trim(), clientId: input.role === "client" ? input.clientId : undefined, id }) as TeamMember;
  return { ws: { ...ws, team: [...ws.team, member] }, value: id };
}

export function setCurrentUser(ws: Workspace, userId: ID): Workspace {
  find(ws.team, userId, "member");
  return { ...ws, workspace: { ...ws.workspace, currentUserId: userId } };
}
