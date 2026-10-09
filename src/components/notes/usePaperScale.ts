"use client";

import { useEffect, useState, type RefObject } from "react";
import { PAGE_WIDTH } from "@/src/library/notes/types";

/** Scale that fits the fixed-width sheet into its container (never above
 *  1 at zoom 1). Pages keep their real layout and are shrunk visually, so text and
 *  ink stay aligned on every screen size. */
export function usePaperScale(containerRef: RefObject<HTMLElement | null>, gutter = 32, zoom = 1): number {
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setFit(Math.min(1, Math.max(0.3, (el.clientWidth - gutter) / PAGE_WIDTH)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, gutter]);
  return fit * zoom;
}
