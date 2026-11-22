import { LANGS, ROUTES, expect, test, useLang } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

for (const lang of LANGS) {
  test(`no horizontal overflow on phones (${lang})`, async ({ page }) => {
    await useLang(page, lang);
    const overflow: string[] = [];
    for (const r of ROUTES) {
      await page.goto(r);
      await expect(page.locator("h1").first()).toBeVisible();
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 390) overflow.push(`${r}: ${w}px`);
    }
    expect(overflow).toEqual([]);
  });

  test(`mobile menu opens (${lang})`, async ({ page }) => {
    await useLang(page, lang);
    await page.goto("/");
    await page.locator(".topbar button").click();
    await expect(page.locator(".sidebar.open")).toBeVisible();
  });
}
