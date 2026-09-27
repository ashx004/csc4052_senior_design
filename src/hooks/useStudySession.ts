"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  studySessionsCollection,
  studySessionPath,
} from "@/src/library/studyPlan/firestorePaths";
import { getActivityUrl } from "@/src/library/studyPlan/sessionTimer";
import {
  computeActiveMinutes,
  computeElapsedSeconds,
} from "@/src/library/studyPlan/focusTimer";
import type {
  StudySession,
  ActivityType,
  TimerMode,
} from "@/src/library/studyPlan/types";

const LAST_SEEN_KEY = "focus-session-last-seen";

function touchLastSeen() {
  try {
    localStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
  } catch {
    /* storage unavailable */
  }
}

function clearLastSeen() {
  try {
    localStorage.removeItem(LAST_SEEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useStudySession(uid: string | null) {
  const [session, setSession] = useState<
    (StudySession & { id: string }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!uid) {
      setSession(null);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, studySessionsCollection(uid)),
      where("status", "in", ["active", "paused"]),
      limit(1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setSession(null);
        } else {
          const d = snap.docs[0];
          const s = { id: d.id, ...(d.data() as StudySession) };

          // A closed tab stops the timer. If we return more than a minute
          // later, the chicken dies instead of silently continuing.
          if (s.status === "active") {
            try {
              const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
              if (lastSeen) {
                const elapsed = Date.now() - parseInt(lastSeen, 10);
                if (Number.isFinite(elapsed) && elapsed > 60_000) {
                  updateDoc(doc(db, studySessionPath(uid!, d.id)), {
                    status: "abandoned",
                    activeMinutes: s.activeMinutes,
                  });
                  clearLastSeen();
                  setSession(null);
                  setLoading(false);
                  return;
                }
              }
            } catch {
              /* storage unavailable */
            }
          }

          setSession(s);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (session?.status === "active") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(computeElapsedSeconds(session, Date.now()));
        touchLastSeen();
      }, 1000);
    } else {
      setElapsedSeconds(
        session ? computeElapsedSeconds(session, Date.now()) : 0
      );
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status]);

  const startSession = useCallback(
    async (
      taskId: string,
      courseId: string,
      activityType: ActivityType,
      targetId: string | null,
      timerMode: TimerMode = "countup",
      targetSeconds: number | null = null
    ) => {
      if (!uid) return null;
      touchLastSeen();
      const url = getActivityUrl(activityType, courseId, targetId);
      const now = Timestamp.now();
      const ref = await addDoc(
        collection(db, studySessionsCollection(uid)),
        {
          taskId,
          courseId,
          activityType,
          targetId,
          status: "active",
          startedAt: serverTimestamp(),
          pausedAt: null,
          completedAt: null,
          activeMinutes: 0,
          periods: [{ startedAt: now, endedAt: null }],
          activityUrl: url,
          timerMode,
          targetSeconds,
        }
      );
      return ref.id;
    },
    [uid]
  );

  const attachTaskToSession = useCallback(
    async (
      taskId: string,
      details?: {
        courseId: string;
        activityType: ActivityType;
        targetId: string | null;
        activityUrl: string;
      }
    ) => {
      if (!uid || !session) return;
      await updateDoc(doc(db, studySessionPath(uid, session.id)), {
        taskId,
        ...(details ?? {}),
      });
    },
    [uid, session]
  );

  const pauseSession = useCallback(async () => {
    if (!uid || !session) return;
    const now = Timestamp.now();
    const updatedPeriods = session.periods.map((p, i) =>
      i === session.periods.length - 1 && !p.endedAt
        ? { ...p, endedAt: now }
        : p
    );
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "paused",
      pausedAt: serverTimestamp(),
      periods: updatedPeriods,
      activeMinutes: computeActiveMinutes(updatedPeriods, Date.now()),
    });
  }, [uid, session]);

  const resumeSession = useCallback(async () => {
    if (!uid || !session) return;
    touchLastSeen();
    const now = Timestamp.now();
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "active",
      pausedAt: null,
      periods: [...session.periods, { startedAt: now, endedAt: null }],
    });
  }, [uid, session]);

  const completeSession = useCallback(async () => {
    if (!uid || !session) return;
    const now = Timestamp.now();
    const updatedPeriods = session.periods.map((p, i) =>
      i === session.periods.length - 1 && !p.endedAt
        ? { ...p, endedAt: now }
        : p
    );
    clearLastSeen();
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "completed",
      completedAt: serverTimestamp(),
      periods: updatedPeriods,
      activeMinutes: computeActiveMinutes(updatedPeriods, Date.now()),
    });
  }, [uid, session]);

  const abandonSession = useCallback(async () => {
    if (!uid || !session) return;
    const now = Timestamp.now();
    const updatedPeriods = session.periods.map((p, i) =>
      i === session.periods.length - 1 && !p.endedAt
        ? { ...p, endedAt: now }
        : p
    );
    clearLastSeen();
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "abandoned",
      periods: updatedPeriods,
      activeMinutes: computeActiveMinutes(updatedPeriods, Date.now()),
    });
  }, [uid, session]);

  return {
    session,
    loading,
    elapsedSeconds,
    startSession,
    attachTaskToSession,
    pauseSession,
    resumeSession,
    completeSession,
    abandonSession,
  };
}
