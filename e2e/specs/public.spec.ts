import { expect, test, expectUsablePage } from "../support/test";

test("landing page renders for a new visitor", async ({ page }) => {
  await page.goto("/");
  await expectUsablePage(page);
  await expect(page.getByRole("link", { name: /log in|sign up|get started/i }).first()).toBeVisible();
});

test("login shows an actionable rejected-credential response", async ({ page }) => {
  await page.route("**/api/auth/login-2fa/start", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Invalid credentials." }) }),
  );
  await page.goto("/login");
  await page.getByPlaceholder("email").fill("student@example.test");
  await page.getByPlaceholder("password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByText("Invalid credentials.", { exact: true })).toBeVisible();
});

test("signup requires terms acknowledgement before submission", async ({ page }) => {
  await page.goto("/signup");
  const submit = page.getByRole("button", { name: "Create account" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
});

for (const document of ["terms", "privacy", "credits"]) {
  test(`legal document ${document} is public`, async ({ page }) => {
    await page.goto(`/legal/${document}`);
    await expectUsablePage(page);
  });
}

test("unknown public share shows recovery instead of an uncaught error", async ({ page }) => {
  await page.goto("/share/not-a-real-share");
  await expectUsablePage(page);
  await expect(page.locator("body")).toBeVisible();
});
