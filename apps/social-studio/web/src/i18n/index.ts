// i18n: dictionaries live in apps/social-studio/i18n/*.json and are shared with the iOS app.
// common.<lang>.json = domain vocabulary, errors, activity texts; web.<lang>.json = web UI strings.
import commonDe from "@i18n/common.de.json";
import commonEn from "@i18n/common.en.json";
import commonRu from "@i18n/common.ru.json";
import webDe from "@i18n/web.de.json";
import webEn from "@i18n/web.en.json";
import webRu from "@i18n/web.ru.json";

export const LANGS = ["de", "en", "ru"] as const;
export type Lang = (typeof LANGS)[number];

type Plural = { one?: string; few?: string; many?: string; other: string };
type Entry = string | Plural;

const de = { ...commonDe, ...webDe };
/** Every translation key. German is the reference dictionary; en/ru must contain the same keys (tested). */
export type TKey = keyof typeof de;
export type Params = Record<string, string | number>;

const DICTS: Record<Lang, Record<string, Entry>> = {
  de,
  en: { ...commonEn, ...webEn },
  ru: { ...commonRu, ...webRu },
};

export const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

export function detectLang(candidates: readonly string[] | undefined): Lang {
  for (const c of candidates ?? []) {
    const base = c.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

const pluralRules = new Map<Lang, Intl.PluralRules>();
function plural(lang: Lang, n: number): Intl.LDMLPluralRule {
  let r = pluralRules.get(lang);
  if (!r) {
    r = new Intl.PluralRules(LOCALE[lang]);
    pluralRules.set(lang, r);
  }
  return r.select(n);
}

export function translate(lang: Lang, key: TKey | string, params?: Params): string {
  const entry: Entry | undefined = DICTS[lang][key] ?? DICTS.de[key];
  if (entry === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  let text: string;
  if (typeof entry === "string") text = entry;
  else {
    const n = Number(params?.count ?? 0);
    const form = plural(lang, n);
    text = entry[form as keyof Plural] ?? entry.other;
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] !== undefined ? String(params[name]) : m));
}

// Module-level current language, used by non-React helpers (formatters). Kept in sync by the store.
let current: Lang = "de";
export const getLang = (): Lang => current;
export const setCurrentLang = (l: Lang): void => {
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
};
export const currentLocale = (): string => LOCALE[current];
export const t = (key: TKey, params?: Params): string => translate(current, key, params);
export type T = typeof t;

/** For tests / tooling. */
export const _dicts = DICTS;
