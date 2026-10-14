"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studySessionsCollection } from "@/src/library/studyPlan/firestorePaths";
import { localDateKey } from "@/src/library/studyPlan/weeklyRuler";
import {
  computeStudyStreak,
  emptyStudyStreak,
  STREAK_LOOKBACK_DAYS,
  type StudyStreak,
} from "@/src/library/learning/streak";

export function useStudyStreak(uid: string | null): {
  streak: StudyStreak;
  loading: boolean;
  error: string | null;
  retry(): void;
} {
  const [streak, setStreak] = useState<StudyStreak>(() => emptyStudyStreak(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!uid) {
      setStreak(emptyStudyStreak(new Date()));
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    windowStart.setDate(windowStart.getDate() - STREAK_LOOKBACK_DAYS);

    const q = query(
      collection(db, studySessionsCollection(uid)),
      where("startedAt", ">=", Timestamp.fromDate(windowStart)),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const keys = new Set<string>();
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (data.status !== "completed" && data.status !== "abandoned") continue;
          if (!(data.activeMinutes > 0)) continue;
          if (data.startedAt?.toDate) keys.add(localDateKey(data.startedAt.toDate()));
        }
        setStreak(computeStudyStreak(keys, new Date()));
        setLoading(false);
      },
      () => {
        setError("Couldn't load your study streak.");
        setStreak(emptyStudyStreak(new Date()));
        setLoading(false);
      },
    );

    return unsub;
  }, [uid, reloadKey]);

  return { streak, loading, error, retry };
}
