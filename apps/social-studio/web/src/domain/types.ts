// TypeScript mirror of contracts/social_studio/v1.schema.json (SSOT).
// Keep in sync with the schema; src/domain/validate.ts validates against the schema at runtime.

export type ID = string;
export type ISODateTime = string; // RFC 3339, e.g. 2026-11-15T12:00:00.000Z
export type ISODate = string; // YYYY-MM-DD
export type ClockTime = string; // HH:mm

export const PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "pinterest"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const FORMATS = ["reel", "tiktok", "short", "story", "carousel", "post", "longform"] as const;
export type Format = (typeof FORMATS)[number];

export const ASPECT_RATIOS = ["9:16", "4:5", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const STAGES = ["idea", "script", "script_review", "shoot", "edit", "cut_review", "scheduled", "published"] as const;
export type Stage = (typeof STAGES)[number];

export const ROLES = ["lead", "strategist", "creator", "videographer", "editor", "client"] as const;
export type Role = (typeof ROLES)[number];

export const FRAMINGS = ["extreme_wide", "wide", "medium", "medium_close", "close_up", "extreme_close_up", "detail"] as const;
export type Framing = (typeof FRAMINGS)[number];

export const ANGLES = ["eye_level", "high", "low", "birds_eye", "worms_eye", "dutch", "pov", "over_shoulder"] as const;
export type Angle = (typeof ANGLES)[number];

export const MOVEMENTS = ["static", "pan", "tilt", "dolly", "gimbal_follow", "handheld", "zoom", "orbit", "slider"] as const;
export type Movement = (typeof MOVEMENTS)[number];

export type ScriptStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type ShootStatus = "planned" | "confirmed" | "done" | "cancelled";
export type MediaKind = "raw" | "cut" | "final" | "thumbnail";
export type MediaStatus = "uploaded" | "ready_for_edit" | "in_edit" | "in_review" | "changes_requested" | "approved";
export type ActivityKind =
  | "created"
  | "updated"
  | "stage_changed"
  | "submitted"
  | "approved"
  | "changes_requested"
  | "uploaded"
  | "released_for_edit"
  | "commented";
export type TargetType = "content" | "script" | "shoot" | "media" | "client";

export interface TeamMember {
  id: ID;
  name: string;
  role: Role;
  email?: string;
  clientId?: ID;
}

export interface Client {
  id: ID;
  name: string;
  industry?: string;
  color: string;
  active: boolean;
  handles?: Partial<Record<Platform, string>>;
  contactName?: string;
  contactEmail?: string;
  brandNotes?: string;
  pillars?: string[];
}

export interface Content {
  id: ID;
  clientId: ID;
  title: string;
  format: Format;
  platforms: Platform[];
  stage: Stage;
  pillar?: string;
  brief?: string;
  assigneeIds: ID[];
  dueDate?: ISODate;
  publishAt?: ISODateTime;
  shootId?: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Scene {
  id: ID;
  title: string;
  voiceover?: string;
  onScreenText?: string;
  visual?: string;
  durationSec?: number;
}

export interface Script {
  id: ID;
  contentId: ID;
  version: number;
  status: ScriptStatus;
  hook: string;
  scenes: Scene[];
  caption?: string;
  hashtags?: string[];
  cta?: string;
  reviewNote?: string;
  updatedAt: ISODateTime;
}

export interface Shot {
  id: ID;
  contentId: ID;
  sceneId?: ID;
  order: number;
  description: string;
  framing: Framing;
  angle: Angle;
  movement: Movement;
  aspectRatio: AspectRatio;
  lens?: string;
  notes?: string;
  done: boolean;
}

export interface CallSheetEntry {
  time: ClockTime;
  label: string;
}

export interface Shoot {
  id: ID;
  clientId: ID;
  title: string;
  date: ISODate;
  startTime: ClockTime;
  endTime: ClockTime;
  status: ShootStatus;
  location: { name: string; address?: string; notes?: string };
  teamIds: ID[];
  contentIds: ID[];
  equipment: string[];
  schedule: CallSheetEntry[];
  notes?: string;
}

export interface ReviewComment {
  id: ID;
  authorId: ID;
  text: string;
  timestampSec?: number;
  createdAt: ISODateTime;
  resolved: boolean;
}

export interface MediaAsset {
  id: ID;
  contentId: ID;
  kind: MediaKind;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  version: number;
  status: MediaStatus;
  storageKey?: string;
  uploadedById: ID;
  uploadedAt: ISODateTime;
  comments: ReviewComment[];
}

export interface Activity {
  id: ID;
  actorId: ID;
  kind: ActivityKind;
  targetType: TargetType;
  targetId: ID;
  message: string;
  at: ISODateTime;
}

export interface Workspace {
  schemaVersion: 1;
  workspace: { id: ID; name: string; currentUserId: ID };
  team: TeamMember[];
  clients: Client[];
  contents: Content[];
  scripts: Script[];
  shots: Shot[];
  shoots: Shoot[];
  media: MediaAsset[];
  activity: Activity[];
}
