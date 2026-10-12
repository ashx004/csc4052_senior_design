"use client";

import { useCallback, useState } from "react";
import type { ChatStreamEvent } from "@/src/library/chatStream";
import { EMPTY_ACTIVITY, reduceActivity, type LiveActivity } from "@/src/library/chatLive";

/**
 * Live view of what the assistant is doing while a reply is being written: its
 * reasoning (and a one-line summary of it) and the tools it has used. Feed it
 * every stream event; it only reacts to the ones it understands.
 */
export function useChatActivity() {
  const [activity, setActivity] = useState<LiveActivity>(EMPTY_ACTIVITY);

  const handle = useCallback((event: ChatStreamEvent) => {
    switch (event.type) {
      case "thinking":
      case "thought_summary":
      case "tool":
      case "tool_done":
        setActivity((current) => reduceActivity(current, event));
        break;
      case "delta":
      case "done":
      case "stopped":
      case "error":
        // Text arriving or the reply ending means no tool is still running.
        setActivity((current) => reduceActivity(current, { type: "settle" }));
        break;
    }
  }, []);

  const reset = useCallback(() => setActivity(EMPTY_ACTIVITY), []);

  return { activity, handle, reset };
}
