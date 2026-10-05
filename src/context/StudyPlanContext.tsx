"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlan } from "@/src/hooks/useStudyPlan";
import { useStudyTasks } from "@/src/hooks/useStudyTasks";
import { useStudySession } from "@/src/hooks/useStudySession";
import { useFocusCard } from "@/src/hooks/useFocusCard";
import { getPlanAggregateUpdates } from "@/src/library/studyPlan/planState";
import type {
  DailyPlan,
  StudyTask,
  StudySession,
  FocusCardState,
  CardCorner,
  SetupConfig,
  TaskStatus,
  GeneratedTask,
  ActivityType,
  TimerMode,
  MissedQuestionsSuggestion,
} from "@/src/library/studyPlan/types";

interface StudyPlanContextValue {
  plan: (DailyPlan & { id: string }) | null;
  planLoading: boolean;
  today: string;
  tasks: (StudyTask & { id: string })[];
  tasksLoading: boolean;
  session: (StudySession & { id: string }) | null;
  sessionLoading: boolean;
  elapsedSeconds: number;
  completedSessionId: string | null;
  focusCard: FocusCardState | null;
  setMinimized: (v: boolean) => void;
  setCorner: (c: CardCorner) => void;

  createPlan: (config: SetupConfig, taskIds: string[]) => Promise<void>;
  updatePlanState: (updates: Partial<DailyPlan>) => Promise<void>;
  createTasksFromGenerated: (
    generated: GeneratedTask[],
    planDate: string
  ) => Promise<string[]>;
  createTaskFromSuggestion: (
    suggestion: MissedQuestionsSuggestion & { id: string },
    planDate: string,
    course: { name: string; code: string }
  ) => Promise<string | null>;
  updateTaskStatus: (
    taskId: string,
    newStatus: TaskStatus,
    reason?: string
  ) => Promise<void>;
  carryOverTask: (taskId: string, today: string) => Promise<void>;
  startSession: (
    taskId: string,
    courseId: string,
    activityType: ActivityType,
    targetId: string | null,
    timerMode?: TimerMode,
    targetSeconds?: number | null
  ) => Promise<string | null>;
  attachTaskToSession: (
    taskId: string,
    details?: {
      courseId: string;
      activityType: ActivityType;
      targetId: string | null;
      activityUrl: string;
    }
  ) => Promise<void>;
  pauseSession: (endAtMs?: number) => Promise<void>;
  resumeSession: () => Promise<void>;
  completeSession: () => Promise<void>;
  abandonSession: () => Promise<void>;
}

const StudyPlanContext = createContext<StudyPlanContextValue | null>(null);

export function StudyPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const {
    plan,
    loading: planLoading,
    today,
    createPlan,
    updatePlanState,
  } = useStudyPlan(uid);

  const {
    tasks,
    loading: tasksLoading,
    createTasksFromGenerated,
    createTaskFromSuggestion,
    updateTaskStatus,
    carryOverTask,
  } = useStudyTasks(uid, today);

  const {
    session,
    loading: sessionLoading,
    elapsedSeconds,
    completedSessionId,
    startSession,
    attachTaskToSession,
    pauseSession,
    resumeSession,
    completeSession,
    abandonSession,
  } = useStudySession(uid);

  const activeTask = session?.taskId
    ? tasks.find((t) => t.id === session.taskId)
    : null;

  const { focusCard, setMinimized, setCorner } = useFocusCard(
    session,
    activeTask?.title ?? "",
    activeTask?.courseCode ?? "",
    elapsedSeconds
  );

  const updateTaskStatusAndPlan = useCallback(
    async (taskId: string, newStatus: TaskStatus, reason?: string) => {
      await updateTaskStatus(taskId, newStatus, reason);
      if (plan) {
        const additionalActiveMinutes =
          newStatus === "completed" && session?.taskId === taskId
            ? session.activeMinutes
            : 0;
        await updatePlanState(
          getPlanAggregateUpdates(
            plan,
            tasks,
            taskId,
            newStatus,
            additionalActiveMinutes
          )
        );
      }
    },
    [plan, session, tasks, updatePlanState, updateTaskStatus]
  );

  const value = useMemo<StudyPlanContextValue>(
    () => ({
      plan,
      planLoading,
      today,
      tasks,
      tasksLoading,
      session,
      sessionLoading,
      elapsedSeconds,
      completedSessionId,
      focusCard,
      setMinimized,
      setCorner,
      createPlan,
      updatePlanState,
      createTasksFromGenerated,
      createTaskFromSuggestion,
      updateTaskStatus: updateTaskStatusAndPlan,
      carryOverTask,
      startSession,
      attachTaskToSession,
      pauseSession,
      resumeSession,
      completeSession,
      abandonSession,
    }),
    [
      plan,
      planLoading,
      today,
      tasks,
      tasksLoading,
      session,
      sessionLoading,
      elapsedSeconds,
      completedSessionId,
      focusCard,
      setMinimized,
      setCorner,
      createPlan,
      updatePlanState,
      createTasksFromGenerated,
      createTaskFromSuggestion,
      updateTaskStatusAndPlan,
      carryOverTask,
      startSession,
      attachTaskToSession,
      pauseSession,
      resumeSession,
      completeSession,
      abandonSession,
    ]
  );

  return (
    <StudyPlanContext.Provider value={value}>
      {children}
    </StudyPlanContext.Provider>
  );
}

export function useStudyPlanContext(): StudyPlanContextValue {
  const ctx = useContext(StudyPlanContext);
  if (!ctx) throw new Error("useStudyPlanContext must be used within StudyPlanProvider");
  return ctx;
}
