import { currentLocale } from "./index";

// Formatters follow the current UI language (de-DE / en-GB / ru-RU). Cached per locale.
const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(kind: "date" | "dateTime" | "short" | "time", locale = currentLocale()): Intl.DateTimeFormat {
  const key = `${locale}|${kind}`;
  let f = cache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === "date"
        ? { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }
        : kind === "dateTime"
          ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
          : kind === "short"
            ? { day: "2-digit", month: "short" }
            : { hour: "2-digit", minute: "2-digit" };
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/** "YYYY-MM-DD" is a calendar date; parse it as local date to avoid timezone shifts. */
export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

export const fmtDate = (d: string): string => dtf("date").format(parseDate(d));
export const fmtShortDate = (d: string): string => dtf("short").format(parseDate(d));
export const fmtShortIso = (iso: string): string => dtf("short").format(new Date(iso));
export const fmtDateTime = (iso: string): string => dtf("dateTime").format(new Date(iso));
export const fmtTime = (d: Date): string => dtf("time").format(d);
export const fmtMonth = (y: number, m: number): string =>
  new Intl.DateTimeFormat(currentLocale(), { month: "long", year: "numeric" }).format(new Date(y, m, 1));
/** Monday-first short weekday names in the current locale. */
export function weekdayNames(): string[] {
  const f = new Intl.DateTimeFormat(currentLocale(), { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i))); // 2024-01-01 is a Monday
}

export function fmtRelative(iso: string, now = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDateTime(iso);
}

export function fmtDuration(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return "–";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

const UNITS: Record<string, string[]> = {
  "de-DE": ["B", "KB", "MB", "GB", "TB"],
  "en-GB": ["B", "KB", "MB", "GB", "TB"],
  "ru-RU": ["Б", "КБ", "МБ", "ГБ", "ТБ"],
};
export function fmtBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "–";
  const units = UNITS[currentLocale()] ?? UNITS["en-GB"]!;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(currentLocale(), { maximumFractionDigits: i >= 3 ? 1 : 0 })} ${units[i]}`;
}

/** datetime-local input <-> ISO */
export function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
