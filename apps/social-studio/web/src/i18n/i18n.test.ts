import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LANGS, translate, setCurrentLang, _dicts } from "./index";
import { describeActivity } from "./activity";
import {
  ACTIVITY_EVENTS, ANGLES, ASPECT_RATIOS, FORMATS, FRAMINGS, MOVEMENTS, PLATFORMS, ROLES, STAGES,
} from "../domain/types";
import { DomainError } from "../domain/actions";

const I18N_DIR = join(__dirname, "../../../i18n");
const files = readdirSync(I18N_DIR).filter((f) => f.endsWith(".json"));
const namespaces = [...new Set(files.map((f) => f.split(".")[0]!))];
const load = (ns: string, lang: string): Record<string, unknown> => JSON.parse(readFileSync(join(I18N_DIR, `${ns}.${lang}.json`), "utf8"));
const placeholders = (v: unknown): string[] => {
  const texts = typeof v === "string" ? [v] : Object.values(v as Record<string, string>);
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))].sort();
};
const REQUIRED_PLURALS: Record<string, string[]> = { de: ["one", "other"], en: ["one", "other"], ru: ["one", "few", "many", "other"] };

describe("dictionary files", () => {
  it.each(namespaces)("%s: every language has exactly the same keys, placeholders and plural forms", (ns) => {
    const de = load(ns, "de");
    for (const lang of LANGS) {
      const d = load(ns, lang);
      expect(Object.keys(d).sort(), `${ns}.${lang} keys`).toEqual(Object.keys(de).sort());
      for (const [k, v] of Object.entries(d)) {
        expect(typeof v === "string" || typeof v === "object", `${ns}.${lang}:${k}`).toBe(true);
        expect(placeholders(v), `${ns}.${lang}:${k} placeholders`).toEqual(placeholders(de[k]));
        if (typeof v === "string") expect(v.trim().length, `${ns}.${lang}:${k} empty`).toBeGreaterThan(0);
        else {
          expect(typeof de[k], `${ns}.${lang}:${k} plural in de too`).toBe("object");
          for (const form of REQUIRED_PLURALS[lang]!) expect((v as Record<string, string>)[form], `${ns}.${lang}:${k}.${form}`).toBeTruthy();
        }
      }
    }
  });

  it("web and common namespaces do not overlap", () => {
    for (const lang of LANGS) {
      const overlap = Object.keys(load("web", lang)).filter((k) => k in load("common", lang));
      expect(overlap).toEqual([]);
    }
  });
});

describe("domain vocabulary is complete", () => {
  const groups: [string, readonly string[]][] = [
    ["stage", STAGES], ["format", FORMATS], ["platform", PLATFORMS], ["role", ROLES], ["framing", FRAMINGS],
    ["angle", ANGLES], ["movement", MOVEMENTS], ["aspect", ASPECT_RATIOS], ["activity", ACTIVITY_EVENTS],
    ["scriptStatus", ["draft", "in_review", "changes_requested", "approved"]],
    ["shootStatus", ["planned", "confirmed", "done", "cancelled"]],
    ["mediaKind", ["raw", "cut", "final", "thumbnail"]],
    ["mediaStatus", ["uploaded", "ready_for_edit", "in_edit", "in_review", "changes_requested", "approved"]],
  ];
  it.each(groups)("%s.* exists for every enum value in every language", (prefix, values) => {
    for (const lang of LANGS) for (const v of values) expect(_dicts[lang][`${prefix}.${v}`], `${lang}: ${prefix}.${v}`).toBeDefined();
  });
});

describe("rendering", () => {
  it("uses correct Russian plural forms", () => {
    const r = (n: number) => translate("ru", "media.openComments", { count: n });
    expect(r(1)).toBe("1 открытый комментарий");
    expect(r(2)).toBe("2 открытых комментария");
    expect(r(5)).toBe("5 открытых комментариев");
    expect(r(11)).toBe("11 открытых комментариев");
    expect(r(21)).toBe("21 открытый комментарий");
    expect(r(22)).toBe("22 открытых комментария");
    expect(r(111)).toBe("111 открытых комментариев");
  });

  it("uses correct German/English plural forms", () => {
    expect(translate("de", "approvals.scenes", { count: 1 })).toBe("1 Szene");
    expect(translate("de", "approvals.scenes", { count: 4 })).toBe("4 Szenen");
    expect(translate("en", "approvals.scenes", { count: 1 })).toBe("1 scene");
    expect(translate("en", "approvals.scenes", { count: 0 })).toBe("0 scenes");
  });

  it("renders every activity event in every language without leftover placeholders", () => {
    for (const lang of LANGS) {
      for (const event of ACTIVITY_EVENTS) {
        const text = describeActivity(lang, { event, title: "X", version: 2, stage: "edit", fileName: "a.mp4", date: "2026-11-19" });
        expect(text, `${lang}:${event}`).not.toMatch(/[{}]/);
        expect(text.length).toBeGreaterThan(3);
      }
    }
    expect(describeActivity("ru", { event: "content_stage_changed", title: "X", stage: "edit" })).toBe("переместил(а) «X» в «Монтаж»");
  });

  it("translates domain errors including nested entity/field keys", () => {
    setCurrentLang("en");
    expect(new DomainError("error.required", { field: "field.title" }).message).toBe("Title must not be empty.");
    setCurrentLang("ru");
    expect(new DomainError("error.notFound", { entity: "entity.shoot" }).message).toBe("Съёмка: не найдено.");
    setCurrentLang("de");
    expect(new DomainError("error.invalidHashtag", { tag: "abc" }).message).toBe("Ungültiger Hashtag: „abc“ (Format: #wort).");
  });
});

describe("no hard-coded UI text in components", () => {
  const SRC = join(__dirname, "..");
  const tsx: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) tsx.push(p);
    }
  };
  walk(SRC);
  const ALLOWED = new Set(["Social Studio", "S", "@handle"]);
  // code fragments that only look like JSX text (comparisons, type annotations)
  const isCode = (s: string) => /[;=]|^[\w$]+(\.[\w$]+)+$/.test(s);
  it.each(tsx.map((p) => [p.slice(SRC.length + 1), p]))("%s", (_name, path) => {
    const code = readFileSync(path, "utf8");
    const problems: string[] = [];
    // JSX text nodes containing letters
    for (const m of code.matchAll(/>([^<>{}]*\p{L}{2,}[^<>{}]*)</gu)) {
      const txt = m[1]!.trim();
      if (txt && !ALLOWED.has(txt) && !isCode(txt) && !/=>|\(|\)|&&|\|\|/.test(txt)) problems.push(`text: "${txt}"`);
    }
    // user-visible string attributes
    for (const m of code.matchAll(/\b(title|label|placeholder|aria-label|sub|hint|alt)="([^"]*\p{L}[^"]*)"/gu)) if (!ALLOWED.has(m[2]!)) problems.push(`${m[1]}="${m[2]}"`);
    // toast/confirm with literal strings
    for (const m of code.matchAll(/\b(toast|confirm|alert)\(\s*["`]/g)) problems.push(`${m[1]}(literal)`);
    expect(problems).toEqual([]);
  });
});
