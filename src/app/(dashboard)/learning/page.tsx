"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { useCarryover } from "@/src/hooks/useCarryover";
import { useMasterySignals } from "@/src/hooks/useMasterySignals";
import { useStudyNotifications } from "@/src/hooks/useStudyNotifications";
import { buildMasterySignalId } from "@/src/library/studyPlan/masteryCalculation";
import { useCalendarEvents } from "@/src/hooks/useCalendarEvents";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { collection, getDocs, addDoc, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { generateTasks } from "@/src/library/studyPlan/recommendationEngine";
import { getVisibleStudyTasks } from "@/src/library/studyPlan/taskVisibility";
import { getEmptyRecommendationReason } from "@/src/library/studyPlan/recommendationDiagnostics";
import { hasUsablePlan } from "@/src/library/studyPlan/planState";
import { getStudyPlanDateRange } from "@/src/library/studyPlan/calendarRange";
import {
  appendPlanTaskIds,
  filterTopicsAlreadyInPlan,
} from "@/src/library/studyPlan/taskSuggestions";
import { getActivityUrl } from "@/src/library/studyPlan/sessionTimer";
import { studyTasksCollection } from "@/src/library/studyPlan/firestorePaths";
import { inferEventCategory } from "@/src/library/studyPlan/calendarKeywordMatch";
import type {
  SetupConfig,
  PlanViewMode,
  EligibleTopic,
  ActivityType,
} from "@/src/library/studyPlan/types";
import { Loader2 } from "lucide-react";
import WorkspaceHeader from "@/src/components/studyPlan/WorkspaceHeader";
import HeroBanner from "@/src/components/studyPlan/HeroBanner";
import StatCards from "@/src/components/studyPlan/StatCards";
import ClassGrid from "@/src/components/studyPlan/ClassGrid";
import TodayPlanSidebar from "@/src/components/studyPlan/TodayPlanSidebar";
import PlanSection from "@/src/components/studyPlan/PlanSection";
import FocusModeCard from "@/src/components/studyPlan/FocusModeCard";
import PlanCompletedState from "@/src/components/studyPlan/PlanCompletedState";
import CarryoverPrompt from "@/src/components/studyPlan/CarryoverPrompt";
import ClearPlanModal from "@/src/components/studyPlan/ClearPlanModal";
import AddTaskModal from "@/src/components/studyPlan/AddTaskModal";
import SkipConfirmModal from "@/src/components/studyPlan/SkipConfirmModal";
import RescheduleModal from "@/src/components/studyPlan/RescheduleModal";
import SetupModal from "@/src/components/studyPlan/SetupFlow/SetupModal";
import ListView from "@/src/components/studyPlan/Views/ListView";
import BoardView from "@/src/components/studyPlan/Views/BoardView";
import ScheduleView from "@/src/components/studyPlan/Views/ScheduleView";

const CLASSES_ANCHOR = "learning-classes";
const PLAN_ANCHOR = "learning-study-plan";

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
  const { signals: masterySignals } = useMasterySignals(user?.uid ?? null);
  const {
    notifications,
    unreadCount,
    markRead,
    dismissNotification,
    createNotification,
  } = useStudyNotifications(user?.uid ?? null);

  const [activeView, setActiveView] = useState<"explore" | "plan" | null>(null);
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [viewMode, setViewMode] = useState<PlanViewMode>(() => {
    if (typeof window === "undefined") return "list";
    try { return (localStorage.getItem("studyPlanView") as PlanViewMode) ?? "list"; } catch { return "list"; }
  });
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showSuggestTasks, setShowSuggestTasks] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState<{ taskId: string; title: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleNotificationsToggle = useCallback(() => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) {
      void Promise.all(
        notifications
          .filter((notification) => notification.status === "created")
          .map((notification) => markRead(notification.id))
      );
    }
  }, [markRead, notifications, notificationsOpen]);

  const todayRange = useMemo(() => getStudyPlanDateRange(), [today]);

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

  const loadRecommendationInputs = useCallback(async () => {
    if (!user) return { topics: [] as EligibleTopic[], exams: new Map<string, number>() };

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
            quizMastery: (() => {
              const signalId = buildMasterySignalId(cls.id, qs.data().topicName ?? qs.data().name ?? qs.id, "quiz_mastery");
              return masterySignals.get(signalId)?.value ?? null;
            })(),
            flashcardEngagement: (() => {
              const signalId = buildMasterySignalId(cls.id, qs.data().topicName ?? qs.data().name ?? qs.id, "flashcard_engagement");
              return masterySignals.get(signalId)?.value ?? null;
            })(),
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
            quizMastery: (() => {
              const signalId = buildMasterySignalId(cls.id, fc.data().topicName ?? fc.data().name ?? fc.id, "quiz_mastery");
              return masterySignals.get(signalId)?.value ?? null;
            })(),
            flashcardEngagement: (() => {
              const signalId = buildMasterySignalId(cls.id, fc.data().topicName ?? fc.data().name ?? fc.id, "flashcard_engagement");
              return masterySignals.get(signalId)?.value ?? null;
            })(),
            lastStudiedAt: null,
            skipCount: 0,
          });
        }
      }

      for (const cls of classes) {
        if (topics.some((topic) => topic.courseId === cls.id)) continue;
        topics.push({
          courseId: cls.id,
          courseName: cls.className,
          courseCode: cls.classCode,
          topicLabel: "Course exploration",
          targetId: null,
          activityType: "reading",
          quizMastery: null,
          flashcardEngagement: null,
          lastStudiedAt: null,
          skipCount: 0,
        });
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

      return { topics, exams };
    }, [user, classes, allEvents, masterySignals]);

  const handleSetupSubmit = useCallback(
    async (config: SetupConfig) => {
      if (!user) return;
      const { topics, exams } = await loadRecommendationInputs();

      const generated = generateTasks(config, topics, exams);
      if (generated.length === 0) {
        throw new Error(getEmptyRecommendationReason(config, topics, exams));
      }
      const taskIds = await createTasksFromGenerated(generated, today);
      await createPlan(config, taskIds);
      setShowSetup(false);
    },
    [user, loadRecommendationInputs, today, createPlan, createTasksFromGenerated]
  );

  const handleSuggestTasks = useCallback(
    async (config: SetupConfig) => {
      if (!user || !plan) return;
      const { topics, exams } = await loadRecommendationInputs();
      const activeExistingTasks = tasks.filter(
        (task) => task.status === "recommended" || task.status === "in_progress"
      );
      const availableTopics = filterTopicsAlreadyInPlan(
        topics,
        activeExistingTasks
      );
      const generated = generateTasks(config, availableTopics, exams);

      if (generated.length === 0) {
        throw new Error(
          getEmptyRecommendationReason(config, availableTopics, exams)
        );
      }

      const newTaskIds = await createTasksFromGenerated(generated, today);
      await updatePlanState({
        state: "active",
        taskIds: appendPlanTaskIds(plan.taskIds ?? [], newTaskIds),
        totalTasks: (plan.totalTasks ?? 0) + newTaskIds.length,
      });
      setShowSuggestTasks(false);
    },
    [
      user,
      plan,
      tasks,
      loadRecommendationInputs,
      today,
      createTasksFromGenerated,
      updatePlanState,
    ]
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
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) return;
      if (session && session.taskId === taskId) {
        await completeSession();
      }
      await updateTaskStatus(taskId, "completed");

      await createNotification({
        type: "task_completed",
        context: { taskTitle: task.title, courseName: task.courseName },
        actionUrl: "/learning",
        taskId,
        planDate: today,
        courseId: task.courseId,
      });

      const remainingTasks = tasks.filter(
        (candidate) =>
          candidate.id !== taskId &&
          (candidate.status === "recommended" || candidate.status === "in_progress")
      );
      if (remainingTasks.length === 0) {
        await createNotification({
          type: "plan_completed",
          context: {
            completedCount: tasks.filter((candidate) => candidate.status === "completed").length + 1,
          },
          actionUrl: "/learning",
          planDate: today,
        });
      }
    },
    [tasks, session, completeSession, updateTaskStatus, createNotification, today]
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
      targetId: string | null;
      estimatedMinutes: number;
    }) => {
      if (!user) return;
      const taskRef = await addDoc(collection(db, studyTasksCollection(user.uid)), {
        planDate: today,
        courseId: taskData.courseId,
        courseName: taskData.courseName,
        courseCode: taskData.courseCode,
        title: taskData.title,
        activityType: taskData.activityType,
        targetId: taskData.targetId,
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
      if (plan) {
        await updatePlanState({
          state: "active",
          taskIds: appendPlanTaskIds(plan.taskIds ?? [], [taskRef.id]),
          totalTasks: (plan.totalTasks ?? 0) + 1,
        });
      }
    },
    [user, today, plan, updatePlanState]
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

  const activeTasks = useMemo(
    () =>
      tasks.filter((t) => t.status !== "skipped" && t.status !== "rescheduled"),
    [tasks]
  );

  const visibleTasks = useMemo(() => getVisibleStudyTasks(tasks), [tasks]);

  const nextTask = useMemo(
    () =>
      activeTasks.find((t) => t.status === "in_progress") ??
      activeTasks.find((t) => t.status === "recommended") ??
      null,
    [activeTasks]
  );

  const remainingMinutes = useMemo(
    () =>
      activeTasks
        .filter((t) => t.status !== "completed")
        .reduce((sum, t) => sum + t.estimatedMinutes, 0),
    [activeTasks]
  );

  // Streak and cross-week mastery aggregation are not persisted yet, so the
  // workspace metrics summarize today's tasks until those sources land.
  const workspaceStats = useMemo(() => {
    const completed = activeTasks.filter((t) => t.status === "completed");
    const minutesStudied = tasks.reduce(
      (sum, t) => sum + (t.totalActiveMinutes ?? 0),
      0
    );
    const topics = new Set(activeTasks.map((t) => t.topicLabel));
    const masteredTopics = new Set(completed.map((t) => t.topicLabel));
    return {
      streak: completed.length > 0 ? 1 : 0,
      hoursThisWeek: Math.round((minutesStudied / 60) * 10) / 10,
      topicsMastered: masteredTopics.size,
      topicsTotal: topics.size,
      dailyProgress:
        activeTasks.length > 0
          ? Math.round((completed.length / activeTasks.length) * 100)
          : 0,
    };
  }, [activeTasks, tasks]);

  const handleExploreClasses = useCallback(() => {
    setActiveView("explore");
  }, []);

  const handleHeroStartPlan = useCallback(() => {
    if (hasUsablePlan(plan)) {
      setActiveView("plan");
    } else {
      setShowSetup(true);
    }
  }, [plan]);

  const handleStartNextTask = useCallback(() => {
    if (nextTask) handleStartTask(nextTask.id);
  }, [nextTask, handleStartTask]);

  if (authLoading || classesLoading || planLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-beige-canvas">
        <Loader2 size={32} className="animate-spin text-brown-label" />
        <span className="sr-only">Loading your learning workspace</span>
      </div>
    );
  }

  const planIsUsable = hasUsablePlan(plan);
  const isCompleted =
    planIsUsable &&
    (plan?.state === "completed" ||
      activeTasks.length > 0 &&
      activeTasks.every((t) => t.status === "completed"));

  const planView =
    viewMode === "board" ? (
      <BoardView
        tasks={visibleTasks}
        onStart={handleStartTask}
        onSkip={handleSkipTask}
        onReschedule={(id) => setRescheduleTarget(id)}
        onDelete={handleDeleteTask}
        onPause={pauseSession}
        onComplete={handleCompleteTask}
        onAddTask={() => setShowAddTask(true)}
      />
    ) : viewMode === "schedule" ? (
      <ScheduleView
        tasks={visibleTasks}
        calendarEvents={allEvents}
        onStart={handleStartTask}
        onSkip={handleSkipTask}
        onReschedule={(id) => setRescheduleTarget(id)}
        onComplete={handleCompleteTask}
        onPause={pauseSession}
      />
    ) : (
      <ListView
        tasks={visibleTasks}
        onStart={handleStartTask}
        onSkip={handleSkipTask}
        onReschedule={(id) => setRescheduleTarget(id)}
        onDelete={handleDeleteTask}
        onPause={pauseSession}
        onComplete={handleCompleteTask}
        onAddTask={() => setShowAddTask(true)}
      />
    );

  return (
    <div className="min-h-screen bg-beige-canvas px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <WorkspaceHeader
          userName={user?.displayName?.split(" ")[0] ?? "Student"}
          userInitial={(user?.displayName ?? user?.email ?? "S")
            .charAt(0)
            .toUpperCase()}
          onProfile={() => router.push("/profile")}
          notificationsOpen={notificationsOpen}
          notifications={notifications}
          unreadCount={unreadCount}
        onNotifications={handleNotificationsToggle}
          onMarkNotificationRead={markRead}
          onDismissNotification={dismissNotification}
        />

        {!plan && carryoverChecked && carryoverTasks.length > 0 && (
          <CarryoverPrompt
            taskCount={carryoverTasks.length}
            onContinue={handleCarryoverContinue}
            onStartFresh={handleCarryoverFresh}
          />
        )}

        <HeroBanner
          hasPlan={planIsUsable}
          onExploreClasses={handleExploreClasses}
          onStartPlan={handleHeroStartPlan}
        />

        {/* Explore view: stats + classes + today's plan sidebar */}
        {(activeView === "explore" || (!activeView && !planIsUsable)) && (
          <>
            <StatCards {...workspaceStats} />

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
              <div id={CLASSES_ANCHOR} className="min-w-0 scroll-mt-8">
                <ClassGrid
                  classes={classes}
                  onClassClick={(id) => router.push(`/courses/${id}/learning`)}
                />
              </div>
              <TodayPlanSidebar
                tasks={activeTasks}
                onViewFullPlan={() => {
                  if (planIsUsable) setActiveView("plan");
                  else setShowSetup(true);
                }}
              />
            </div>
          </>
        )}

        {/* Plan view: plan section with workspace */}
        {(activeView === "plan" || (!activeView && planIsUsable)) &&
          planIsUsable &&
          plan &&
          !isCompleted && (
            <div id={PLAN_ANCHOR} className="scroll-mt-8">
              <PlanSection
                plan={plan}
                remainingMinutes={remainingMinutes}
                canStartNext={!!nextTask}
                completedCount={activeTasks.filter((t) => t.status === "completed").length}
                totalActiveTasks={activeTasks.length}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onAddTask={() => setShowAddTask(true)}
                onSuggestTasks={() => setShowSuggestTasks(true)}
                onStartNextTask={handleStartNextTask}
                onClearPlan={() => setShowClearModal(true)}
                sidebar={
                  <FocusModeCard
                    recommendedMinutes={nextTask?.estimatedMinutes ?? 25}
                    onStartSession={handleStartNextTask}
                    disabled={!nextTask}
                  />
                }
              >
                {planView}
              </PlanSection>
            </div>
          )}

        {planIsUsable && plan && isCompleted && (
          <PlanCompletedState
            completedCount={activeTasks.filter((t) => t.status === "completed").length}
            onAddMore={() => setShowAddTask(true)}
            onSuggestTasks={() => setShowSuggestTasks(true)}
          />
        )}

        <SetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          onSubmit={handleSetupSubmit}
        />
        <SetupModal
          open={showSuggestTasks}
          onClose={() => setShowSuggestTasks(false)}
          onSubmit={handleSuggestTasks}
          title="Find your next study tasks"
          submitLabel="Get suggestions"
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
