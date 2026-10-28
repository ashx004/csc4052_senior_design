import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

type Diagnostics = {
  allowServerFailure: (path: RegExp) => void;
};

type WorkerFixtures = {
  localAuthenticatedContext: BrowserContext | undefined;
};

async function signInLocally(page: Page, role: "student" | "administrator") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof (window as Window & { __catalystE2eSignIn?: unknown }).__catalystE2eSignIn === "function",
    undefined,
    { timeout: 30_000 },
  );
  const customToken = await page.evaluate(async (e2eRole) => {
    const response = await fetch("/api/e2e/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: e2eRole }),
    });
    const { customToken } = await response.json() as { customToken?: string };
    if (!response.ok || !customToken) throw new Error("Could not get a local E2E session.");
    document.cookie = "fb_remember=1; path=/; max-age=2592000; SameSite=Lax";
    const signIn = (window as Window & { __catalystE2eSignIn?: (token: string) => Promise<void> }).__catalystE2eSignIn;
    if (!signIn) throw new Error("Local E2E Firebase client is unavailable.");
    await signIn(customToken);
    return customToken;
  }, role);
  // The local middleware deliberately accepts emulator tokens, while the
  // Firebase listener completes the normal ID-token cookie refresh.
  await page.context().addCookies([
    { name: "fb_token", value: customToken, url: page.url() },
    { name: "fb_remember", value: "1", url: page.url() },
  ]);
}

const allowedFailures = new WeakMap<Page, RegExp[]>();

export const test = base.extend<Diagnostics, WorkerFixtures>({
  localAuthenticatedContext: [async ({ browser }, use, workerInfo) => {
    const role = workerInfo.project.name === "student" || workerInfo.project.name === "administrator"
      ? workerInfo.project.name
      : undefined;
    if (process.env.E2E_LOCAL !== "true" || !role) {
      await use(undefined);
      return;
    }
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100" });
    const page = await context.newPage();
    await signInLocally(page, role);
    await page.close();
    await use(context);
    await context.close();
  }, { scope: "worker" }],
  allowServerFailure: async ({ page }, use) => {
    await use((path) => allowedFailures.get(page)?.push(path));
  },
  page: async ({ browser, localAuthenticatedContext }, use, testInfo) => {
    const ownsContext = !localAuthenticatedContext;
    const context = localAuthenticatedContext ?? await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100" });
    const page = await context.newPage();
    const problems: string[] = [];
    const allowed: RegExp[] = [];
    allowedFailures.set(page, allowed);
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      // Browsers log an error for an expected non-2xx fetch (for example the
      // deliberately rejected login and the recovery-page 404). Response
      // monitoring below still catches unexpected server failures.
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        problems.push(`console error: ${message.text()}`);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 500 && !allowed.some((path) => path.test(response.url()))) {
        problems.push(`server ${response.status()}: ${response.url()}`);
      }
    });
    await use(page);
    if (problems.length) await testInfo.attach("browser-diagnostics", { body: problems.join("\n"), contentType: "text/plain" });
    allowedFailures.delete(page);
    await page.close();
    if (ownsContext) await context.close();
    expect(problems, "unexpected browser errors or server failures").toEqual([]);
  },
});

export { expect };

export async function expectUsablePage(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
}
