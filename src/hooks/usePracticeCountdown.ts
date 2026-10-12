"use client";

import { useEffect, useRef, useState } from "react";
import { secondsRemaining } from "@/src/library/practice/dragDrop";

/**
 * A countdown for one drag-and-drop round. It starts when `running` becomes
 * true and stops (keeping the time left, which feeds the speed bonus) when it
 * turns false. Key the component by round so each round gets a fresh clock.
 */
export function usePracticeCountdown(limitSeconds: number, running: boolean, onExpire: () => void) {
  const [remaining, setRemaining] = useState(limitSeconds);
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const left = secondsRemaining(startedAt, limitSeconds, Date.now());
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        expire.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [running, limitSeconds]);

  return remaining;
}
