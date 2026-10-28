import { existsSync, readFileSync } from "node:fs";

const PRODUCTION_PROJECT_ID = "studora-933f8";

type FixtureManifest = {
  schemaVersion: number;
  projectId: string;
  student: Record<string, string>;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`E2E startup requires ${name}. See e2e/README.md.`);
  return value;
}

export default async function globalSetup() {
  if (process.env.E2E_LOCAL === "true") {
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error("Local E2E requires Firebase Emulator Suite. Run npm run e2e:local.");
    }
    return;
  }

  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error("Refusing to run E2E tests: set E2E_TEST_MODE=true in the dedicated E2E environment.");
  }

  const manifestPath = required("E2E_FIXTURE_MANIFEST");
  const studentState = required("E2E_STUDENT_STORAGE_STATE");
  const adminState = required("E2E_ADMIN_STORAGE_STATE");
  for (const path of [manifestPath, studentState, adminState]) {
    if (!existsSync(path)) throw new Error(`E2E runtime file is missing: ${path}`);
  }

  let manifest: FixtureManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FixtureManifest;
  } catch {
    throw new Error(`E2E fixture manifest is not valid JSON: ${manifestPath}`);
  }
  if (manifest.schemaVersion !== 1 || !manifest.projectId || !manifest.student) {
    throw new Error("E2E fixture manifest has an unsupported shape.");
  }
  if (manifest.projectId === PRODUCTION_PROJECT_ID) {
    throw new Error("Refusing to run E2E tests against the production Firebase project.");
  }
  if (process.env.E2E_PROJECT_ID && process.env.E2E_PROJECT_ID !== manifest.projectId) {
    throw new Error("E2E_PROJECT_ID does not match the fixture manifest project.");
  }
}

