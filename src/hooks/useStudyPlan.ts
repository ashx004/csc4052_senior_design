"use client";

import { useState, useEffect, useCallback } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyPlanPath } from "@/src/library/studyPlan/firestorePaths";
import type { DailyPlan, SetupConfig } from "@/src/library/studyPlan/types";

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useStudyPlan(uid: string | null) {
  const [plan, setPlan] = useState<(DailyPlan & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const today = todayDateString();

  useEffect(() => {
    if (!uid) {
      setPlan(null);
      setLoading(false);
      return;
    }

    const docRef = doc(db, studyPlanPath(uid, today));
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setPlan({ id: snap.id, ...(snap.data() as DailyPlan) });
        } else {
          setPlan(null);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid, today]);

  const createPlan = useCallback(
    async (config: SetupConfig, taskIds: string[]) => {
      if (!uid) return;
      const docRef = doc(db, studyPlanPath(uid, today));
      const newPlan: Omit<DailyPlan, "createdAt" | "updatedAt"> & {
        createdAt: ReturnType<typeof serverTimestamp>;
        updatedAt: ReturnType<typeof serverTimestamp>;
      } = {
        state: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        setupConfig: config,
        taskIds,
        totalTasks: taskIds.length,
        completedCount: 0,
        skippedCount: 0,
        totalActiveMinutes: 0,
      };
      await setDoc(docRef, newPlan);
    },
    [uid, today]
  );

  const updatePlanState = useCallback(
    async (updates: Partial<DailyPlan>) => {
      if (!uid) return;
      const docRef = doc(db, studyPlanPath(uid, today));
      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
    },
    [uid, today]
  );

  return { plan, loading, today, createPlan, updatePlanState };
}
