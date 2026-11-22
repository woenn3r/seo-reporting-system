// Pure workflow actions. Implements apps/social-studio/DOMAIN_RULES.md.
// Every action takes the current workspace + a context and returns a NEW workspace (no mutation).
// The domain layer has no UI/i18n dependency: errors are keys + params, texts are rendered elsewhere.

import {
  STAGES,
  type Activity,
  type ActivityKind,
  type ActivityParams,
  type Client,
  type Content,
  type ID,
  type MediaAsset,
  type MediaKind,
  type Platform,
  type Scene,
  type Script,
  type Shoot,
  type Shot,
  type Stage,
  type TargetType,
  type TeamMember,
  type Workspace,
} from "./types";
import { can, memberOf, type Permission } from "./permissions";

/** i18n keys (common.<lang>.json) for rule violations. */
export type ErrorKey =
  | "error.notFound" | "error.required" | "error.noPlatform" | "error.forbidden"
  | "error.scriptExists" | "error.scriptNotEditable" | "error.scriptNotLatest" | "error.scriptDraftNoVersion"
  | "error.scriptNotDraft" | "error.scriptEmpty" | "error.scriptNotInReview" | "error.invalidHashtag"
  | "error.invalidDate" | "error.timeOrder" | "error.otherClient"
  | "error.rawNotUploaded" | "error.rawNotReleased" | "error.mediaNotInReview" | "error.notLatestVersion"
  | "error.invalidColor";

export type Entity = "content" | "client" | "script" | "shot" | "shoot" | "media" | "member";
export type FieldKey = "title" | "location" | "description" | "fileName" | "note" | "comment" | "name";

/**
 * Workflow rule violation. Language-neutral: `key` is an i18n key, `params` its values.
 * Params named `entity` / `field` are themselves i18n keys (`entity.script`, `field.title`).
 * Render with i18n/errors.ts → errorText().
 */
export class DomainError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
    this.name = "DomainError";
  }
}

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

/** Enforces the central permission matrix (domain/permissions.ts). */
function authorize(ws: Workspace, ctx: Ctx, permission: Permission, clientId?: ID): void {
  if (!can(memberOf(ws, ctx.actorId), permission, clientId)) throw new DomainError("error.forbidden");
}

/**
 * Contract: OPTIONAL fields are omitted rather than stored as "" / undefined.
 * Only the listed keys are touched – required fields (e.g. script.hook) may legitimately be "".
 */
function omitEmpty<T extends object>(obj: T, optionalKeys: readonly (keyof T)[]): T {
  const out = { ...obj };
  for (const k of optionalKeys) {
    const v = out[k];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) delete out[k];
    else if (typeof v === "string") out[k] = v.trim() as T[keyof T];
  }
  return out;
}

const CONTENT_OPTIONAL = ["pillar", "brief", "dueDate", "publishAt", "shootId"] as const;
const SCENE_OPTIONAL = ["voiceover", "onScreenText", "visual", "durationSec"] as const;
const SCRIPT_OPTIONAL = ["caption", "cta", "reviewNote"] as const;
const SHOT_OPTIONAL = ["sceneId", "lens", "notes"] as const;
const MEDIA_OPTIONAL = ["mimeType", "sizeBytes", "durationSec", "storageKey"] as const;
const CLIENT_OPTIONAL = ["industry", "handles", "contactName", "contactEmail", "brandNotes"] as const;
const MEMBER_OPTIONAL = ["email", "clientId"] as const;
const PARAMS_OPTIONAL = ["title", "version", "stage", "fileName", "date"] as const;

function log(ws: Workspace, ctx: Ctx, kind: ActivityKind, targetType: TargetType, targetId: ID, params: ActivityParams): Workspace {
  const clean = omitEmpty(params, PARAMS_OPTIONAL);
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

function contentOf(ws: Workspace, contentId: ID): Content {
  return find(ws.contents, contentId, "content");
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
  authorize(ws, ctx, "content.manage", input.clientId);
  const title = requireText(input.title, "title");
  if (input.platforms.length === 0) throw new DomainError("error.noPlatform");
  const id = ctx.newId("ct");
  const content = omitEmpty<Content>(
    {
      id,
      clientId: input.clientId,
      title,
      format: input.format,
      platforms: [...new Set(input.platforms)],
      stage: "idea",
      pillar: input.pillar,
      brief: input.brief,
      assigneeIds: [...new Set(input.assigneeIds ?? [])],
      dueDate: input.dueDate,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    },
    CONTENT_OPTIONAL,
  );
  let next: Workspace = { ...ws, contents: [...ws.contents, content] };
  next = log(next, ctx, "created", "content", id, { event: "content_created", title });
  return { ws: next, value: id };
}

/** Pass "" for an optional field to clear it. */
export type ContentPatch = Partial<Pick<Content, "title" | "format" | "platforms" | "pillar" | "brief" | "assigneeIds" | "dueDate" | "publishAt">>;

export function updateContent(ws: Workspace, ctx: Ctx, id: ID, patch: ContentPatch): Workspace {
  const content = contentOf(ws, id);
  authorize(ws, ctx, "content.manage", content.clientId);
  const merged: Content = { ...content, ...patch, updatedAt: ctx.now };
  if (patch.title !== undefined) merged.title = requireText(patch.title, "title");
  if (patch.platforms !== undefined) {
    if (patch.platforms.length === 0) throw new DomainError("error.noPlatform");
    merged.platforms = [...new Set(patch.platforms)];
  }
  if (patch.assigneeIds !== undefined) merged.assigneeIds = [...new Set(patch.assigneeIds)];
  return { ...ws, contents: replace(ws.contents, omitEmpty(merged, CONTENT_OPTIONAL)) };
}

export function moveStage(ws: Workspace, ctx: Ctx, id: ID, stage: Stage): Workspace {
  const content = contentOf(ws, id);
  authorize(ws, ctx, "content.manage", content.clientId);
  if (content.stage === stage) return ws;
  const next = setStage(ws, ctx, id, stage, "force");
  return log(next, ctx, "stage_changed", "content", id, { event: "content_stage_changed", title: content.title, stage });
}

/** Returns the storage keys of removed media so the caller can delete the binaries. */
export function deleteContent(ws: Workspace, ctx: Ctx, id: ID): Result<string[]> {
  const content = contentOf(ws, id);
  authorize(ws, ctx, "content.manage", content.clientId);
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
  const content = contentOf(ws, contentId);
  authorize(ws, ctx, "script.edit", content.clientId);
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

/** Pass "" for caption/cta to clear them. `hook` is required by the contract and may be "". */
export type ScriptPatch = Partial<Pick<Script, "hook" | "scenes" | "caption" | "hashtags" | "cta">>;

export function updateScript(ws: Workspace, ctx: Ctx, scriptId: ID, patch: ScriptPatch): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  authorize(ws, ctx, "script.edit", contentOf(ws, script.contentId).clientId);
  if (script.status !== "draft" && script.status !== "changes_requested") throw new DomainError("error.scriptNotEditable");
  const merged: Script = { ...script, ...patch, updatedAt: ctx.now };
  if (patch.hook !== undefined) merged.hook = patch.hook.trim();
  if (patch.hashtags) {
    for (const h of patch.hashtags) if (!/^#\S+$/.test(h)) throw new DomainError("error.invalidHashtag", { tag: h });
    merged.hashtags = [...new Set(patch.hashtags)];
  }
  if (patch.scenes) merged.scenes = patch.scenes.map((s) => omitEmpty<Scene>({ ...s, title: s.title.trim() }, SCENE_OPTIONAL));
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, omitEmpty(merged, SCRIPT_OPTIONAL)) };
  if (patch.scenes) {
    // shots must not keep references to scenes that no longer exist
    const sceneIds = new Set(merged.scenes.map((s) => s.id));
    next = {
      ...next,
      shots: next.shots.map((shot) => {
        if (shot.contentId !== script.contentId || shot.sceneId === undefined || sceneIds.has(shot.sceneId)) return shot;
        const { sceneId: _gone, ...rest } = shot;
        void _gone;
        return rest;
      }),
    };
  }
  return next;
}

export function newScriptVersion(ws: Workspace, ctx: Ctx, scriptId: ID): Result<ID> {
  const script = find(ws.scripts, scriptId, "script");
  const content = contentOf(ws, script.contentId);
  authorize(ws, ctx, "script.edit", content.clientId);
  if (currentScript(ws, script.contentId)?.id !== script.id) throw new DomainError("error.scriptNotLatest");
  if (script.status !== "approved" && script.status !== "in_review") throw new DomainError("error.scriptDraftNoVersion");
  const id = ctx.newId("sc");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  const copy: Script = { ...rest, id, version: script.version + 1, status: "draft", updatedAt: ctx.now };
  let next: Workspace = { ...ws, scripts: [...ws.scripts, copy] };
  // the version that was waiting for approval is superseded → nothing left to approve
  if (content.stage === "script_review") next = setStage(next, ctx, content.id, "script", "force");
  next = log(next, ctx, "created", "script", id, { event: "script_version_created", title: content.title, version: copy.version });
  return { ws: next, value: id };
}

const sceneHasText = (s: Scene): boolean => [s.voiceover, s.onScreenText, s.visual].some((x) => (x ?? "").trim() !== "");

export function submitScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  const content = contentOf(ws, script.contentId);
  authorize(ws, ctx, "script.edit", content.clientId);
  if (script.status !== "draft" && script.status !== "changes_requested") throw new DomainError("error.scriptNotDraft");
  if (!script.hook.trim() && !script.scenes.some(sceneHasText)) throw new DomainError("error.scriptEmpty");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "in_review", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script_review", "forward");
  return log(next, ctx, "submitted", "script", scriptId, { event: "script_submitted", title: content.title, version: script.version });
}

export function approveScript(ws: Workspace, ctx: Ctx, scriptId: ID): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  const content = contentOf(ws, script.contentId);
  authorize(ws, ctx, "script.review", content.clientId);
  if (script.status !== "in_review") throw new DomainError("error.scriptNotInReview");
  const { reviewNote: _drop, ...rest } = script;
  void _drop;
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...rest, status: "approved", updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "shoot", "forward");
  return log(next, ctx, "approved", "script", scriptId, { event: "script_approved", title: content.title, version: script.version });
}

export function requestScriptChanges(ws: Workspace, ctx: Ctx, scriptId: ID, note: string): Workspace {
  const script = find(ws.scripts, scriptId, "script");
  const content = contentOf(ws, script.contentId);
  authorize(ws, ctx, "script.review", content.clientId);
  if (script.status !== "in_review") throw new DomainError("error.scriptNotInReview");
  const reviewNote = requireText(note, "note");
  let next: Workspace = { ...ws, scripts: replace(ws.scripts, { ...script, status: "changes_requested", reviewNote, updatedAt: ctx.now }) };
  next = setStage(next, ctx, script.contentId, "script", "force");
  return log(next, ctx, "changes_requested", "script", scriptId, { event: "script_changes_requested", title: content.title, version: script.version });
}

// ---------- shots ----------

export type ShotInput = Omit<Shot, "id" | "contentId" | "order" | "done">;

export function shotsFor(ws: Workspace, contentId: ID): Shot[] {
  return ws.shots.filter((s) => s.contentId === contentId).sort((a, b) => a.order - b.order);
}

export function addShot(ws: Workspace, ctx: Ctx, contentId: ID, input: ShotInput): Result<ID> {
  authorize(ws, ctx, "shots.manage", contentOf(ws, contentId).clientId);
  const description = requireText(input.description, "description");
  const id = ctx.newId("shot");
  const shot = omitEmpty<Shot>({ ...input, description, id, contentId, order: shotsFor(ws, contentId).length, done: false }, SHOT_OPTIONAL);
  return { ws: { ...ws, shots: [...ws.shots, shot] }, value: id };
}

/** Pass "" (or undefined inside a full input) for sceneId/lens/notes to clear them. */
export function updateShot(ws: Workspace, ctx: Ctx, shotId: ID, patch: Partial<ShotInput & { done: boolean }>): Workspace {
  const shot = find(ws.shots, shotId, "shot");
  authorize(ws, ctx, "shots.manage", contentOf(ws, shot.contentId).clientId);
  const merged: Shot = { ...shot, ...patch };
  if (patch.description !== undefined) merged.description = requireText(patch.description, "description");
  return { ...ws, shots: replace(ws.shots, omitEmpty(merged, SHOT_OPTIONAL)) };
}

export function deleteShot(ws: Workspace, ctx: Ctx, shotId: ID): Workspace {
  const shot = find(ws.shots, shotId, "shot");
  authorize(ws, ctx, "shots.manage", contentOf(ws, shot.contentId).clientId);
  const remaining = shotsFor(ws, shot.contentId).filter((s) => s.id !== shotId);
  const reordered = new Map(remaining.map((s, i) => [s.id, i]));
  return {
    ...ws,
    shots: ws.shots.filter((s) => s.id !== shotId).map((s) => (reordered.has(s.id) ? { ...s, order: reordered.get(s.id)! } : s)),
  };
}

export function moveShot(ws: Workspace, ctx: Ctx, shotId: ID, direction: -1 | 1): Workspace {
  const shot = find(ws.shots, shotId, "shot");
  authorize(ws, ctx, "shots.manage", contentOf(ws, shot.contentId).clientId);
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

/** Validates and normalises a shoot (trimmed texts, no empty optionals, unique ids). */
function normalizeShoot(ws: Workspace, input: ShootInput, id: ID): Shoot {
  find(ws.clients, input.clientId, "client");
  const title = requireText(input.title, "title");
  const locationName = requireText(input.location.name, "location");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError("error.invalidDate");
  if (input.startTime > input.endTime) throw new DomainError("error.timeOrder");
  const contentIds = [...new Set(input.contentIds)];
  for (const cid of contentIds) {
    const c = contentOf(ws, cid);
    if (c.clientId !== input.clientId) throw new DomainError("error.otherClient", { title: c.title });
  }
  return omitEmpty<Shoot>(
    {
      id,
      clientId: input.clientId,
      title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: input.status,
      location: omitEmpty({ ...input.location, name: locationName }, ["address", "notes"]),
      teamIds: [...new Set(input.teamIds)],
      contentIds,
      equipment: input.equipment.map((e) => e.trim()).filter(Boolean),
      schedule: input.schedule.map((s) => ({ time: s.time, label: s.label.trim() })).filter((s) => s.label),
      notes: input.notes,
    },
    ["notes"],
  );
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
  authorize(ws, ctx, "shoot.manage", input.clientId);
  const id = ctx.newId("sh");
  const shoot = normalizeShoot(ws, input, id);
  let next: Workspace = { ...ws, shoots: [...ws.shoots, shoot] };
  next = linkContents(next, ctx, id, shoot.contentIds);
  next = log(next, ctx, "created", "shoot", id, { event: "shoot_created", title: shoot.title, date: shoot.date });
  return { ws: next, value: id };
}

export function updateShoot(ws: Workspace, ctx: Ctx, id: ID, input: ShootInput): Workspace {
  const existing = find(ws.shoots, id, "shoot");
  authorize(ws, ctx, "shoot.manage", existing.clientId);
  const shoot = normalizeShoot(ws, input, id);
  let next: Workspace = { ...ws, shoots: replace(ws.shoots, shoot) };
  next = linkContents(next, ctx, id, shoot.contentIds);
  return log(next, ctx, "updated", "shoot", id, { event: "shoot_updated", title: shoot.title });
}

export function deleteShoot(ws: Workspace, ctx: Ctx, id: ID): Workspace {
  const shoot = find(ws.shoots, id, "shoot");
  authorize(ws, ctx, "shoot.manage", shoot.clientId);
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

export const isReviewable = (m: Pick<MediaAsset, "kind">): boolean => m.kind === "cut" || m.kind === "final";

export function mediaFor(ws: Workspace, contentId: ID): MediaAsset[] {
  return ws.media.filter((m) => m.contentId === contentId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Newest cut/final of a content – the only version that can be approved or rejected. */
export function latestCut(ws: Workspace, contentId: ID): MediaAsset | undefined {
  return ws.media
    .filter((m) => m.contentId === contentId && isReviewable(m))
    .reduce<MediaAsset | undefined>((best, m) => (!best || m.version > best.version ? m : best), undefined);
}

export function addMedia(ws: Workspace, ctx: Ctx, input: NewMediaInput): Result<ID> {
  const content = contentOf(ws, input.contentId);
  authorize(ws, ctx, "media.upload", content.clientId);
  const fileName = requireText(input.fileName, "fileName");
  const reviewable = isReviewable(input);
  const sameTrack = ws.media.filter((m) => m.contentId === input.contentId && (reviewable ? isReviewable(m) : m.kind === input.kind));
  const version = sameTrack.reduce((max, m) => Math.max(max, m.version), 0) + 1;
  const id = ctx.newId("m");
  const asset = omitEmpty<MediaAsset>(
    {
      id,
      contentId: input.contentId,
      kind: input.kind,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes !== undefined && Number.isFinite(input.sizeBytes) ? Math.max(0, Math.round(input.sizeBytes)) : undefined,
      durationSec: input.durationSec !== undefined && Number.isFinite(input.durationSec) ? Math.max(0, input.durationSec) : undefined,
      version,
      status: reviewable ? "in_review" : "uploaded",
      storageKey: input.storageKey,
      uploadedById: ctx.actorId,
      uploadedAt: ctx.now,
      comments: [],
    },
    MEDIA_OPTIONAL,
  );
  let next: Workspace = { ...ws, media: [...ws.media, asset] };
  if (reviewable) next = setStage(next, ctx, input.contentId, "cut_review", "forward");
  const event = input.kind === "raw" ? "media_uploaded_raw" : input.kind === "thumbnail" ? "media_uploaded_thumbnail" : "media_uploaded_cut";
  next = log(next, ctx, "uploaded", "media", id, { event, title: content.title, version: reviewable ? version : undefined, fileName });
  return { ws: next, value: id };
}

function setMediaStatus(ws: Workspace, asset: MediaAsset, status: MediaAsset["status"]): Workspace {
  return { ...ws, media: replace(ws.media, { ...asset, status }) };
}

export function releaseForEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  const content = contentOf(ws, asset.contentId);
  authorize(ws, ctx, "media.manage", content.clientId);
  if (asset.kind !== "raw" || asset.status !== "uploaded") throw new DomainError("error.rawNotUploaded");
  let next = setMediaStatus(ws, asset, "ready_for_edit");
  next = setStage(next, ctx, asset.contentId, "edit", "forward");
  return log(next, ctx, "released_for_edit", "media", mediaId, { event: "media_released", title: content.title, fileName: asset.fileName });
}

export function startEdit(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  const content = contentOf(ws, asset.contentId);
  authorize(ws, ctx, "media.manage", content.clientId);
  if (asset.kind !== "raw" || asset.status !== "ready_for_edit") throw new DomainError("error.rawNotReleased");
  const next = setMediaStatus(ws, asset, "in_edit");
  return log(next, ctx, "updated", "media", mediaId, { event: "media_edit_started", title: content.title, fileName: asset.fileName });
}

function reviewableAsset(ws: Workspace, ctx: Ctx, mediaId: ID): { asset: MediaAsset; content: Content } {
  const asset = find(ws.media, mediaId, "media");
  const content = contentOf(ws, asset.contentId);
  authorize(ws, ctx, "media.review", content.clientId);
  if (!isReviewable(asset) || asset.status !== "in_review") throw new DomainError("error.mediaNotInReview");
  if (latestCut(ws, asset.contentId)?.id !== asset.id) throw new DomainError("error.notLatestVersion");
  return { asset, content };
}

export function approveMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Workspace {
  const { asset, content } = reviewableAsset(ws, ctx, mediaId);
  let next = setMediaStatus(ws, asset, "approved");
  next = setStage(next, ctx, asset.contentId, "scheduled", "forward");
  return log(next, ctx, "approved", "media", mediaId, { event: "media_approved", title: content.title, version: asset.version, fileName: asset.fileName });
}

export function requestMediaChanges(ws: Workspace, ctx: Ctx, mediaId: ID, note: string): Workspace {
  const { asset, content } = reviewableAsset(ws, ctx, mediaId);
  const text = requireText(note, "note");
  const comment = { id: ctx.newId("rc"), authorId: ctx.actorId, text, createdAt: ctx.now, resolved: false };
  let next: Workspace = { ...ws, media: replace(ws.media, { ...asset, status: "changes_requested", comments: [...asset.comments, comment] }) };
  next = setStage(next, ctx, asset.contentId, "edit", "force");
  return log(next, ctx, "changes_requested", "media", mediaId, { event: "media_changes_requested", title: content.title, version: asset.version, fileName: asset.fileName });
}

/** Comment permission incl. the rule that client users never touch raw footage. */
function authorizeComment(ws: Workspace, ctx: Ctx, asset: MediaAsset): Content {
  const content = contentOf(ws, asset.contentId);
  authorize(ws, ctx, "media.comment", content.clientId);
  if (asset.kind === "raw") authorize(ws, ctx, "media.viewRaw", content.clientId);
  return content;
}

export function addComment(ws: Workspace, ctx: Ctx, mediaId: ID, text: string, timestampSec?: number): Workspace {
  const asset = find(ws.media, mediaId, "media");
  const content = authorizeComment(ws, ctx, asset);
  const body = requireText(text, "comment");
  let ts: number | undefined;
  if (timestampSec !== undefined && Number.isFinite(timestampSec)) {
    ts = Math.max(0, Math.round(timestampSec * 10) / 10);
    if (asset.durationSec !== undefined) ts = Math.min(ts, asset.durationSec);
  }
  const comment = omitEmpty({ id: ctx.newId("rc"), authorId: ctx.actorId, text: body, timestampSec: ts, createdAt: ctx.now, resolved: false }, ["timestampSec"]);
  const next: Workspace = { ...ws, media: replace(ws.media, { ...asset, comments: [...asset.comments, comment] }) };
  return log(next, ctx, "commented", "media", mediaId, { event: "media_commented", title: content.title, fileName: asset.fileName });
}

export function toggleCommentResolved(ws: Workspace, ctx: Ctx, mediaId: ID, commentId: ID): Workspace {
  const asset = find(ws.media, mediaId, "media");
  authorizeComment(ws, ctx, asset);
  const comments = asset.comments.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c));
  return { ...ws, media: replace(ws.media, { ...asset, comments }) };
}

/** Returns the storage key of the removed binary (if any) so the caller can delete it. */
export function deleteMedia(ws: Workspace, ctx: Ctx, mediaId: ID): Result<string | undefined> {
  const asset = find(ws.media, mediaId, "media");
  const content = contentOf(ws, asset.contentId);
  authorize(ws, ctx, "media.manage", content.clientId);
  let next: Workspace = {
    ...ws,
    media: ws.media.filter((m) => m.id !== mediaId),
    activity: ws.activity.filter((a) => !(a.targetType === "media" && a.targetId === mediaId)),
  };
  next = log(next, ctx, "updated", "content", asset.contentId, { event: "media_deleted", title: content.title, fileName: asset.fileName });
  return { ws: next, value: asset.storageKey };
}

// ---------- clients & team ----------

export type ClientInput = Omit<Client, "id">;

function normalizeClient(input: ClientInput, id: ID): Client {
  const name = requireText(input.name, "name");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new DomainError("error.invalidColor");
  const handles = Object.fromEntries(
    Object.entries(input.handles ?? {})
      .map(([k, v]) => [k, (v ?? "").trim()] as const)
      .filter(([, v]) => v !== ""),
  ) as Partial<Record<Platform, string>>;
  return omitEmpty<Client>(
    {
      ...input,
      id,
      name,
      handles: Object.keys(handles).length > 0 ? handles : undefined,
      pillars: [...new Set((input.pillars ?? []).map((p) => p.trim()).filter(Boolean))],
    },
    CLIENT_OPTIONAL,
  );
}

export function createClient(ws: Workspace, ctx: Ctx, input: ClientInput): Result<ID> {
  authorize(ws, ctx, "admin.clients");
  const id = ctx.newId("c");
  const client = normalizeClient(input, id);
  const next: Workspace = { ...ws, clients: [...ws.clients, client] };
  return { ws: log(next, ctx, "created", "client", id, { event: "client_created", title: client.name }), value: id };
}

export function updateClient(ws: Workspace, ctx: Ctx, id: ID, input: ClientInput): Workspace {
  find(ws.clients, id, "client");
  authorize(ws, ctx, "admin.clients");
  const client = normalizeClient(input, id);
  return log({ ...ws, clients: replace(ws.clients, client) }, ctx, "updated", "client", id, { event: "client_updated", title: client.name });
}

export type MemberInput = Omit<TeamMember, "id">;

export function addMember(ws: Workspace, ctx: Ctx, input: MemberInput): Result<ID> {
  authorize(ws, ctx, "admin.team");
  const name = requireText(input.name, "name");
  if (input.role === "client") find(ws.clients, input.clientId ?? "", "client");
  const id = ctx.newId("u");
  const member = omitEmpty<TeamMember>({ ...input, name, clientId: input.role === "client" ? input.clientId : undefined, id }, MEMBER_OPTIONAL);
  return { ws: { ...ws, team: [...ws.team, member] }, value: id };
}

/** Demo-only user switch (a real deployment authenticates instead). */
export function setCurrentUser(ws: Workspace, userId: ID): Workspace {
  find(ws.team, userId, "member");
  return { ...ws, workspace: { ...ws.workspace, currentUserId: userId } };
}
