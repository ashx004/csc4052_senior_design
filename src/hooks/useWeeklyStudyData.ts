"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studySessionsCollection } from "@/src/library/studyPlan/firestorePaths";

interface DailyStudy {
  date: string;
  minutes: number;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useWeeklyStudyData(uid: string | null) {
  const [dailyMinutes, setDailyMinutes] = useState<DailyStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!uid) {
      setDailyMinutes([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Range on startedAt only. Filtering status in memory avoids a
        // composite index that this project does not declare.
        const q = query(
          collection(db, studySessionsCollection(uid!)),
          where("startedAt", ">=", Timestamp.fromDate(sevenDaysAgo))
        );

        const snap = await getDocs(q);
        if (cancelled) return;

        const byDate = new Map<string, number>();
        for (let i = 0; i < 7; i++) {
          const d = new Date(sevenDaysAgo);
          d.setDate(d.getDate() + i);
          byDate.set(localDateKey(d), 0);
        }

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (data.status !== "completed" && data.status !== "abandoned") continue;
          if (data.startedAt?.toDate) {
            const dateKey = localDateKey(data.startedAt.toDate());
            if (byDate.has(dateKey)) {
              byDate.set(
                dateKey,
                (byDate.get(dateKey) ?? 0) + (data.activeMinutes ?? 0)
              );
            }
          }
        }

        setDailyMinutes(
          Array.from(byDate, ([date, minutes]) => ({ date, minutes }))
        );
      } catch {
        if (!cancelled) {
          setError("Couldn't load this week's focus history.");
          setDailyMinutes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [uid, reloadKey]);

  const totalMinutes = dailyMinutes.reduce((sum, d) => sum + d.minutes, 0);
  const daysWithStudy = dailyMinutes.filter((d) => d.minutes > 0).length;
  const dailyAverage =
    daysWithStudy > 0 ? Math.round(totalMinutes / daysWithStudy) : 0;

  return { dailyMinutes, dailyAverage, loading, error, retry };
}
