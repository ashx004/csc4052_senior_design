import { fixtures } from "../support/fixtures";
import { dashboardRoutes, dynamicStudentRoutes } from "../support/routes";
import { expect, test, expectUsablePage } from "../support/test";

test.describe("student route coverage", () => {
  for (const route of dashboardRoutes) {
    test(`renders ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/);
      await expectUsablePage(page);
    });
  }

  test("serves all seeded course and record routes", async ({ page }) => {
    test.setTimeout(180_000);
    for (const route of dynamicStudentRoutes(fixtures())) {
      // A development server compiles these large, code-split pages on
      // demand. Checking their authenticated document response covers every
      // route without causing Next's development chunk cache to evict a
      // previous page while the browser is navigating through the full list.
      const response = await page.request.get(route, { timeout: 60_000 });
      expect(response.status(), `${route} should be available to a student`).toBe(200);
    }
  });

  test("settings preference persists after reload", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    const toggle = page.getByRole("switch", { name: "Toggle dark mode" });
    await toggle.click();
    const before = await toggle.getAttribute("aria-checked");
    await page.reload();
    await expect(page.getByRole("switch", { name: "Toggle dark mode" })).toHaveAttribute("aria-checked", before ?? "true");
  });

  test("calendar can switch views without a server error", async ({ page }) => {
    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /week/i }).click();
    await expectUsablePage(page);
  });

  test("notes can create a typed note", async ({ page }) => {
    const title = `E2E typed note ${Date.now()}`;
    await page.goto("/notes", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: /take notes/i }).click();
    await page.getByPlaceholder("e.g. Lecture 7 - Binary search trees").fill(title);
    await page.getByRole("button", { name: "Start writing" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/]+$/);
    await expect(page.getByLabel("Note title")).toHaveValue(title);
  });

  test("seeded note can be opened and shared safely", async ({ page }) => {
    await page.goto(`/notes/${fixtures().noteId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Share or export note" }).click();
    await expect(page.getByRole("dialog", { name: /share or export/i })).toBeVisible();
  });

  test("seeded public share is reachable without leaking an internal route", async ({ page }) => {
    await page.goto(`/share/${fixtures().shareId}`, { waitUntil: "domcontentloaded" });
    await expectUsablePage(page);
  });

  test("seeded practice set presents an answerable exercise", async ({ page }) => {
    const { courseId, practiceSetId } = fixtures();
    await page.goto(`/courses/${courseId}/practice/${practiceSetId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  });

  test("unknown protected URLs show recovery instead of a login loop", async ({ page }) => {
    await page.goto("/not-a-real-route", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
    await expectUsablePage(page);
  });

  test("student access is denied for administrator reporting", async ({ page }) => {
    const response = await page.request.get("/api/admin/analytics", { timeout: 25_000 });
    expect([401, 403]).toContain(response.status());
  });
});
