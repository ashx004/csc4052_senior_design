import { expect } from "@playwright/test";
import { test } from "../support/test";

// The settings page shows the app version, so a deploy can be confirmed in the browser.
test("settings page shows the app version", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("app-version")).toContainText(/Catalyst v\d+\.\d+\.\d+/, { timeout: 60_000 });
  await expect(page.getByTestId("app-version")).toContainText("Catalyst v0.2.0");
});
