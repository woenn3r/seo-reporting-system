import type {
  Angle, AspectRatio, Format, Framing, MediaKind, MediaStatus, Movement, Platform, Role, ScriptStatus, ShootStatus, Stage,
} from "./types";

export const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idee",
  script: "Skript",
  script_review: "Skript-Freigabe",
  shoot: "Dreh",
  edit: "Schnitt",
  cut_review: "Schnitt-Freigabe",
  scheduled: "Geplant",
  published: "Veröffentlicht",
};

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reel",
  tiktok: "TikTok",
  short: "Short",
  story: "Story",
  carousel: "Karussell",
  post: "Bild-Post",
  longform: "Longform-Video",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  pinterest: "Pinterest",
};

export const ROLE_LABEL: Record<Role, string> = {
  lead: "Lead / Projektleitung",
  strategist: "Strategie & Text",
  creator: "Creator",
  videographer: "Videograf:in",
  editor: "Cutter:in",
  client: "Kunde",
};

export const FRAMING_LABEL: Record<Framing, string> = {
  extreme_wide: "Panorama / Supertotale",
  wide: "Totale",
  medium: "Halbtotale / Halbnah",
  medium_close: "Nah (Brust)",
  close_up: "Großaufnahme",
  extreme_close_up: "Detail extrem",
  detail: "Detail",
};

export const ANGLE_LABEL: Record<Angle, string> = {
  eye_level: "Augenhöhe",
  high: "Aufsicht",
  low: "Untersicht",
  birds_eye: "Vogelperspektive",
  worms_eye: "Froschperspektive",
  dutch: "Gekippt (Dutch Angle)",
  pov: "POV / Ich-Perspektive",
  over_shoulder: "Over-the-Shoulder",
};

export const MOVEMENT_LABEL: Record<Movement, string> = {
  static: "Statisch (Stativ)",
  pan: "Schwenk",
  tilt: "Neigen (Tilt)",
  dolly: "Fahrt (Dolly)",
  gimbal_follow: "Gimbal-Verfolgung",
  handheld: "Handkamera",
  zoom: "Zoom",
  orbit: "Kreisfahrt (Orbit)",
  slider: "Slider",
};

export const ASPECT_LABEL: Record<AspectRatio, string> = {
  "9:16": "9:16 Hochformat",
  "4:5": "4:5 Feed",
  "1:1": "1:1 Quadrat",
  "16:9": "16:9 Querformat",
};

export const SCRIPT_STATUS_LABEL: Record<ScriptStatus, string> = {
  draft: "Entwurf",
  in_review: "In Freigabe",
  changes_requested: "Änderungen angefordert",
  approved: "Freigegeben",
};

export const SHOOT_STATUS_LABEL: Record<ShootStatus, string> = {
  planned: "Geplant",
  confirmed: "Bestätigt",
  done: "Abgedreht",
  cancelled: "Abgesagt",
};

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  raw: "Rohmaterial",
  cut: "Schnittversion",
  final: "Finale Version",
  thumbnail: "Thumbnail",
};

export const MEDIA_STATUS_LABEL: Record<MediaStatus, string> = {
  uploaded: "Hochgeladen",
  ready_for_edit: "Zum Schnitt freigegeben",
  in_edit: "Im Schnitt",
  in_review: "In Freigabe",
  changes_requested: "Änderungen angefordert",
  approved: "Freigegeben",
};

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
