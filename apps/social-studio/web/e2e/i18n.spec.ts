import type { Page } from "@playwright/test";
import { DICT, LANGS, L, ROUTES, SEED_TEXT, expect, test, useLang, type Lang } from "./helpers";

const strings = (lang: Lang) => Object.values(DICT[lang]).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v)));
/** Static text fragments unique to one language (not shared with others, not in demo content). */
function fragments(lang: Lang): string[] {
  const others = LANGS.filter((o) => o !== lang).flatMap(strings);
  const out = new Set<string>();
  for (const s of strings(lang))
    for (const part of s.split(/\{\w+\}/)) {
      const p = part.trim().replace(/[.:…·,]+$/, "").trim();
      if (p.length >= 6 && !others.some((o) => o.includes(p)) && !SEED_TEXT.includes(p)) out.add(p);
    }
  return [...out];
}
const allKeys = new Set(Object.keys(DICT.de));

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts = [document.body.innerText];
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title],option,dialog")) {
      for (const a of ["placeholder", "aria-label", "title"]) if (el.getAttribute(a)) parts.push(el.getAttribute(a)!);
      if (el.tagName === "OPTION" || el.tagName === "DIALOG") parts.push(el.textContent ?? "");
    }
    return parts.join("\n");
  });
}

for (const lang of LANGS) {
  test(`every page is fully in ${lang} (agency + client view, dialogs, errors)`, async ({ page }) => {
    await useLang(page, lang);
    const texts: string[] = [];
    page.on("dialog", (d) => texts.push(d.message()));
    for (const r of ROUTES) {
      await page.goto(r);
      await expect(page.locator("h1").first()).toBeVisible();
      texts.push(await visibleText(page));
    }
    // dialogs + a domain error toast (no platform selected)
    await page.goto("/pipeline");
    await page.getByRole("button", { name: `+ ${L(lang, "content.new")}` }).click();
    texts.push(await visibleText(page));
    await page.locator("dialog .chip[aria-pressed=true]").first().click();
    await page.getByPlaceholder(L(lang, "content.titlePlaceholder")).fill("X");
    await page.getByRole("button", { name: L(lang, "common.create"), exact: true }).click();
    await expect(page.locator(".toast.error")).toHaveText(new RegExp(L(lang, "error.noPlatform").slice(0, 10)));
    texts.push(await visibleText(page));
    await page.keyboard.press("Escape");
    for (const [route, button] of [["/shoots", `+ ${L(lang, "shoots.plan")}`], ["/clients", `+ ${L(lang, "clients.add")}`], ["/team", `+ ${L(lang, "team.person")}`]] as const) {
      await page.goto(route);
      await page.getByRole("button", { name: button }).click();
      texts.push(await visibleText(page));
      await page.keyboard.press("Escape");
    }
    await page.goto("/media/m_kb_cut_v2");
    await page.getByRole("button", { name: L(lang, "review.requestChanges") }).click();
    texts.push(await visibleText(page));
    await page.keyboard.press("Escape");
    // client view
    await page.getByLabel(L(lang, "nav.switchUser")).selectOption("u_paul_puls");
    for (const r of ["/", "/pipeline", "/content/ct_kniebeuge?tab=script", "/media", "/approvals", "/calendar", "/shoots"]) {
      await page.goto(r);
      texts.push(await visibleText(page));
    }

    const all = texts.join("\n");
    const own = fragments(lang).filter((f) => all.includes(f));
    expect(own.length, "sanity: detector recognises this language").toBeGreaterThan(150);
    for (const other of LANGS.filter((o) => o !== lang)) {
      expect(fragments(other).filter((f) => all.includes(f)), `${other} text in ${lang} UI`).toEqual([]);
    }
    expect([...new Set(all.match(/\b[a-z]+\.[a-zA-Z_:0-9]+\b/g) ?? [])].filter((k) => allKeys.has(k)), "raw i18n keys").toEqual([]);
    expect(all.match(/\{\w+\}/g) ?? [], "unfilled placeholders").toEqual([]);
  });
}

test("language switch is live, persisted and sets <html lang>", async ({ page }) => {
  await useLang(page, "de");
  await page.goto("/approvals");
  await expect(page.locator("h1")).toHaveText(L("de", "nav.approvals"));
  await page.getByLabel(L("de", "nav.language")).first().selectOption("ru");
  await expect(page.locator("h1")).toHaveText(L("ru", "nav.approvals"));
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.reload();
  await expect(page.locator("h1")).toHaveText(L("ru", "nav.approvals"));
});

for (const [locale, expected] of [["ru-RU", "ru"], ["de-AT", "de"], ["en-US", "en"], ["fr-FR", "en"]] as const) {
  test.describe(`browser locale ${locale}`, () => {
    test.use({ locale });
    test(`defaults to ${expected}`, async ({ page }) => {
      await page.goto("/approvals");
      await expect(page.locator("h1")).toHaveText(L(expected, "nav.approvals"));
    });
  });
}
