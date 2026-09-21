"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  type DocumentData,
  type UpdateData,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  studyTasksCollection,
  studyTaskPath,
} from "@/src/library/studyPlan/firestorePaths";
import type {
  StudyTask,
  TaskStatus,
  StatusChange,
  GeneratedTask,
} from "@/src/library/studyPlan/types";

export function useStudyTasks(uid: string | null, planDate: string | null) {
  const [tasks, setTasks] = useState<(StudyTask & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !planDate) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, studyTasksCollection(uid)),
      where("scheduledDate", "==", planDate)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as StudyTask),
        }));
        setTasks(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid, planDate]);

  const createTasksFromGenerated = useCallback(
    async (generated: GeneratedTask[], planDateStr: string) => {
      if (!uid) return [];
      const ids: string[] = [];
      for (const g of generated) {
        const taskData: Omit<StudyTask, "createdAt" | "updatedAt"> & {
          createdAt: ReturnType<typeof serverTimestamp>;
          updatedAt: ReturnType<typeof serverTimestamp>;
        } = {
          planDate: planDateStr,
          courseId: g.courseId,
          courseName: g.courseName,
          courseCode: g.courseCode,
          title: g.title,
          activityType: g.activityType,
          targetId: g.targetId,
          topicLabel: g.topicLabel,
          estimatedMinutes: g.estimatedMinutes,
          source: "recommended",
          reason: g.reason,
          priorityScore: g.priorityScore,
          status: "recommended",
          statusHistory: [],
          scheduledDate: planDateStr,
          rescheduleCount: 0,
          skipCount: 0,
          activeSessionId: null,
          totalActiveMinutes: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          completedAt: null,
        };
        const ref = await addDoc(
          collection(db, studyTasksCollection(uid)),
          taskData
        );
        ids.push(ref.id);
      }
      return ids;
    },
    [uid]
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: TaskStatus, reason?: string) => {
      if (!uid) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const change: StatusChange = {
        from: task.status,
        to: newStatus,
        at: Timestamp.now(),
        ...(reason ? { reason } : {}),
      };

      const updates: UpdateData<DocumentData> = {
        status: newStatus,
        statusHistory: arrayUnion(change),
        updatedAt: serverTimestamp(),
      };

      if (newStatus === "completed") {
        updates.completedAt = serverTimestamp();
      }

      await updateDoc(doc(db, studyTaskPath(uid, taskId)), updates);
    },
    [uid, tasks]
  );

  return { tasks, loading, createTasksFromGenerated, updateTaskStatus };
}
