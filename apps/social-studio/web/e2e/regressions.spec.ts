// Regression tests for defects found in the system review (each one was a real bug).
import { L, expect, test, useLang } from "./helpers";

test("client users are redirected away from admin pages opened by URL", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/");
  await page.getByLabel(L("en", "nav.switchUser")).selectOption("u_paul_puls");
  for (const url of ["/clients", "/team", "/settings", "/shotlists"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Café Morgenrot")).toHaveCount(0);
    await expect(page.getByText(L("en", "settings.export"))).toHaveCount(0);
  }
});

test("switching to a client user while on an admin page leaves that page", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/clients");
  await expect(page.locator(".card strong", { hasText: "Café Morgenrot" })).toBeVisible();
  await page.getByLabel(L("en", "nav.switchUser")).selectOption("u_paul_puls");
  await expect(page).toHaveURL(/\/$/);
});

test("a script can be saved with an empty hook", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/content/ct_mythos_eiweiss?tab=script");
  await page.getByPlaceholder(L("en", "script.hookPlaceholder")).fill("");
  await page.locator(".form-grid textarea").first().fill("Caption only");
  await page.getByRole("button", { name: L("en", "common.save"), exact: true }).click();
  await expect(page.locator(".toast.success")).toBeVisible();
  await expect(page.locator(".toast.error")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".form-grid textarea").first()).toHaveValue("Caption only");
});

test("dialogs focus their first field; clicking a group label does not toggle a chip", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/pipeline");
  await page.getByRole("button", { name: `+ ${L("en", "content.new")}` }).click();
  await expect(page.getByPlaceholder(L("en", "content.titlePlaceholder"))).toBeFocused();
  const instagram = page.locator("dialog .chip", { hasText: "Instagram" });
  await expect(instagram).toHaveAttribute("aria-pressed", "true");
  await page.locator("dialog").getByText(L("en", "content.platforms"), { exact: true }).click();
  await expect(instagram).toHaveAttribute("aria-pressed", "true");
});

test("unsaved overview edits survive a stage change", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/content/ct_team_anna");
  const title = page.locator("form input.input").first();
  await title.fill("Edited but not saved");
  await page.getByLabel(L("en", "content.changeStage")).selectOption("script");
  await expect(title).toHaveValue("Edited but not saved");
});

test("creating content for another client than the filter stays visible", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/pipeline");
  await page.getByLabel(L("en", "nav.filterClient")).selectOption("c_berger");
  await page.getByRole("button", { name: `+ ${L("en", "content.new")}` }).click();
  await page.locator("dialog select").first().selectOption("c_puls");
  await page.getByPlaceholder(L("en", "content.titlePlaceholder")).fill("Cross-client");
  await page.getByRole("button", { name: L("en", "common.create"), exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Cross-client");
});

test("script and media tables are keyboard reachable (real links)", async ({ page }) => {
  await useLang(page, "en");
  await page.goto("/scripts");
  await page.getByRole("link", { name: "Die neue Winterkarte" }).first().press("Enter");
  await expect(page).toHaveURL(/content\/ct_winterkarte\?tab=script/);
  await page.goto("/media");
  await page.getByRole("link", { name: "kniebeuge_cut_v2.mp4" }).press("Enter");
  await expect(page).toHaveURL(/media\/m_kb_cut_v2/);
});

for (const [name, stored] of [
  ["broken references", (ws: any) => { ws.workspace.currentUserId = "u_nobody"; return JSON.stringify(ws); }],
  ["contract violation", (ws: any) => { ws.team = []; return JSON.stringify(ws); }],
  ["unreadable JSON", () => "{not json"],
] as const) {
  test(`stored data with ${name} never bricks the app`, async ({ page }) => {
    await useLang(page, "en");
    await page.goto("/");
    const seed = JSON.parse((await import("node:fs")).readFileSync(new URL("../../../../examples/social_studio/workspace.json", import.meta.url), "utf8"));
    await page.evaluate((v) => localStorage.setItem("social-studio:v1:workspace", v), stored(seed));
    await page.reload();
    await expect(page.locator(".banner")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
    await page.goto("/pipeline");
    await expect(page.locator(".kanban-card").first()).toBeVisible();
  });
}
