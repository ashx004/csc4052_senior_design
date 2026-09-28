"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studySessionsCollection } from "@/src/library/studyPlan/firestorePaths";
import {
  mondayOf,
  weekDateKeys,
  localDateKey,
} from "@/src/library/studyPlan/weeklyRuler";

interface DailyStudy {
  date: string;
  minutes: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  hasStudy: boolean;
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
    setLoading(true);
    setError(null);

    const now = new Date();
    const monday = mondayOf(now);
    const keys = weekDateKeys(monday);
    const todayKey = localDateKey(now);

    const q = query(
      collection(db, studySessionsCollection(uid)),
      where("startedAt", ">=", Timestamp.fromDate(monday))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const byDate = new Map<string, number>();
        for (const k of keys) byDate.set(k, 0);
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (data.status !== "completed" && data.status !== "abandoned") continue;
          if (data.startedAt?.toDate) {
            const key = localDateKey(data.startedAt.toDate());
            if (byDate.has(key)) {
              byDate.set(key, (byDate.get(key) ?? 0) + (data.activeMinutes ?? 0));
            }
          }
        }
        setDailyMinutes(
          keys.map((date) => {
            const minutes = byDate.get(date) ?? 0;
            return {
              date,
              minutes,
              isToday: date === todayKey,
              isPast: date < todayKey,
              isFuture: date > todayKey,
              hasStudy: minutes > 0,
            };
          })
        );
        setLoading(false);
      },
      () => {
        setError("Couldn't load this week's focus history.");
        setDailyMinutes([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [uid, reloadKey]);

  const countedDays = dailyMinutes.filter((d) => !d.isFuture);
  const totalMinutes = countedDays.reduce((sum, d) => sum + d.minutes, 0);
  const daysWithStudy = countedDays.filter((d) => d.minutes > 0).length;
  const dailyAverage =
    daysWithStudy > 0 ? Math.round(totalMinutes / daysWithStudy) : 0;

  return { dailyMinutes, dailyAverage, loading, error, retry };
}
