import { AsyncLocalStorage } from "node:async_hooks";

// What an AI call is for, carried through everything a route awaits so the
// many call sites don't each need extra parameters:
//   uid    the student it's billed to. A route calls enterAiUser(uid) right
//          after verifying the student (or, for a background job, after
//          reading the job's owner). Must come from a verified token or a
//          server-written job record, never from unchecked browser input.
//   speed  the chat speed the student picked (setAiSpeed; chat route only).
//   spend  a running total of what this request's AI calls were charged
//          (trackAiSpend; the chat route reports it with each reply).
// Same pattern as chatRuns.ts's stop scope; kept on globalThis because
// Next.js can load this module more than once.

export type ChatSpeed = "fast" | "balanced" | "thorough";
export type SpendTracker = { micros: number; uid?: string };
export type AiScope = { uid?: string; speed?: ChatSpeed; spend?: SpendTracker };

function storage(): AsyncLocalStorage<AiScope | undefined> {
  const g = globalThis as typeof globalThis & { __catalystAiScope?: AsyncLocalStorage<AiScope | undefined> };
  return (g.__catalystAiScope ??= new AsyncLocalStorage());
}

// Each change makes a new scope object from the current one, so a flow
// started earlier keeps what it had. The spend counter object itself is
// shared on purpose: calls made deeper down add to the route's total.
function extend(patch: AiScope) {
  storage().enterWith({ ...storage().getStore(), ...patch });
}

/** Bills every AI call the current async flow makes from here on to `uid`. */
export function enterAiUser(uid: string): void {
  extend({ uid });
}

/** Applies the student's chat speed to the chat calls made from here on. */
export function setAiSpeed(speed: ChatSpeed | undefined): void {
  if (speed) extend({ speed });
}

/** Starts adding up what this request's AI calls are charged. Read `micros` when the work is done. */
export function trackAiSpend(): SpendTracker {
  const spend: SpendTracker = { micros: 0 };
  extend({ spend });
  return spend;
}

/** Runs `work` with a fresh spend counter the caller can read afterwards (see refundOnFailure). */
export function runWithSpend<T>(spend: SpendTracker, work: () => T): T {
  return storage().run({ ...storage().getStore(), spend }, work);
}

/** Runs `work` with its AI calls billed to `uid`, without touching the caller's scope. */
export function runAsAiUser<T>(uid: string, work: () => T): T {
  return storage().run({ ...storage().getStore(), uid }, work);
}

/** The whole scope of the current AI call (empty outside any route). */
export function currentAiScope(): AiScope {
  return storage().getStore() ?? {};
}

/** The student the current AI call is for, or undefined when no route set one. */
export function currentAiUser(): string | undefined {
  return storage().getStore()?.uid;
}
