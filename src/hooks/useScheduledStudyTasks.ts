"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyTasksCollection } from "@/src/library/studyPlan/firestorePaths";
import type { StudyTask } from "@/src/library/studyPlan/types";

export function useScheduledStudyTasks(
  uid: string | null,
  fromDate: string,
  toDate: string
) {
  const [tasks, setTasks] = useState<(StudyTask & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      return;
    }
    const q = query(
      collection(db, studyTasksCollection(uid)),
      where("scheduledDate", ">=", fromDate),
      where("scheduledDate", "<=", toDate)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as StudyTask) })));
        setLoading(false);
      },
      (err) => {
        console.error("Scheduled tasks listener error:", err);
        setLoading(false);
      }
    );
    return unsub;
  }, [uid, fromDate, toDate]);

  return { tasks: uid ? tasks : [], loading: uid ? loading : false };
}
