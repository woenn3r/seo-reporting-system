import { fileURLToPath } from "node:url";
import { LANGS, L, expect, test, useLang } from "./helpers";

const VIDEO = fileURLToPath(new URL("./fixtures/sample.mp4", import.meta.url));

for (const lang of LANGS) {
  test(`full production workflow (${lang})`, async ({ page }) => {
    const t = (k: string, p?: Record<string, string | number>) => L(lang, k, p);
    const stageBadge = page.locator(".page-header .badge").first();
    await useLang(page, lang);

    // content
    await page.goto("/pipeline");
    await page.getByRole("button", { name: `+ ${t("content.new")}` }).click();
    await page.getByPlaceholder(t("content.titlePlaceholder")).fill(`E2E ${lang}`);
    await page.getByRole("button", { name: t("common.create"), exact: true }).click();
    await expect(page).toHaveURL(/\/content\/ct_/);
    await expect(stageBadge).toHaveText(t("stage.idea"));

    // script: create → submit → changes requested → submit → approve
    await page.getByRole("tab", { name: new RegExp(t("content.tabScript")) }).click();
    await page.getByRole("button", { name: t("script.create") }).click();
    await page.getByPlaceholder(t("script.hookPlaceholder")).fill("Hook!");
    await page.getByPlaceholder(t("script.hashtagsPlaceholder")).fill("#e2e test");
    await page.getByRole("button", { name: t("script.addScene") }).click();
    await page.getByRole("button", { name: t("script.submit") }).click();
    await expect(page.locator(".badge", { hasText: t("scriptStatus.in_review") }).first()).toBeVisible();
    await expect(stageBadge).toHaveText(t("stage.script_review"));
    await page.getByRole("button", { name: t("review.requestChanges") }).click();
    await page.locator("dialog textarea").fill("Hook kürzer");
    await page.locator("dialog").getByRole("button", { name: t("common.send") }).click();
    await expect(page.getByText(t("script.feedback"))).toBeVisible();
    await expect(stageBadge).toHaveText(t("stage.script"));
    await page.getByRole("button", { name: t("script.submit") }).click();
    await page.getByRole("button", { name: t("review.approve") }).click();
    await expect(stageBadge).toHaveText(t("stage.shoot"));

    // shot list
    await page.getByRole("tab", { name: new RegExp(t("content.tabShots")) }).click();
    await page.locator(".card-head").getByRole("button", { name: t("shots.shot") }).click();
    await page.getByPlaceholder(t("shots.whatPlaceholder")).fill("POV");
    await page.locator("dialog").getByRole("button", { name: t("common.save") }).click();
    await page.getByLabel(t("shots.doneLabel", { n: 1 })).check();
    await expect(page.getByText("1/1").first()).toBeVisible();

    // raw footage → release for editing
    await page.getByRole("tab", { name: new RegExp(t("content.tabMedia")) }).click();
    await page.locator("input[type=file]").setInputFiles(VIDEO);
    await page.getByRole("button", { name: t("media.releaseForEdit"), exact: true }).click();
    await expect(stageBadge).toHaveText(t("stage.edit"));

    // cut → review with timestamped comment → approve
    await page.getByRole("button", { name: t("mediaKind.cut"), exact: true }).click();
    await page.locator("input[type=file]").setInputFiles(VIDEO);
    await expect(stageBadge).toHaveText(t("stage.cut_review"));
    await page.locator("tr", { hasText: t("mediaKind.cut") }).getByRole("link", { name: "sample.mp4" }).click();
    const video = page.locator("video");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(3);
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 2; });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(2);
    await page.getByPlaceholder(t("review.commentPlaceholder")).fill("Logo");
    await page.locator(".card-body").getByRole("button", { name: t("common.send") }).click();
    await expect(page.locator(".ts")).toHaveText("0:02");
    await expect(page.locator(".timeline .marker")).toHaveCount(1);
    await page.getByRole("button", { name: t("review.approve") }).click();
    await expect(stageBadge).toHaveText(t("mediaStatus.approved"));

    // persisted (metadata in localStorage, video in IndexedDB)
    await page.reload();
    await expect(stageBadge).toHaveText(t("mediaStatus.approved"));
    await expect(page.locator("video")).toHaveCount(1);
  });
}

test("drag & drop moves a card between pipeline stages", async ({ page }) => {
  await useLang(page, "de");
  await page.goto("/pipeline");
  const target = page.locator(`section.kanban-col[aria-label="${L("de", "stage.script")}"]`);
  await page.locator(".kanban-card", { hasText: "Ein Tag mit Anna" }).dragTo(target);
  await expect(target.locator(".kanban-card", { hasText: "Ein Tag mit Anna" })).toBeVisible();
});
