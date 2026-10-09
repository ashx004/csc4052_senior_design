// Lets the Stop button cancel a reply that is still being written.
//
// Each chat request may carry a client-made run ID. The server keeps an
// AbortController per run; POST /api/chat/stop aborts it, which cancels the
// request to the model. Disconnecting alone does NOT stop a reply - the chat
// deliberately keeps generating so a student who closes the tab still finds the
// finished answer in their history - so stopping has to be an explicit signal.
//
// Kept on globalThis because Next.js can load this module separately for the
// chat route and the stop route.

export class ChatStoppedError extends Error {
  constructor() {
    super("Stopped by the student");
    this.name = "ChatStoppedError";
  }
}

interface Run {
  controller: AbortController;
  startedAt: number;
}

const MAX_RUN_AGE_MS = 20 * 60_000;

function registry(): Map<string, Run> {
  const g = globalThis as typeof globalThis & { __catalystChatRuns?: Map<string, Run> };
  return (g.__catalystChatRuns ??= new Map());
}

const keyFor = (uid: string, runId: string) => `${uid}:${runId}`;

/** Starts tracking a run. Runs from different students can never collide or stop each other. */
export function registerChatRun(uid: string, runId: string): AbortController {
  const runs = registry();
  const now = Date.now();
  for (const [key, run] of runs) if (now - run.startedAt > MAX_RUN_AGE_MS) runs.delete(key);
  const controller = new AbortController();
  runs.set(keyFor(uid, runId), { controller, startedAt: now });
  return controller;
}

export function releaseChatRun(uid: string, runId: string): void {
  registry().delete(keyFor(uid, runId));
}

/** Aborts a run if it is still going. Returns whether there was one to stop. */
export function stopChatRun(uid: string, runId: string): boolean {
  const run = registry().get(keyFor(uid, runId));
  if (!run || run.controller.signal.aborted) return false;
  run.controller.abort();
  return true;
}
