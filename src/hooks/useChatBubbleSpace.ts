"use client";

import { useEffect } from "react";

/** Marks the page while a floating chat button is shown, so phones leave room under it (global.css). */
export function useChatBubbleSpace(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    document.documentElement.dataset.chatBubble = "1";
    return () => {
      delete document.documentElement.dataset.chatBubble;
    };
  }, [shown]);
}
