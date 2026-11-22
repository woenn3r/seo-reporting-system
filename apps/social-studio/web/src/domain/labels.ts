// Display labels come from i18n (apps/social-studio/i18n, keys stage.*, format.*, …). Only visual tones live here.
import type { MediaStatus, ScriptStatus, ShootStatus, Stage } from "./types";

export type Tone = "neutral" | "info" | "warn" | "success" | "danger" | "accent";

export const STAGE_TONE: Record<Stage, Tone> = {
  idea: "neutral",
  script: "info",
  script_review: "warn",
  shoot: "accent",
  edit: "info",
  cut_review: "warn",
  scheduled: "success",
  published: "success",
};

export const SCRIPT_STATUS_TONE: Record<ScriptStatus, Tone> = {
  draft: "neutral",
  in_review: "warn",
  changes_requested: "danger",
  approved: "success",
};

export const MEDIA_STATUS_TONE: Record<MediaStatus, Tone> = {
  uploaded: "neutral",
  ready_for_edit: "accent",
  in_edit: "info",
  in_review: "warn",
  changes_requested: "danger",
  approved: "success",
};

export const SHOOT_STATUS_TONE: Record<ShootStatus, Tone> = {
  planned: "neutral",
  confirmed: "info",
  done: "success",
  cancelled: "danger",
};
