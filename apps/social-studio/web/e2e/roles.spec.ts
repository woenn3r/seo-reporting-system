import { L, expect, test, useLang } from "./helpers";

test("client users only see their own client, no raw footage, no admin", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/");
  await page.getByLabel(L("en", "nav.switchUser")).selectOption("u_paul_puls");
  await expect(page.getByRole("link", { name: L("en", "nav.clients") })).toHaveCount(0);
  await expect(page.getByRole("link", { name: L("en", "nav.settings") })).toHaveCount(0);

  await page.goto("/pipeline?stage=edit");
  await page.getByRole("button", { name: L("en", "pipeline.list") }).click();
  await expect(page.getByText("Café Morgenrot")).toHaveCount(0);

  await page.goto("/media");
  await expect(page.locator("tbody tr")).toHaveCount(1); // only the cut, no raw footage
  await page.goto("/media/m_kb_raw");
  await expect(page.getByText(L("en", "review.notFound"))).toBeVisible();
  await page.goto("/content/ct_latte_art"); // other client's content
  await expect(page.getByText(L("en", "content.notFound"))).toBeVisible();
  await page.goto("/approvals");
  await expect(page.getByRole("link", { name: L("en", "approvals.watch") })).toBeVisible();
});
