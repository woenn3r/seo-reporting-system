import type { Activity, ActivityParams } from "../domain/types";
import { fmtDate } from "../domain/format";
import { translate, type Lang } from "./index";

export function describeActivity(lang: Lang, p: ActivityParams): string {
  return translate(lang, `activity.${p.event}`, {
    title: p.title ?? "",
    version: p.version ?? "",
    fileName: p.fileName ?? p.title ?? "",
    stageLabel: p.stage ? translate(lang, `stage.${p.stage}`) : "",
    date: p.date ? fmtDate(p.date) : "",
  });
}

/** Viewer-language text for a feed entry; legacy entries without params fall back to the stored message. */
export function activityText(lang: Lang, a: Activity): string {
  return a.params ? describeActivity(lang, a.params) : a.message;
}
