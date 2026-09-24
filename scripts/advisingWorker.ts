import { loadEnvConfig } from "@next/env";

// Unlike `next dev`, a standalone tsx script does not load .env files on its
// own. Reuse Next's loader so local worker runs see the same configuration as
// the web application (including .env.local).
loadEnvConfig(process.cwd());

const workerUrl = process.env.ADVISING_WORKER_URL ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const pollMs = Number(process.env.ADVISING_WORKER_POLL_MS ?? 10_000);

if (!workerUrl || !internalSecret) {
  throw new Error("ADVISING_WORKER_URL and INTERNAL_API_SECRET are required to run the advising worker.");
}

let draining = false;
async function drainQueue() {
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
          console.error("Advising worker request failed:", result.error ?? response.statusText);
          return;
        }
        if (!result.processed) return;
        console.log(`Processed advising job ${result.jobId}`);
      } catch (error) {
        console.error("Advising worker request failed:", error);
        return;
      }
    }
  } finally {
    draining = false;
  }
}

void drainQueue();
setInterval(() => void drainQueue(), Math.max(pollMs, 1_000));
