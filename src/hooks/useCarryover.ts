"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyTasksCollection } from "@/src/library/studyPlan/firestorePaths";
import type { StudyTask } from "@/src/library/studyPlan/types";

function yesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useCarryover(uid: string | null) {
  const [carryoverTasks, setCarryoverTasks] = useState<
    (StudyTask & { id: string })[]
  >([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!uid) return;

    const yesterday = yesterdayDateString();
    const q = query(
      collection(db, studyTasksCollection(uid)),
      where("scheduledDate", "==", yesterday),
      where("status", "in", ["recommended", "in_progress"])
    );

    getDocs(q).then((snap) => {
      setCarryoverTasks(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as StudyTask) }))
      );
      setChecked(true);
    });
  }, [uid]);

  return { carryoverTasks, checked };
}
