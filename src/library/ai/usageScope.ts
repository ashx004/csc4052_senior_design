import { AsyncLocalStorage } from "node:async_hooks";

// Which student an AI call is for. A route calls enterAiUser(uid) right after
// it verifies the student (or, for a background job, after it reads the job's
// owner), and every AI call it awaits from then on is metered to that uid.
// Same pattern as chatRuns.ts's stop scope; kept on globalThis because
// Next.js can load this module more than once.
//
// The uid must come from a verified token or a server-written job record,
// never from anything the browser sent unchecked.

function storage(): AsyncLocalStorage<string | undefined> {
  const g = globalThis as typeof globalThis & { __catalystAiUserScope?: AsyncLocalStorage<string | undefined> };
  return (g.__catalystAiUserScope ??= new AsyncLocalStorage());
}

/** Bills every AI call the current async flow makes from here on to `uid`. */
export function enterAiUser(uid: string): void {
  storage().enterWith(uid);
}

/** Runs `work` with its AI calls billed to `uid`, without touching the caller's scope. */
export function runAsAiUser<T>(uid: string, work: () => T): T {
  return storage().run(uid, work);
}

/** The student the current AI call is for, or undefined when no route set one. */
export function currentAiUser(): string | undefined {
  return storage().getStore();
}
