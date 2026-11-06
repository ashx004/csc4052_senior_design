"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveBackDestination, resolveHistoryDepth } from "@/src/library/learning/backDestination";

const DEPTH_KEY = "backDepth";
const COUNTER_KEY = "backDepthCounter";

function asDepth(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * Tier-2 detection: is there an in-app history entry behind this one?
 *
 * Next's `history.state.__NA` is NOT usable: the app router stamps it on the
 * entry page too (replaceState on first render), so a cold deep link has it.
 * Instead each history entry is stamped with its depth in this tab: a
 * per-tab sessionStorage counter plus a key written into `history.state`
 * (existing keys are preserved, Next keeps its own there). A newly pushed
 * entry gets counter + 1; an entry that already carries the key (refresh,
 * back/forward) keeps its depth. A deep link in a new tab or a cold entry
 * starts at depth 1 (fallback); an in-app navigation creates depth 2+
 * (history); a refresh keeps its stamp, so it stays correct.
 *
 * Known residual: a router.replace from a cold entry is indistinguishable
 * from a push, so it reads as in-app. Any storage/history failure (e.g.
 * Safari private mode) resolves to false, the safe fallback direction.
 */
function detectInAppHistory(): boolean {
  try {
    const state = window.history.state;
    const recordedDepth = asDepth(state?.[DEPTH_KEY]);
    const stored = Number(window.sessionStorage.getItem(COUNTER_KEY));
    const result = resolveHistoryDepth({
      recordedDepth,
      storedCounter: asDepth(stored) ?? 0,
    });
    if (result.stamp) {
      window.history.replaceState({ ...state, [DEPTH_KEY]: result.depth }, "");
    }
    window.sessionStorage.setItem(COUNTER_KEY, String(result.depth));
    return result.hasInAppHistory;
  } catch {
    return false;
  }
}

export function useBackDestination(fallbackHref: string): { goBack: () => void; href: string } {
  const router = useRouter();
  const pathname = usePathname();
  const from = useSearchParams()?.get("from") ?? null;
  const [hasInAppHistory, setHasInAppHistory] = useState(false);

  useEffect(() => {
    setHasInAppHistory(detectInAppHistory());
  }, [pathname]);

  const destination = resolveBackDestination({ from, hasInAppHistory });
  const href = destination.kind === "path" ? destination.path : fallbackHref;

  const goBack = useCallback(() => {
    if (destination.kind === "history") router.back();
    else router.push(href);
  }, [destination.kind, href, router]);

  return { goBack, href };
}
