"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Caches only the Advising page's *default* view (page 1, no search, no
// department filter) — that covers the overwhelming majority of "navigated
// away and came back" cases without needing to cache an unbounded matrix of
// filter/page combinations. Filtered/paginated views always fetch fresh.
//
// In-memory only (no localStorage): the 24h server-side courseOfferingCache
// (src/library/courseOfferings/cache.ts) already handles real staleness —
// this only exists to avoid an empty loading flash when the student
// navigates away from Advising and back within the same session. Lives here
// (a sibling to AIPageContextProvider in (dashboard)/layout.tsx) so it
// survives in-group navigation the same way — the layout persists, only
// `children` swaps.
type AdvisingCacheEntry<TData = unknown, TCourse = unknown> = {
  data: TData;
  otherLikely: TCourse[];
  fetchedAt: number;
};

type ContextValue = {
  entry: AdvisingCacheEntry | null;
  setEntry: (entry: AdvisingCacheEntry) => void;
  clear: () => void;
};

const Ctx = createContext<ContextValue | null>(null);

export function AdvisingCacheProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntryState] = useState<AdvisingCacheEntry | null>(null);
  const value = useMemo<ContextValue>(
    () => ({
      entry,
      setEntry: setEntryState,
      clear: () => setEntryState(null),
    }),
    [entry]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdvisingCache<TData = unknown, TCourse = unknown>() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdvisingCache must be used within AdvisingCacheProvider");
  return ctx as {
    entry: AdvisingCacheEntry<TData, TCourse> | null;
    setEntry: (entry: AdvisingCacheEntry<TData, TCourse>) => void;
    clear: () => void;
  };
}
