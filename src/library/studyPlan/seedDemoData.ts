import {
  collection,
  doc,
  setDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  studyPlanPath,
  studyTasksCollection,
  masterySignalsCollection,
} from "./firestorePaths";
import type { StudyTask, MasterySignal } from "./types";

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SeedCourse {
  id: string;
  className: string;
  classCode: string;
}

interface SeedResult {
  planId: string;
  taskIds: string[];
  signalIds: string[];
}

export async function seedDemoData(uid: string): Promise<SeedResult> {
  const today = todayDateString();

  await clearDemoData(uid);

  const enrollSnap = await getDocs(
    collection(db, "users", uid, "enrollment")
  );
  const courses: SeedCourse[] = enrollSnap.docs.map((d) => ({
    id: d.id,
    className: (d.data().className as string) || d.id,
    classCode: (d.data().classCode as string) || d.id.toUpperCase(),
  }));

  if (courses.length === 0) {
    throw new Error("No enrolled courses found. Enroll in at least one class first.");
  }

  const demoTasks: Omit<StudyTask, "createdAt" | "updatedAt">[] = [];

  const c1 = courses[0];
  demoTasks.push({
    planDate: today,
    courseId: c1.id,
    courseName: c1.className,
    courseCode: c1.classCode,
    title: `Quiz: ${c1.className} — Key Concepts`,
    activityType: "quiz",
    targetId: null,
    topicLabel: `${c1.className} Key Concepts`,
    estimatedMinutes: 20,
    source: "recommended",
    reason: `Upcoming exam — quiz mastery at 32%`,
    priorityScore: 65,
    status: "recommended",
    statusHistory: [],
    scheduledDate: today,
    rescheduleCount: 0,
    skipCount: 0,
    activeSessionId: null,
    totalActiveMinutes: 0,
    completedAt: null,
  });

  const c2 = courses.length > 1 ? courses[1] : courses[0];
  demoTasks.push({
    planDate: today,
    courseId: c2.id,
    courseName: c2.className,
    courseCode: c2.classCode,
    title: `Review: ${c2.className} Flashcards`,
    activityType: "flashcards",
    targetId: null,
    topicLabel: `${c2.className} Flashcards`,
    estimatedMinutes: 15,
    source: "recommended",
    reason: `Flashcard engagement at 45% — not reviewed recently`,
    priorityScore: 50,
    status: "recommended",
    statusHistory: [],
    scheduledDate: today,
    rescheduleCount: 0,
    skipCount: 0,
    activeSessionId: null,
    totalActiveMinutes: 0,
    completedAt: null,
  });

  const c3 = courses.length > 2 ? courses[2] : courses[0];
  demoTasks.push({
    planDate: today,
    courseId: c3.id,
    courseName: c3.className,
    courseCode: c3.classCode,
    title: `Read: ${c3.className} — Chapter Review`,
    activityType: "reading",
    targetId: null,
    topicLabel: `${c3.className} Chapter Review`,
    estimatedMinutes: 20,
    source: "recommended",
    reason: `General review — strengthen understanding before next class`,
    priorityScore: 35,
    status: "recommended",
    statusHistory: [],
    scheduledDate: today,
    rescheduleCount: 0,
    skipCount: 0,
    activeSessionId: null,
    totalActiveMinutes: 0,
    completedAt: null,
  });

  const taskIds: string[] = [];
  const tasksCol = collection(db, studyTasksCollection(uid));
  for (const task of demoTasks) {
    const ref = doc(tasksCol);
    await setDoc(ref, {
      ...task,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    taskIds.push(ref.id);
  }

  const planRef = doc(db, studyPlanPath(uid, today));
  await setDoc(planRef, {
    state: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    setupConfig: {
      availableMinutes: 60,
      goal: "exam_prep",
      courseId: null,
      activityPreference: "auto",
    },
    taskIds,
    totalTasks: taskIds.length,
    completedCount: 0,
    skippedCount: 0,
    totalActiveMinutes: 0,
  });

  const signalIds: string[] = [];
  const signalsCol = collection(db, masterySignalsCollection(uid));

  const signalData: Omit<MasterySignal, "lastStudiedAt" | "lastCalculatedAt">[] = [
    {
      courseId: c1.id,
      courseName: c1.className,
      topicLabel: `${c1.className} Key Concepts`,
      signalType: "quiz_mastery",
      value: 0.32,
    },
    {
      courseId: c2.id,
      courseName: c2.className,
      topicLabel: `${c2.className} Flashcards`,
      signalType: "flashcard_engagement",
      value: 0.45,
    },
    {
      courseId: c3.id,
      courseName: c3.className,
      topicLabel: `${c3.className} Chapter Review`,
      signalType: "quiz_mastery",
      value: 0.68,
    },
  ];

  for (const signal of signalData) {
    const signalId = `${signal.courseId}_${signal.topicLabel}_${signal.signalType}`;
    const ref = doc(signalsCol, signalId);
    await setDoc(ref, {
      ...signal,
      lastStudiedAt: Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ),
      lastCalculatedAt: serverTimestamp(),
    });
    signalIds.push(signalId);
  }

  return { planId: today, taskIds, signalIds };
}

export async function clearDemoData(uid: string): Promise<void> {
  const today = todayDateString();

  const tasksSnap = await getDocs(
    collection(db, studyTasksCollection(uid))
  );
  const { deleteDoc } = await import("firebase/firestore");
  for (const d of tasksSnap.docs) {
    if (d.data().scheduledDate === today) {
      await deleteDoc(d.ref);
    }
  }

  const planRef = doc(db, studyPlanPath(uid, today));
  await deleteDoc(planRef);
}
