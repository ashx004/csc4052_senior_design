import { expect, test } from "../support/test";

for (const route of ["/dashboard", "/settings", "/courses/not-a-real-course/notes"]) {
  test(`redirects anonymous visitors from ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
}
