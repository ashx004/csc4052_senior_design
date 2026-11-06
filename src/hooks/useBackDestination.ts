"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveBackDestination } from "@/src/library/learning/backDestination";

/**
 * Tier-2 detection: has this document client-navigated since it loaded?
 *
 * Next's `history.state.__NA` is NOT usable: the app router stamps it on the
 * entry page too (replaceState on first render), so a cold deep link has it.
 * Instead we compare the current pathname with the URL the browser originally
 * loaded this document with (Navigation Timing entry `name`, which never
 * changes on client-side navigation or pushState). A cold entry (deep link,
 * refresh, new tab) is still on its entry pathname, so the answer is false and
 * we use the fallback. A <Link>/router.push move to another route leaves the
 * document unchanged but changes the pathname, so a previous in-app entry
 * exists and router.back() is safe. Query-only changes on the entry page are
 * ignored by comparing pathnames. If the entry is unavailable we answer false,
 * which is the safe (fallback) side.
 */
function detectInAppHistory(): boolean {
  try {
    const [entry] = performance.getEntriesByType("navigation");
    if (!entry) return false;
    return new URL(entry.name).pathname !== window.location.pathname;
  } catch {
    return false;
  }
}

export function useBackDestination(fallbackHref: string): { goBack: () => void; href: string } {
  const router = useRouter();
  const from = useSearchParams()?.get("from") ?? null;
  const [hasInAppHistory, setHasInAppHistory] = useState(false);

  useEffect(() => {
    setHasInAppHistory(detectInAppHistory());
  }, []);

  const destination = resolveBackDestination({ from, hasInAppHistory });
  const href = destination.kind === "path" ? destination.path : fallbackHref;

  const goBack = useCallback(() => {
    if (destination.kind === "history") router.back();
    else router.push(href);
  }, [destination.kind, href, router]);

  return { goBack, href };
}
