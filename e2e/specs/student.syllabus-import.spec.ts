import { expect } from "@playwright/test";
import { test } from "../support/test";
import { fixtures } from "../support/fixtures";

// Syllabus import, end to end: pick the syllabus, review what was read, save,
// then check the saved details appear on the course page.
// Local emulator only: the course is the seeded e2e-course, and the file is the
// CSC 475 syllabus registered as resource r-syll.
const DESCRIPTION_PHRASE = "artificially intelligent programs";

test("imports a syllabus, saves the description, and shows it on the course page", async ({ page }) => {
  const { courseId } = fixtures();
  await page.goto(`/courses/${courseId}`);

  // The button appears once the course has loaded from the emulator; a cold
  // page can take longer than a normal click wait.
  const importButton = page.getByRole("button", { name: /course info from syllabus|update course info from syllabus/i });
  await importButton.waitFor({ state: "visible", timeout: 45_000 });
  await importButton.click();

  // The file list only appears when nothing is picked yet. Once a syllabus is
  // saved, the modal can open straight on its last review, so pick only if asked.
  const save = page.getByRole("button", { name: "Save to course" });
  const fileList = page.getByText("Pick the syllabus you've already added", { exact: false });
  if (await fileList.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await fileList.locator("xpath=..").getByRole("button", { name: /CSC 475 - Fall 2026 - Syllabus/i }).click();
  }

  // Reading takes a few seconds; the review step is the one with the save button.
  await expect(save).toBeVisible({ timeout: 90_000 });

  // The description the syllabus states must be in the review, ready to save.
  await expect(page.getByText(DESCRIPTION_PHRASE, { exact: false }).first()).toBeVisible();

  await save.click();
  await expect(save).toBeHidden({ timeout: 30_000 });

  // Saved details are on the course page.
  await page.reload();
  await expect(page.getByText(DESCRIPTION_PHRASE, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
});
