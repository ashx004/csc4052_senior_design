"use client";

import { createContext, useContext, useEffect, useMemo, useState, DependencyList } from "react";
import { PageAIContext } from "@/src/library/chatContext";

type ContextValue = {
  pageContext: PageAIContext | null;
  setPageContext: (context: PageAIContext | null) => void;
  /** True while the page on screen is showing its own AI panel, so the floating one steps aside. */
  ownPanel: boolean;
  setOwnPanel: (shown: boolean) => void;
};

const Ctx = createContext<ContextValue>({
  pageContext: null,
  setPageContext: () => {},
  ownPanel: false,
  setOwnPanel: () => {},
});

// Wraps the (dashboard) layout so the AI side panel — a sibling of whatever
// page is currently rendered, not a parent/child of it — can read what the
// active page wants to tell it, without every page needing to reach into
// the panel directly.
export function AIPageContextProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContext] = useState<PageAIContext | null>(null);
  const [ownPanel, setOwnPanel] = useState(false);
  const value = useMemo(() => ({ pageContext, setPageContext, ownPanel, setOwnPanel }), [pageContext, ownPanel]);
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

export function useOwnAiPanelShown(): boolean {
  return useContext(Ctx).ownPanel;
}

// Call from a page whose own contextual AI panel is only sometimes shown (it needs data
// to have loaded, say), passing whether it is showing right now. While true, the floating
// panel stays out of the way; while false, the floating one covers the page instead.
export function useClaimAiPanel(shown: boolean) {
  const { setOwnPanel } = useContext(Ctx);
  useEffect(() => {
    setOwnPanel(shown);
    return () => setOwnPanel(false);
  }, [shown, setOwnPanel]);
}
