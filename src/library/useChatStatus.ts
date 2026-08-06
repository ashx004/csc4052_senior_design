"use client";

import { useRef, useState } from "react";

// Shared status-label state machine for both AI chat surfaces
// (ai-assistant/page.tsx and aiPanel/useAIPanelChat.ts). Previously the UI
// showed nothing but silent bouncing dots between sending a message and the
// first token/tool event arriving — indistinguishable from "frozen," even
// though a cold model load can legitimately take 30-60s+ (see
// OLLAMA_TIMEOUT_MS in api/chat/route.ts). This surfaces what's actually
// happening at each stage, and upgrades the message if the wait runs long,
// instead of leaving a static "Thinking..." up indefinitely.
export const CONNECTING_STATUS = "Connecting to the assistant...";
export const THINKING_STATUS = "Thinking...";
export const SLOW_THINKING_STATUS =
  "Still working — first replies can take up to a minute if the model just woke up from idle.";
const SLOW_THINKING_DELAY_MS = 15000;

export function useChatStatus() {
  const [status, setStatus] = useState<string | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSlowTimer() {
    if (slowTimer.current) {
      clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  }

  return {
    status,
    // The request is about to be sent (fetch not yet resolved).
    connecting() {
      clearSlowTimer();
      setStatus(CONNECTING_STATUS);
    },
    // Response headers arrived; waiting on the first stream event. Starts a
    // timer that upgrades the message if nothing shows up for a while.
    streaming() {
      clearSlowTimer();
      setStatus(THINKING_STATUS);
      slowTimer.current = setTimeout(() => setStatus(SLOW_THINKING_STATUS), SLOW_THINKING_DELAY_MS);
    },
    tool(label: string) {
      clearSlowTimer();
      setStatus(label);
    },
    // A server-emitted pipeline-stage update (the {type: "status"} stream
    // event from api/chat/route.ts) — describes what the backend is doing
    // right now (loading context, calling the model, etc.), replacing the
    // long silent gap between "Connecting" and the first token/tool event.
    progress(label: string) {
      clearSlowTimer();
      setStatus(label);
    },
    // A real content token (or the stream ending) arrived — nothing left to
    // announce.
    clear() {
      clearSlowTimer();
      setStatus(null);
    },
  };
}
