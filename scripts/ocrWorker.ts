import { loadEnvConfig } from "@next/env";
import { Agent, fetch as undiciFetch } from "undici";

// Unlike `next dev`, a standalone tsx script does not load .env files on its
// own. Reuse Next's loader so local worker runs see the same configuration as
// the web application (including .env.local).
loadEnvConfig(process.cwd());

const workerUrl = process.env.OCR_WORKER_URL ?? "";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";
const pollMs = Number(process.env.OCR_WORKER_POLL_MS ?? 10_000);

if (!workerUrl || !internalSecret) {
  throw new Error("OCR_WORKER_URL and INTERNAL_API_SECRET are required to run the OCR worker.");
}

// A job can run for its whole 10-minute lease (a big textbook); Node's
// fetch would give up after 5 minutes and stop draining the queue.
const longAgent = new Agent({ headersTimeout: 11 * 60_000, bodyTimeout: 11 * 60_000 });

let draining = false;
async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      try {
        const response = await undiciFetch(workerUrl, {
          dispatcher: longAgent,
          method: "POST",
          headers: { "x-internal-secret": internalSecret },
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string; processed?: boolean; jobId?: string };
        if (!response.ok) {
          console.error("OCR worker request failed:", result.error ?? response.statusText);
          return;
        }
        if (!result.processed) return;
        console.log(`Processed document job ${result.jobId}`);
      } catch (error) {
        console.error("OCR worker request failed:", error);
        return;
      }
    }
  } finally {
    draining = false;
  }
}

void drainQueue();
setInterval(() => void drainQueue(), Math.max(pollMs, 1_000));
