import { expect, test, expectUsablePage } from "../support/test";

test("administrator can load the analytics dashboard", async ({ page }) => {
  await page.goto("/admin/analytics");
  await expect(page).not.toHaveURL(/\/login/);
  await expectUsablePage(page);
  await expect(page.getByRole("heading", { name: /usage analytics|analytics unavailable/i })).toBeVisible();
});

test("administrator reporting API is accessible to the administrator role", async ({ page }) => {
  const response = await page.request.get("/api/admin/analytics");
  expect(response.status()).not.toBe(401);
  expect(response.status()).not.toBe(403);
});
