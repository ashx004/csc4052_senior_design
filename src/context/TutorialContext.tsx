"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  getTutorialsOptedOut,
  getTutorialsSeen,
  markTutorialSeen,
  resetAllTutorials,
  setTutorialsOptedOut,
  type TutorialsSeenMap,
} from "@/src/library/tutorials/tutorialStore";
import type { TutorialId } from "@/src/library/tutorials/types";

interface TutorialContextValue {
  // False until this user's tutorialsSeen map (and opt-out flag) has
  // loaded — pages should wait for this before deciding whether to show a
  // tour, otherwise every tutorial would flash on for a signed-in-but-not
  // -yet-loaded instant.
  ready: boolean;
  hasSeen: (id: TutorialId) => boolean;
  markSeen: (id: TutorialId) => void;
  /** True once the user has ever checked "Don't show me tutorials again" -
   *  suppresses every PageTutorial regardless of per-id seen state,
   *  including ids that didn't exist yet when they opted out. */
  optedOut: boolean;
  /** Backs TutorialOverlay's "skip all future tutorials" checkbox. */
  optOutOfAll: () => void;
  /** Claims the single "currently showing" slot for this tutorial id. A
   *  page should only render its overlay if this returns true — keeps two
   *  tours from ever stacking if more than one PageTutorial mounts at once. */
  requestActive: (id: TutorialId) => boolean;
  release: (id: TutorialId) => void;
  /** Settings' "Replay tutorials" control - clears every tutorial's seen
   *  flag AND the opt-out, so it works again for someone who'd opted out. */
  resetAll: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [seen, setSeen] = useState<TutorialsSeenMap>({});
  const [optedOut, setOptedOut] = useState(false);
  const [ready, setReady] = useState(false);
  const activeRef = useRef<TutorialId | null>(null);
  const loadedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSeen({});
      setOptedOut(false);
      setReady(false);
      loadedForUidRef.current = null;
      return;
    }
    if (loadedForUidRef.current === user.uid) return;
    loadedForUidRef.current = user.uid;
    setReady(false);
    Promise.all([getTutorialsSeen(user.uid), getTutorialsOptedOut(user.uid)]).then(([map, optedOutValue]) => {
      setSeen(map);
      setOptedOut(optedOutValue);
      setReady(true);
    });
  }, [user]);

  const hasSeen = useCallback((id: TutorialId) => !!seen[id], [seen]);

  const markSeen = useCallback(
    (id: TutorialId) => {
      setSeen((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      if (user) markTutorialSeen(user.uid, id);
    },
    [user]
  );

  const optOutOfAll = useCallback(() => {
    setOptedOut(true);
    if (user) setTutorialsOptedOut(user.uid, true);
  }, [user]);

  const requestActive = useCallback((id: TutorialId) => {
    if (activeRef.current && activeRef.current !== id) return false;
    activeRef.current = id;
    return true;
  }, []);

  const release = useCallback((id: TutorialId) => {
    if (activeRef.current === id) activeRef.current = null;
  }, []);

  const resetAll = useCallback(() => {
    setSeen({});
    setOptedOut(false);
    if (user) resetAllTutorials(user.uid);
  }, [user]);

  const value = useMemo<TutorialContextValue>(
    () => ({ ready, hasSeen, markSeen, optedOut, optOutOfAll, requestActive, release, resetAll }),
    [ready, hasSeen, markSeen, optedOut, optOutOfAll, requestActive, release, resetAll]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}
