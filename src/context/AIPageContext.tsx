"use client";

import { createContext, useContext, useEffect, useMemo, useState, DependencyList } from "react";
import { PageAIContext } from "@/src/library/chatContext";

type ContextValue = {
  pageContext: PageAIContext | null;
  setPageContext: (context: PageAIContext | null) => void;
};

const Ctx = createContext<ContextValue>({
  pageContext: null,
  setPageContext: () => {},
});

// Wraps the (dashboard) layout so the AI side panel — a sibling of whatever
// page is currently rendered, not a parent/child of it — can read what the
// active page wants to tell it, without every page needing to reach into
// the panel directly.
export function AIPageContextProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContext] = useState<PageAIContext | null>(null);
  const value = useMemo(() => ({ pageContext, setPageContext }), [pageContext]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAIPageContext(): PageAIContext | null {
  return useContext(Ctx).pageContext;
}

// Call from a page to describe what it's currently showing, so the AI panel
// can ground answers ("what am I looking at") in the real on-screen data.
// Clears itself on unmount so a stale page's context never leaks into the
// next page the student navigates to.
export function useSetPageContext(context: PageAIContext | null, deps: DependencyList) {
  const { setPageContext } = useContext(Ctx);

  useEffect(() => {
    setPageContext(context);
    return () => setPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
