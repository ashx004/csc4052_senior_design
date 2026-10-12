"use client";

import { useCallback, useRef } from "react";

// After pressing Stop the server ends the stream itself (sending the partial
// reply). If it somehow doesn't, cut the connection after this long.
const FORCE_CLOSE_MS = 4_000;

function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Gives each chat request an ID and a way to cancel it. Disconnecting does not
 * stop a reply on the server (it keeps going so the answer is still saved), so
 * Stop tells the server explicitly.
 */
export function useChatRun() {
  const current = useRef<{ runId: string; controller: AbortController; stopped: boolean } | null>(null);

  /** Call right before sending; pass `runId` in the request body and `signal` to fetch. */
  const begin = useCallback(() => {
    const controller = new AbortController();
    const run = { runId: newRunId(), controller, stopped: false };
    current.current = run;
    return { runId: run.runId, signal: controller.signal };
  }, []);

  const stop = useCallback(() => {
    const run = current.current;
    if (!run || run.stopped) return;
    run.stopped = true;
    void fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.runId }),
    }).catch(() => {});
    setTimeout(() => run.controller.abort(), FORCE_CLOSE_MS);
  }, []);

  /** Whether the student pressed Stop for the request most recently begun. */
  const wasStopped = useCallback(() => current.current?.stopped ?? false, []);

  const finish = useCallback(() => {
    current.current = null;
  }, []);

  return { begin, stop, wasStopped, finish };
}
