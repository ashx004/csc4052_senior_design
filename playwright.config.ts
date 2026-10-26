import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const isLocalE2e = process.env.E2E_LOCAL === "true";

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.ts",
  // Next development mode compiles each route the first time it is visited.
  // Keep local emulator runs reliable on Windows without masking assertion
  // failures (expectations still time out quickly below).
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "anonymous",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(public|anonymous).*\.spec\.ts/,
    },
    {
      name: "student",
      use: {
        ...devices["Desktop Chrome"],
        ...(isLocalE2e ? {} : { storageState: process.env.E2E_STUDENT_STORAGE_STATE }),
      },
      testMatch: /student\..*\.spec\.ts/,
    },
    {
      name: "administrator",
      use: {
        ...devices["Desktop Chrome"],
        ...(isLocalE2e ? {} : { storageState: process.env.E2E_ADMIN_STORAGE_STATE }),
      },
      testMatch: /admin\..*\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Route coverage touches every code-split page.  A production build
        // prevents Next dev's on-demand chunk eviction from turning those
        // navigations into missing-chunk failures on Windows.
        command: isLocalE2e
          ? "npm run build && npm run start -- --port 3100"
          : "npm run dev -- --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
