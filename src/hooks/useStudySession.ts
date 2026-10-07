"use client";

import { track } from "@/src/library/analytics";
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
  computeActiveSeconds,
  computeElapsedSeconds,
} from "@/src/library/studyPlan/focusTimer";
import type {
  StudySession,
  ActivityType,
  TimerMode,
} from "@/src/library/studyPlan/types";

const LAST_SEEN_KEY = "focus-session-last-seen";

/** A closed/backgrounded tab auto-pauses (not abandons) only after this long
 *  away, matching the in-tab visibility threshold. */
const AWAY_PAUSE_MS = 5 * 60 * 1000;

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
  // The id of the session that most recently completed. The focus card watches
  // this to open its "done" choice instead of silently vanishing when a session
  // finishes (Done button, quiz submit, reading finished).
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
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

          // A closed/backgrounded tab stops the timer. If we return more than a
          // minute later, the session auto-pauses at the moment we left (away
          // time is not counted) so it can be resumed exactly where it stopped.
          if (s.status === "active") {
            try {
              const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
              if (lastSeen) {
                const leftAtMs = parseInt(lastSeen, 10);
                const elapsed = Date.now() - leftAtMs;
                if (Number.isFinite(elapsed) && elapsed > AWAY_PAUSE_MS) {
                  const end = Timestamp.fromMillis(leftAtMs);
                  const updatedPeriods = s.periods.map((p, i) =>
                    i === s.periods.length - 1 && !p.endedAt
                      ? { ...p, endedAt: end }
                      : p
                  );
                  updateDoc(doc(db, studySessionPath(uid!, d.id)), {
                    status: "paused",
                    pausedAt: serverTimestamp(),
                    periods: updatedPeriods,
                    activeMinutes: computeActiveMinutes(updatedPeriods, leftAtMs),
                    activeSeconds: computeActiveSeconds(updatedPeriods, leftAtMs),
                  });
                  clearLastSeen();
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
      void track("study_session_started", { task_type: activityType }, ref.id);
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

  const pauseSession = useCallback(async (endAtMs?: number) => {
    if (!uid || !session) return;
    // Auto-pause (tab-away) passes the moment the user left so the away time is
    // not counted; a manual pause ends the open period now. Guard against
    // onClick handlers that hand us a MouseEvent instead of a timestamp.
    const end =
      typeof endAtMs === "number" && Number.isFinite(endAtMs)
        ? Timestamp.fromMillis(endAtMs)
        : Timestamp.now();
    const updatedPeriods = session.periods.map((p, i) =>
      i === session.periods.length - 1 && !p.endedAt
        ? { ...p, endedAt: end }
        : p
    );
    const nowMs = Date.now();
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "paused",
      pausedAt: serverTimestamp(),
      periods: updatedPeriods,
      activeMinutes: computeActiveMinutes(updatedPeriods, nowMs),
      activeSeconds: computeActiveSeconds(updatedPeriods, nowMs),
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
    const sessionId = session.id;
    const now = Timestamp.now();
    const updatedPeriods = session.periods.map((p, i) =>
      i === session.periods.length - 1 && !p.endedAt
        ? { ...p, endedAt: now }
        : p
    );
    clearLastSeen();
    const nowMs = Date.now();
    // Signal the focus card before the write lands, so its "done" overlay opens
    // in the same beat the session leaves the active query (no flicker/vanish).
    setCompletedSessionId(sessionId);
    try {
      await updateDoc(doc(db, studySessionPath(uid, sessionId)), {
        status: "completed",
        completedAt: serverTimestamp(),
        periods: updatedPeriods,
        activeMinutes: computeActiveMinutes(updatedPeriods, nowMs),
        activeSeconds: computeActiveSeconds(updatedPeriods, nowMs),
      });
      void track(
        "study_session_completed",
        {
          task_type: session.activityType,
          duration_seconds: computeActiveSeconds(updatedPeriods, nowMs),
        },
        sessionId,
      );
    } catch (error) {
      setCompletedSessionId((id) => (id === sessionId ? null : id));
      throw error;
    }
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
    const nowMs = Date.now();
    await updateDoc(doc(db, studySessionPath(uid, session.id)), {
      status: "abandoned",
      periods: updatedPeriods,
      activeMinutes: computeActiveMinutes(updatedPeriods, nowMs),
      activeSeconds: computeActiveSeconds(updatedPeriods, nowMs),
    });
  }, [uid, session]);

  return {
    session,
    loading,
    elapsedSeconds,
    completedSessionId,
    startSession,
    attachTaskToSession,
    pauseSession,
    resumeSession,
    completeSession,
    abandonSession,
  };
}
