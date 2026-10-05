"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDoc,
  updateDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  runTransaction,
  Timestamp,
  type DocumentData,
  type UpdateData,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  commitSuggestionTask,
  findLinkedActiveTask,
} from "@/src/library/studyPlan/addSuggestionToPlan";
import {
  studyTasksCollection,
  studyTaskPath,
} from "@/src/library/studyPlan/firestorePaths";
import { buildCarryoverUpdate } from "@/src/library/studyPlan/carryover";
import type {
  StudyTask,
  TaskStatus,
  StatusChange,
  GeneratedTask,
  MissedQuestionsSuggestion,
} from "@/src/library/studyPlan/types";

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    value === "recommended" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "skipped" ||
    value === "rescheduled"
  );
}

export function useStudyTasks(uid: string | null, planDate: string | null) {
  const [tasks, setTasks] = useState<(StudyTask & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !planDate) {
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
        const activityTarget = g.activityTarget;
        const targetId =
          activityTarget?.kind === "document" ? activityTarget.resourceId : g.targetId;
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
          targetId,
          ...(activityTarget ? { activityTarget } : {}),
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

  const createTaskFromSuggestion = useCallback(
    async (
      suggestion: MissedQuestionsSuggestion & { id: string },
      planDate: string,
      course: { name: string; code: string },
    ): Promise<string | null> => {
      if (!uid || suggestion.status === "unavailable") return null;
      const existing = findLinkedActiveTask(suggestion, tasks);
      return runTransaction(db, async (transaction) =>
        commitSuggestionTask(
          {
            async get(path) {
              const snap = await transaction.get(doc(db, path));
              return {
                exists: snap.exists(),
                data: () =>
                  snap.exists()
                    ? (snap.data() as Record<string, unknown>)
                    : undefined,
              };
            },
            set(path, data) {
              transaction.set(doc(db, path), data as DocumentData);
            },
            update(path, data) {
              transaction.update(doc(db, path), data as UpdateData<DocumentData>);
            },
            createId() {
              return doc(collection(db, studyTasksCollection(uid))).id;
            },
            serverTimestamp() {
              return serverTimestamp();
            },
          },
          {
            uid,
            suggestion,
            planDate,
            course,
            existingTaskId: existing?.id ?? null,
          },
        ),
      );
    },
    [uid, tasks],
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: TaskStatus, reason?: string) => {
      if (!uid) return;
      const localTask = tasks.find((t) => t.id === taskId);
      let fromStatus = localTask?.status;
      if (!fromStatus) {
        const snap = await getDoc(doc(db, studyTaskPath(uid, taskId)));
        if (!snap.exists()) return;
        const stored = snap.data().status;
        fromStatus = isTaskStatus(stored) ? stored : "recommended";
      }

      const change: StatusChange = {
        from: fromStatus,
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

  const carryOverTask = useCallback(
    async (taskId: string, today: string) => {
      if (!uid) return;
      const ref = doc(db, studyTaskPath(uid, taskId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const update = buildCarryoverUpdate(
        {
          status: isTaskStatus(data.status) ? data.status : "recommended",
          rescheduleCount: typeof data.rescheduleCount === "number" ? data.rescheduleCount : 0,
        },
        today,
      );
      await updateDoc(ref, {
        status: update.status,
        scheduledDate: update.scheduledDate,
        planDate: update.planDate,
        scheduledStart: update.scheduledStart,
        scheduledEnd: update.scheduledEnd,
        scheduleRemoved: update.scheduleRemoved,
        rescheduleCount: update.rescheduleCount,
        statusHistory: arrayUnion({ ...update.change, at: Timestamp.now() }),
        updatedAt: serverTimestamp(),
      });
    },
    [uid]
  );

  return {
    tasks,
    loading,
    createTasksFromGenerated,
    createTaskFromSuggestion,
    updateTaskStatus,
    carryOverTask,
  };
}
