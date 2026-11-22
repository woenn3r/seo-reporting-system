import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";

export const LANGS = ["de", "en", "ru"] as const;
export type Lang = (typeof LANGS)[number];
const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

const I18N = fileURLToPath(new URL("../../i18n/", import.meta.url));
type Entry = string | Record<string, string>;
const read = (f: string): Record<string, Entry> => JSON.parse(readFileSync(I18N + f, "utf8"));
export const DICT: Record<Lang, Record<string, Entry>> = Object.fromEntries(
  LANGS.map((l) => [l, { ...read(`common.${l}.json`), ...read(`web.${l}.json`) }]),
) as Record<Lang, Record<string, Entry>>;

/** Same rendering rules as the app (src/i18n/index.ts). */
export function L(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const e = DICT[lang][key];
  if (e === undefined) throw new Error(`unknown i18n key ${key}`);
  const text = typeof e === "string" ? e : e[new Intl.PluralRules(LOCALE[lang]).select(Number(params.count ?? 0))] ?? e.other!;
  return text.replace(/\{(\w+)\}/g, (m, n: string) => (params[n] !== undefined ? String(params[n]) : m));
}

export const SEED_TEXT = readFileSync(fileURLToPath(new URL("../../../../examples/social_studio/workspace.json", import.meta.url)), "utf8");

export const ROUTES = [
  "/", "/pipeline", "/pipeline?stage=edit", "/content/ct_latte_art", "/content/ct_latte_art?tab=script", "/content/ct_winterkarte?tab=script",
  "/content/ct_latte_art?tab=shots", "/content/ct_kniebeuge?tab=media", "/content/ct_kniebeuge?tab=activity", "/scripts", "/shotlists",
  "/shoots", "/shoots/sh_morgenrot_nov", "/media", "/media/m_kb_cut_v2", "/approvals", "/calendar", "/clients", "/team", "/settings",
];

/** Preselects the UI language for a fresh browser context (only if none was chosen yet). */
export async function useLang(page: Page, lang: Lang) {
  await page.addInitScript((l) => {
    if (!localStorage.getItem("social-studio:v1:ui")) localStorage.setItem("social-studio:v1:ui", JSON.stringify({ clientFilter: null, lang: l }));
  }, lang);
}

/** Fails a test on uncaught page errors, console errors or missing i18n keys. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" || m.text().includes("[i18n]")) errors.push(`console: ${m.text()}`);
      });
      page.on("dialog", (d) => void d.accept());
      await use(errors);
      expect(errors, "browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
