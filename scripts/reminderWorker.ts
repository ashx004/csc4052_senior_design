import { loadEnvConfig } from "@next/env";

// Standalone tsx scripts do not load Next's .env files by themselves.
loadEnvConfig(process.cwd());

const workerUrl = process.env.REMINDER_WORKER_URL ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const pollMs = Number(process.env.REMINDER_WORKER_POLL_MS ?? 60_000);
const WORK_BATCH_SIZE = 50;

if (!workerUrl || !internalSecret) {
  throw new Error("REMINDER_WORKER_URL and INTERNAL_API_SECRET are required to run the reminder worker.");
}

let draining = false;

async function drainDueReminders() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      try {
        const response = await fetch(workerUrl, {
          method: "POST",
          headers: { "x-internal-secret": internalSecret },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error("Reminder worker request failed:", result.error ?? response.statusText);
          return;
        }

        const inspected = typeof result.inspected === "number" ? result.inspected : 0;
        const reclaimed = typeof result.reclaimed === "number" ? result.reclaimed : 0;
        if (inspected === 0 && reclaimed === 0) return;

        console.log(
          `Reminder worker: inspected ${inspected}, sent ${result.sent ?? 0}, skipped ${result.skipped ?? 0}, failed ${result.failed ?? 0}.`,
        );
        // The route is intentionally bounded. Keep draining only when it
        // returned a full page; this catches up safely after downtime.
        if (inspected < WORK_BATCH_SIZE) return;
      } catch (error) {
        console.error("Reminder worker request failed:", error);
        return;
      }
    }
  } finally {
    draining = false;
  }
}

void drainDueReminders();
setInterval(() => void drainDueReminders(), Math.max(pollMs, 1_000));
