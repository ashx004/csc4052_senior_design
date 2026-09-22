"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { getTutorialsSeen, markTutorialSeen, resetTutorials, type TutorialsSeenMap } from "@/src/library/tutorials/tutorialStore";
import type { TutorialId } from "@/src/library/tutorials/types";

interface TutorialContextValue {
  // False until this user's tutorialsSeen map has loaded — pages should
  // wait for this before deciding whether to show a tour, otherwise every
  // tutorial would flash on for a signed-in-but-not-yet-loaded instant.
  ready: boolean;
  hasSeen: (id: TutorialId) => boolean;
  markSeen: (id: TutorialId) => void;
  /** Claims the single "currently showing" slot for this tutorial id. A
   *  page should only render its overlay if this returns true — keeps two
   *  tours from ever stacking if more than one PageTutorial mounts at once. */
  requestActive: (id: TutorialId) => boolean;
  release: (id: TutorialId) => void;
  /** Settings' "Replay tutorials" control. */
  replay: (ids: TutorialId[]) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [seen, setSeen] = useState<TutorialsSeenMap>({});
  const [ready, setReady] = useState(false);
  const activeRef = useRef<TutorialId | null>(null);
  const loadedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSeen({});
      setReady(false);
      loadedForUidRef.current = null;
      return;
    }
    if (loadedForUidRef.current === user.uid) return;
    loadedForUidRef.current = user.uid;
    setReady(false);
    getTutorialsSeen(user.uid).then((map) => {
      setSeen(map);
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

  const requestActive = useCallback((id: TutorialId) => {
    if (activeRef.current && activeRef.current !== id) return false;
    activeRef.current = id;
    return true;
  }, []);

  const release = useCallback((id: TutorialId) => {
    if (activeRef.current === id) activeRef.current = null;
  }, []);

  const replay = useCallback(
    (ids: TutorialId[]) => {
      setSeen((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      if (user) resetTutorials(user.uid, ids);
    },
    [user]
  );

  const value = useMemo<TutorialContextValue>(
    () => ({ ready, hasSeen, markSeen, requestActive, release, replay }),
    [ready, hasSeen, markSeen, requestActive, release, replay]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}
