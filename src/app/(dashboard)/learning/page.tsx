"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { useCarryover } from "@/src/hooks/useCarryover";
import { useCalendarEvents } from "@/src/hooks/useCalendarEvents";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { collection, getDocs, addDoc, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { generateTasks } from "@/src/library/studyPlan/recommendationEngine";
import { getActivityUrl } from "@/src/library/studyPlan/sessionTimer";
import { studyTasksCollection } from "@/src/library/studyPlan/firestorePaths";
import { inferEventCategory } from "@/src/library/studyPlan/calendarKeywordMatch";
import type {
  SetupConfig,
  PlanViewMode,
  EligibleTopic,
  ActivityType,
} from "@/src/library/studyPlan/types";
import Link from "next/link";
import { Briefcase, GraduationCap, Loader2 } from "lucide-react";
import PlanEmptyState from "@/src/components/studyPlan/PlanEmptyState";
import PlanCompletedState from "@/src/components/studyPlan/PlanCompletedState";
import PlanHeader from "@/src/components/studyPlan/PlanHeader";
import CarryoverPrompt from "@/src/components/studyPlan/CarryoverPrompt";
import ClearPlanModal from "@/src/components/studyPlan/ClearPlanModal";
import AddTaskModal from "@/src/components/studyPlan/AddTaskModal";
import SkipConfirmModal from "@/src/components/studyPlan/SkipConfirmModal";
import RescheduleModal from "@/src/components/studyPlan/RescheduleModal";
import SetupModal from "@/src/components/studyPlan/SetupFlow/SetupModal";
import ViewSwitcher from "@/src/components/studyPlan/Views/ViewSwitcher";
import ListView from "@/src/components/studyPlan/Views/ListView";
import BoardView from "@/src/components/studyPlan/Views/BoardView";
import ScheduleView from "@/src/components/studyPlan/Views/ScheduleView";

interface EnrolledClass {
  id: string;
  classCode: string;
  className: string;
  term: string;
}

export default function LearningPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    plan,
    planLoading,
    today,
    tasks,
    createPlan,
    updatePlanState,
    createTasksFromGenerated,
    updateTaskStatus,
    session,
    startSession,
    pauseSession,
    completeSession,
    abandonSession,
  } = useStudyPlanContext();
  const { carryoverTasks, checked: carryoverChecked } = useCarryover(
    user?.uid ?? null
  );

  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [viewMode, setViewMode] = useState<PlanViewMode>(() => {
    if (typeof window === "undefined") return "list";
    try { return (localStorage.getItem("studyPlanView") as PlanViewMode) ?? "list"; } catch { return "list"; }
  });
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState<{ taskId: string; title: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);

  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [today]);

  const { events: googleEvents } = useCalendarEvents(todayRange);
  const { events: localEvents } = useLocalCalendarEvents(todayRange);
  const allEvents = useMemo(
    () => [...googleEvents, ...localEvents],
    [googleEvents, localEvents]
  );

  useEffect(() => {
    if (authLoading || !user) {
      setClassesLoading(false);
      return;
    }
    getDocs(collection(db, "users", user.uid, "enrollment")).then((snap) => {
      setClasses(
        snap.docs.map((d) => ({
          id: d.id,
          classCode: d.data().classCode ?? "",
          className: d.data().className ?? "",
          term: d.data().term ?? "",
        }))
      );
      setClassesLoading(false);
    });
  }, [user, authLoading]);

  useEffect(() => {
    try { localStorage.setItem("studyPlanView", viewMode); } catch {}
  }, [viewMode]);

  const handleSetupSubmit = useCallback(
    async (config: SetupConfig) => {
      if (!user) return;
      const topics: EligibleTopic[] = [];
      for (const cls of classes) {
        const quizSnap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "quizSets")
        );
        for (const qs of quizSnap.docs) {
          topics.push({
            courseId: cls.id,
            courseName: cls.className,
            courseCode: cls.classCode,
            topicLabel: qs.data().topicName ?? qs.data().name ?? qs.id,
            targetId: qs.id,
            activityType: "quiz",
            quizMastery: null,
            flashcardEngagement: null,
            lastStudiedAt: null,
            skipCount: 0,
          });
        }
        const fcSnap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "flashcardSets")
        );
        for (const fc of fcSnap.docs) {
          topics.push({
            courseId: cls.id,
            courseName: cls.className,
            courseCode: cls.classCode,
            topicLabel: fc.data().topicName ?? fc.data().name ?? fc.id,
            targetId: fc.id,
            activityType: "flashcards",
            quizMastery: null,
            flashcardEngagement: null,
            lastStudiedAt: null,
            skipCount: 0,
          });
        }
      }

      const exams = new Map<string, number>();
      for (const event of allEvents) {
        const cat = event.category ?? inferEventCategory(event);
        if (cat === "exam" || cat === "deadline") {
          const daysUntil = Math.ceil(
            (new Date(event.startTime).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          );
          if (daysUntil >= 0 && daysUntil <= 14) {
            for (const cls of classes) {
              if (
                event.title
                  .toLowerCase()
                  .includes(cls.classCode.toLowerCase()) ||
                event.title.toLowerCase().includes(cls.className.toLowerCase())
              ) {
                const existing = exams.get(cls.id);
                if (existing === undefined || daysUntil < existing) {
                  exams.set(cls.id, daysUntil);
                }
              }
            }
          }
        }
      }

      const generated = generateTasks(config, topics, exams);
      const taskIds = await createTasksFromGenerated(generated, today);
      await createPlan(config, taskIds);
      setShowSetup(false);
    },
    [user, classes, allEvents, today, createPlan, createTasksFromGenerated]
  );

  const handleStartTask = useCallback(
    async (taskId: string) => {
      if (!user) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (session) {
        await pauseSession();
        const prevTask = tasks.find((t) => t.id === session.taskId);
        if (prevTask && prevTask.status === "in_progress") {
          await updateTaskStatus(session.taskId, "recommended");
        }
      }

      await updateTaskStatus(taskId, "in_progress");
      await startSession(
        taskId,
        task.courseId,
        task.activityType,
        task.targetId
      );

      const url = getActivityUrl(task.activityType, task.courseId, task.targetId);
      router.push(url);
    },
    [user, tasks, session, pauseSession, updateTaskStatus, startSession, router]
  );

  const handleSkipTask = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (task.status === "in_progress") {
        setSkipConfirm({ taskId, title: task.title });
      } else {
        await updateTaskStatus(taskId, "skipped");
      }
    },
    [tasks, updateTaskStatus]
  );

  const handleConfirmSkip = useCallback(async () => {
    if (!skipConfirm) return;
    if (session && session.taskId === skipConfirm.taskId) {
      await abandonSession();
    }
    await updateTaskStatus(skipConfirm.taskId, "skipped");
    setSkipConfirm(null);
  }, [skipConfirm, session, abandonSession, updateTaskStatus]);

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      if (session && session.taskId === taskId) {
        await completeSession();
      }
      await updateTaskStatus(taskId, "completed");
    },
    [session, completeSession, updateTaskStatus]
  );

  const handleReschedule = useCallback(
    async (date: string) => {
      if (!rescheduleTarget) return;
      if (session && session.taskId === rescheduleTarget) {
        await abandonSession();
      }
      await updateTaskStatus(
        rescheduleTarget,
        "rescheduled",
        `Rescheduled to ${date}`
      );
      setRescheduleTarget(null);
    },
    [rescheduleTarget, session, abandonSession, updateTaskStatus]
  );

  const handleClearPlan = useCallback(async () => {
    for (const task of tasks) {
      if (task.status === "in_progress" && session?.taskId === task.id) {
        await abandonSession();
      }
      if (task.status === "recommended" || task.status === "in_progress") {
        await updateTaskStatus(task.id, "skipped");
      }
    }
    await updatePlanState({ state: "abandoned" });
    setShowClearModal(false);
  }, [tasks, session, abandonSession, updateTaskStatus, updatePlanState]);

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, studyTasksCollection(user.uid), taskId));
    },
    [user]
  );

  const handleAddManualTask = useCallback(
    async (taskData: {
      title: string;
      courseId: string;
      courseName: string;
      courseCode: string;
      activityType: ActivityType;
      estimatedMinutes: number;
    }) => {
      if (!user) return;
      await addDoc(collection(db, studyTasksCollection(user.uid)), {
        planDate: today,
        courseId: taskData.courseId,
        courseName: taskData.courseName,
        courseCode: taskData.courseCode,
        title: taskData.title,
        activityType: taskData.activityType,
        targetId: null,
        topicLabel: taskData.title,
        estimatedMinutes: taskData.estimatedMinutes,
        source: "manual",
        reason: null,
        priorityScore: null,
        status: "recommended",
        statusHistory: [],
        scheduledDate: today,
        rescheduleCount: 0,
        skipCount: 0,
        activeSessionId: null,
        totalActiveMinutes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
      });
    },
    [user, today]
  );

  const handleCarryoverContinue = useCallback(async () => {
    if (!user) return;
    const taskIds: string[] = [];
    for (const t of carryoverTasks) {
      await updateTaskStatus(t.id, "recommended");
      taskIds.push(t.id);
    }
    await createPlan(
      { availableMinutes: 60, goal: "general", courseId: null, activityPreference: "auto" },
      taskIds
    );
  }, [user, carryoverTasks, updateTaskStatus, createPlan]);

  const handleCarryoverFresh = useCallback(async () => {
    for (const t of carryoverTasks) {
      await updateTaskStatus(t.id, "rescheduled", "Started fresh");
    }
  }, [carryoverTasks, updateTaskStatus]);

  if (authLoading || classesLoading || planLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-main">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const activeTasks = tasks.filter(
    (t) => t.status !== "skipped" && t.status !== "rescheduled"
  );
  const isCompleted =
    plan?.state === "completed" ||
    (plan &&
      activeTasks.length > 0 &&
      activeTasks.every((t) => t.status === "completed"));

  return (
    <div className="min-h-screen bg-bg-main px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Carryover prompt */}
        {!plan && carryoverChecked && carryoverTasks.length > 0 && (
          <CarryoverPrompt
            taskCount={carryoverTasks.length}
            onContinue={handleCarryoverContinue}
            onStartFresh={handleCarryoverFresh}
          />
        )}

        {/* No plan state */}
        {!plan && (
          <>
            <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-text-main md:text-3xl">
              Choose a class to get started.
            </h1>

            {classes.length === 0 ? (
              <div className="py-16 text-center text-text-muted">
                <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium text-text-main">
                  No classes enrolled yet. Add a class to get started.
                </p>
                <Link
                  href="/classes"
                  className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  Go to Classes
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => router.push(`/courses/${cls.id}/learning`)}
                    className="rounded-xl bg-bg-container p-6 text-left shadow-sm ring-1 ring-border-light transition-all hover:shadow-md hover:ring-primary"
                  >
                    <GraduationCap size={22} className="mb-3 text-primary" />
                    <h2 className="text-sm font-semibold text-text-main">
                      {cls.className || "Untitled class"}
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {cls.classCode}
                    </p>
                    {cls.term && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        {cls.term}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            <PlanEmptyState onStartSetup={() => setShowSetup(true)} />
          </>
        )}

        {/* Active plan */}
        {plan && !isCompleted && (
          <>
            <PlanHeader plan={plan} onClearPlan={() => setShowClearModal(true)} />
            <ViewSwitcher current={viewMode} onChange={setViewMode} />

            {viewMode === "list" && (
              <ListView
                tasks={tasks}
                onStart={handleStartTask}
                onSkip={handleSkipTask}
                onReschedule={(id) => setRescheduleTarget(id)}
                onDelete={handleDeleteTask}
                onPause={pauseSession}
                onComplete={handleCompleteTask}
                onAddTask={() => setShowAddTask(true)}
              />
            )}
            {viewMode === "board" && (
              <BoardView
                tasks={tasks}
                onStart={handleStartTask}
                onSkip={handleSkipTask}
                onReschedule={(id) => setRescheduleTarget(id)}
                onDelete={handleDeleteTask}
                onPause={pauseSession}
                onComplete={handleCompleteTask}
                onAddTask={() => setShowAddTask(true)}
              />
            )}
            {viewMode === "schedule" && (
              <ScheduleView
                tasks={tasks}
                calendarEvents={allEvents}
                onStart={handleStartTask}
                onSkip={handleSkipTask}
                onReschedule={(id) => setRescheduleTarget(id)}
                onComplete={handleCompleteTask}
                onPause={pauseSession}
              />
            )}
          </>
        )}

        {/* Completed */}
        {plan && isCompleted && (
          <PlanCompletedState
            completedCount={plan.completedCount}
            onAddMore={() => setShowAddTask(true)}
          />
        )}

        {/* Modals */}
        <SetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          onSubmit={handleSetupSubmit}
        />
        <ClearPlanModal
          open={showClearModal}
          onConfirm={handleClearPlan}
          onCancel={() => setShowClearModal(false)}
        />
        <AddTaskModal
          open={showAddTask}
          onClose={() => setShowAddTask(false)}
          onAdd={handleAddManualTask}
        />
        <SkipConfirmModal
          open={!!skipConfirm}
          taskTitle={skipConfirm?.title ?? ""}
          onConfirm={handleConfirmSkip}
          onCancel={() => setSkipConfirm(null)}
        />
        <RescheduleModal
          open={!!rescheduleTarget}
          onReschedule={handleReschedule}
          onCancel={() => setRescheduleTarget(null)}
        />
      </div>
    </div>
  );
}
