import { spawnSync } from "node:child_process";

const inherited = {
  ...process.env,
  E2E_LOCAL: "true",
  E2E_TEST_MODE: "true",
  NEXT_PUBLIC_E2E_LOCAL: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "catalyst-e2e",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":").at(-1) ?? "8080",
};

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: inherited });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["--import", "tsx", "scripts/seedLocalE2E.ts"]);

// npm scripts cannot reliably forward Playwright options through
// `firebase emulators:exec` on every shell.  This deliberately small parser
// preserves quoted values such as `--grep "renders /classes"`.
const testArgs = process.env.E2E_TEST_ARGS?.match(/(?:[^\s"]+|"[^"]*")+/g)
  ?.map((argument) => argument.replace(/^"|"$/g, "")) ?? [];
run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...testArgs]);
