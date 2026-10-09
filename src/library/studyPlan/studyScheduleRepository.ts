import { doc, getDoc, runTransaction, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyTaskPath } from "./firestorePaths";
import type { ScheduleUpdate } from "./studySchedule";

export async function writeTaskSchedules(
  uid: string,
  updates: readonly ScheduleUpdate[]
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  for (const u of updates) {
    batch.update(doc(db, studyTaskPath(uid, u.taskId)), {
      scheduledStart: u.scheduledStart,
      scheduledEnd: u.scheduledEnd,
      scheduleRemoved: false,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function clearTaskSchedule(uid: string, taskId: string): Promise<void> {
  await updateDoc(doc(db, studyTaskPath(uid, taskId)), {
    scheduledStart: null,
    scheduledEnd: null,
    scheduleRemoved: true,
    updatedAt: serverTimestamp(),
  });
}

export async function setTaskGoogleEventId(
  uid: string,
  taskId: string,
  googleEventId: string
): Promise<void> {
  await updateDoc(doc(db, studyTaskPath(uid, taskId)), {
    googleEventId,
    updatedAt: serverTimestamp(),
  });
}

export async function clearTaskGoogleEventId(uid: string, taskId: string): Promise<void> {
  await updateDoc(doc(db, studyTaskPath(uid, taskId)), {
    googleEventId: null,
    updatedAt: serverTimestamp(),
  });
}

export async function getGeneratedPracticeQuizId(
  uid: string,
  taskId: string
): Promise<string | null> {
  const snap = await getDoc(doc(db, studyTaskPath(uid, taskId)));
  if (!snap.exists()) return null;
  const id = snap.data().generatedPracticeQuizId;
  return typeof id === "string" && id ? id : null;
}

/** Attaches the quiz unless one is already attached. Returns the effective quiz id (null if the task is gone). */
export async function attachGeneratedPractice(
  uid: string,
  taskId: string,
  quizId: string,
  sourceDocKey: string | null
): Promise<string | null> {
  const ref = doc(db, studyTaskPath(uid, taskId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const existing = snap.data().generatedPracticeQuizId;
    if (typeof existing === "string" && existing) return existing;
    tx.update(ref, {
      generatedPracticeQuizId: quizId,
      targetId: quizId,
      activityTarget: { kind: "quiz", quizId, sourceDocKey, mode: "full" },
      updatedAt: serverTimestamp(),
    });
    return quizId;
  });
}
