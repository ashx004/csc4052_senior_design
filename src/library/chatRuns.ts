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

import { AsyncLocalStorage } from "node:async_hooks";

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

// ── Reaching tools that are already running ──────────────────────────────
// A chat reply can be in the middle of a slow tool (writing a quiz, searching
// the web) when Stop is pressed. Passing the signal down through every tool
// would touch dozens of call sites, so the chat route puts it in an
// AsyncLocalStorage scope instead: anything awaited from that point on can ask
// for it (structuredGeneration does, so a half-written quiz stops being
// generated and is never saved).

function stopStorage(): AsyncLocalStorage<AbortSignal | undefined> {
  const g = globalThis as typeof globalThis & { __catalystChatStopScope?: AsyncLocalStorage<AbortSignal | undefined> };
  return (g.__catalystChatStopScope ??= new AsyncLocalStorage());
}

/** Makes `signal` the stop signal for everything the current async flow does from here on. */
export function enterChatStopScope(signal: AbortSignal | undefined): void {
  stopStorage().enterWith(signal);
}

/** The signal of the chat reply this code is running for, if any (undefined outside a chat reply). */
export function currentChatStopSignal(): AbortSignal | undefined {
  return stopStorage().getStore();
}

/**
 * Waits for `work`, but gives up with ChatStoppedError the moment Stop is
 * pressed. For read-only work that can't be cancelled itself (the work keeps
 * running unseen, which is harmless).
 */
export function untilStopped<T>(work: Promise<T>, signal: AbortSignal | undefined = currentChatStopSignal()): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) {
    work.catch(() => {});
    return Promise.reject(new ChatStoppedError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ChatStoppedError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
