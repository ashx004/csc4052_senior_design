"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { useCarryover } from "@/src/hooks/useCarryover";
import { useMasterySignals } from "@/src/hooks/useMasterySignals";
import { useStudyNotifications } from "@/src/hooks/useStudyNotifications";
import { useLearningSuggestions } from "@/src/hooks/useLearningSuggestions";
import { useDocumentMastery } from "@/src/hooks/useDocumentMastery";
import { useLearningProgress } from "@/src/hooks/useLearningProgress";
import { buildMasterySignalId } from "@/src/library/studyPlan/masteryCalculation";
import { useCalendarEvents } from "@/src/hooks/useCalendarEvents";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { collection, getDoc, getDocs, addDoc, serverTimestamp, doc, deleteDoc, limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  documentTargetForResource,
  findResourceForSourceDocKey,
  generateTasks,
  needsDocumentSelection,
} from "@/src/library/studyPlan/recommendationEngine";
import { getVisibleStudyTasks } from "@/src/library/studyPlan/taskVisibility";
import { getEmptyRecommendationReason } from "@/src/library/studyPlan/recommendationDiagnostics";
import { hasUsablePlan } from "@/src/library/studyPlan/planState";
import { scheduleUnscheduledTasks, weakSpotTasksDue } from "@/src/library/studyPlan/studySchedule";
import { attachGeneratedPractice, getGeneratedPracticeQuizId, writeTaskSchedules } from "@/src/library/studyPlan/studyScheduleRepository";
import {
  attachFirstDocument,
  DEFAULT_AUTO_PLAN_CONFIG,
  remainingMinutesAfterCarryover,
  shouldAutoPlan,
  startOfWeekDateString,
  weakCoursesNeedingTask,
} from "@/src/library/studyPlan/autoPlan";
import { loadNewestDocument, loadTasksSince } from "@/src/library/studyPlan/autoPlanData";
import { choosePlanStarter, type PlanStarterChoice } from "@/src/library/studyPlan/planStarter";
import { getStudyPlanDateRange } from "@/src/library/studyPlan/calendarRange";
import {
  appendPlanTaskIds,
  filterTopicsAlreadyInPlan,
} from "@/src/library/studyPlan/taskSuggestions";
import { resolveTaskActivityUrl } from "@/src/library/studyPlan/sessionTimer";
import {
  afterSuccessfulPlan,
  beginAddWithoutPlan,
  buildTaskFromSuggestion,
  cancelPendingAdd,
  completePendingAdd,
  deferOverageSuggestion,
  getPlanTimeOverage,
  suggestionAfterLater,
} from "@/src/library/studyPlan/addSuggestionToPlan";
import { isRecommendedSuggestion } from "@/src/library/studyPlan/quizSuggestionView";
import { nextAddIntent } from "@/src/library/studyPlan/addIntent";
import { missedQuestionTexts } from "@/src/library/studyPlan/missedQuestionText";
import { conceptLabelFromQuizName, generateTargetedPracticeQuiz } from "@/src/library/studyPlan/targetedPractice";
import {
  documentMasteryId,
  learningActivityEventsCollection,
  studyTasksCollection,
} from "@/src/library/studyPlan/firestorePaths";
import { inferEventCategory } from "@/src/library/studyPlan/calendarKeywordMatch";
import type {
  SetupConfig,
  PlanViewMode,
  EligibleTopic,
  ActivityType,
  ActivityTarget,
  GeneratedTask,
  MissedQuestionsSuggestion,
} from "@/src/library/studyPlan/types";
import { Loader2, X } from "lucide-react";
import WorkspaceHeader from "@/src/components/studyPlan/WorkspaceHeader";
import HeroBanner from "@/src/components/studyPlan/HeroBanner";
import StatCards from "@/src/components/studyPlan/StatCards";
import ClassGrid from "@/src/components/studyPlan/ClassGrid";
import TodayPlanSidebar from "@/src/components/studyPlan/TodayPlanSidebar";
import PlanSection from "@/src/components/studyPlan/PlanSection";
import FocusModeCard from "@/src/components/studyPlan/FocusModeCard";
import WeeklyChickenChart from "@/src/components/studyPlan/WeeklyChickenChart";
import PlanCompletedState from "@/src/components/studyPlan/PlanCompletedState";
import PlanStarter from "@/src/components/studyPlan/PlanStarter";
import ClearPlanModal from "@/src/components/studyPlan/ClearPlanModal";
import AddTaskModal from "@/src/components/studyPlan/AddTaskModal";
import SkipConfirmModal from "@/src/components/studyPlan/SkipConfirmModal";
import RescheduleModal from "@/src/components/studyPlan/RescheduleModal";
import SetupModal from "@/src/components/studyPlan/SetupFlow/SetupModal";
import ListView from "@/src/components/studyPlan/Views/ListView";
import BoardView from "@/src/components/studyPlan/Views/BoardView";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import learningSteps from "@/src/library/tutorials/steps/learning";
import ScheduleView from "@/src/components/studyPlan/Views/ScheduleView";
import LearningSuggestionCard from "@/src/components/studyPlan/LearningSuggestionCard";
import CourseMasterySummary from "@/src/components/studyPlan/CourseMasterySummary";
import PlanTimeOverageModal from "@/src/components/studyPlan/PlanTimeOverageModal";
import DocumentPickerModal from "@/src/components/studyPlan/DocumentPickerModal";
import ActionToast from "@/src/components/studyPlan/ActionToast";

const CLASSES_ANCHOR = "learning-classes";
const PLAN_ANCHOR = "learning-study-plan";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  reading: "Reading",
  ai_explanation: "AI explanation",
};

interface EnrolledClass {
  id: string;
  classCode: string;
  className: string;
  term: string;
}

type DocumentActivityTarget = Extract<ActivityTarget, { kind: "document" }>;

interface CourseDocumentOption {
  id: string;
  name: string;
  sourceDocKey: string;
}

function resourceLabel(name: unknown, id: string): string {
  if (typeof name === "string" && name.trim()) return name.trim();
  return id;
}

function completedTimestamp(value: unknown): Timestamp | null {
  if (
    value !== null &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return value as Timestamp;
  }
  return null;
}

async function latestStudyTimes(uid: string): Promise<Map<string, Timestamp>> {
  const snap = await getDocs(
    query(
      collection(db, learningActivityEventsCollection(uid)),
      orderBy("completedAt", "desc"),
      limit(100),
    ),
  );
  const latest = new Map<string, Timestamp>();
  for (const eventDoc of snap.docs) {
    const data = eventDoc.data();
    if (data.type !== "reading_finished" && data.type !== "flashcard_review_finished") continue;
    const courseId = data.courseId;
    const sourceDocKey = data.sourceDocKey;
    if (typeof courseId !== "string" || typeof sourceDocKey !== "string" || sourceDocKey.length === 0) {
      continue;
    }
    const completedAt = completedTimestamp(data.completedAt);
    if (!completedAt) continue;
    const id = documentMasteryId(courseId, sourceDocKey);
    const existing = latest.get(id);
    if (!existing || completedAt.toMillis() > existing.toMillis()) {
      latest.set(id, completedAt);
    }
  }
  return latest;
}

function studiedAtFor(
  latest: Map<string, Timestamp>,
  courseId: string,
  sourceDocKey: unknown,
): Timestamp | null {
  if (typeof sourceDocKey !== "string" || sourceDocKey.length === 0) return null;
  return latest.get(documentMasteryId(courseId, sourceDocKey)) ?? null;
}

function repeatMissCountFor(
  suggestions: MissedQuestionsSuggestion[],
  courseId: string,
  quizId: string,
): number {
  let repeats = 0;
  for (const suggestion of suggestions) {
    if (suggestion.courseId !== courseId || suggestion.quizId !== quizId) continue;
    if (
      suggestion.status === "dismissed" ||
      suggestion.status === "resolved" ||
      suggestion.status === "unavailable"
    ) {
      continue;
    }
    for (const questionId of suggestion.questionIds) {
      const failures = suggestion.questionFailureCounts?.[questionId] ?? 0;
      repeats += Math.max(0, failures - 1);
    }
  }
  return repeats;
}

function masteryForSet(
  bySourceDocument: Map<string, { value: number }>,
  courseId: string,
  sourceDocKey: unknown,
  topicLabel: string,
  signalValue: (label: string, kind: "quiz_mastery" | "flashcard_engagement") => number | null,
): { quizMastery: number | null; flashcardEngagement: number | null } {
  if (typeof sourceDocKey === "string" && sourceDocKey.length > 0) {
    const mastery = bySourceDocument.get(documentMasteryId(courseId, sourceDocKey));
    if (mastery && Number.isFinite(mastery.value)) {
      return { quizMastery: mastery.value / 100, flashcardEngagement: null };
    }
  }
  return {
    quizMastery: signalValue(topicLabel, "quiz_mastery"),
    flashcardEngagement: signalValue(topicLabel, "flashcard_engagement"),
  };
}


interface PracticeQuizDoc {
  name: string;
  questions: { id: string; question: string }[];
  sourceDocKey: string | null;
}

export default function LearningPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-beige-canvas" />}>
      <LearningPageContent />
    </Suspense>
  );
}

function LearningPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const {
    plan,
    planLoading,
    today,
    tasks,
    tasksLoading,
    createPlan,
    updatePlanState,
    createTasksFromGenerated,
    createTaskFromSuggestion,
    updateTaskStatus,
    carryOverTask,
    session,
    startSession,
    attachTaskToSession,
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
  const {
    suggestions,
    dismissSuggestion,
    markSuggestionActive,
  } = useLearningSuggestions(user?.uid ?? null);
  const {
    bySourceDocument,
    getCourseMastery,
    loading: documentMasteryLoading,
  } = useDocumentMastery(user?.uid ?? null);
  const { retryPendingAttempts } = useLearningProgress();

  const [activeView, setActiveView] = useState<"explore" | "plan" | null>(null);
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [documentCounts, setDocumentCounts] = useState<Map<string, number>>(new Map());
  const [documentCountsReady, setDocumentCountsReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [viewMode, setViewMode] = useState<PlanViewMode>(() => {
    if (typeof window === "undefined") return "list";
    try { return (localStorage.getItem("studyPlanView") as PlanViewMode) ?? "list"; } catch { return "list"; }
  });
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showSuggestTasks, setShowSuggestTasks] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState<{ taskId: string; title: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const handledAddSuggestionIdRef = useRef<string | null>(null);
  const [addToast, setAddToast] = useState<string | null>(null);
  const clearAddToast = useCallback(() => setAddToast(null), []);
  const savingSuggestionRef = useRef(false);
  const [timeOverage, setTimeOverage] = useState<{
    suggestion: MissedQuestionsSuggestion & { id: string };
    overageMinutes: number;
    baseTaskIds?: string[];
  } | null>(null);
  const [documentPicker, setDocumentPicker] = useState<{
    courseId: string;
    resources: CourseDocumentOption[];
  } | null>(null);
  const documentSelectionRef = useRef<((target: DocumentActivityTarget | null) => void) | null>(null);
  const pendingRetryUid = useRef<string | null>(null);
  const [autoPlanStatus, setAutoPlanStatus] = useState<
    "idle" | "running" | "done" | "empty" | "error"
  >("idle");
  const [planStarter, setPlanStarter] = useState<PlanStarterChoice | null>(null);
  const autoPlanAttemptedRef = useRef(false);
  const scheduledTaskIdsRef = useRef(new Set<string>());

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

  const todayRange = useMemo(() => getStudyPlanDateRange(new Date(`${today}T12:00:00`)), [today]);

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
    if (authLoading || !user) return;
    if (pendingRetryUid.current === user.uid) return;
    pendingRetryUid.current = user.uid;
    void retryPendingAttempts(20).catch((error) => {
      console.error(error);
    });
  }, [authLoading, user, retryPendingAttempts]);

  useEffect(() => {
    if (authLoading || !user || classesLoading) {
      setDocumentCountsReady(false);
      return;
    }
    if (classes.length === 0) {
      setDocumentCounts(new Map());
      setDocumentCountsReady(true);
      return;
    }
    let cancelled = false;
    setDocumentCountsReady(false);
    void Promise.all(
      classes.map(async (cls) => {
        const snap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "resources")
        );
        return [cls.id, snap.size] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setDocumentCounts(new Map(entries));
        setDocumentCountsReady(true);
      })
      .catch(() => {
        if (!cancelled) setDocumentCountsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, classes, classesLoading]);

  useEffect(() => {
    try { localStorage.setItem("studyPlanView", viewMode); } catch { /* Storage may be unavailable. */ }
  }, [viewMode]);

  const queryTaskId = searchParams.get("taskId");
  const querySuggestionId = searchParams.get("suggestionId");

  useEffect(() => {
    if (!queryTaskId) return;
    setHighlightedTaskId(queryTaskId);
    if (hasUsablePlan(plan)) setActiveView("plan");
  }, [queryTaskId, plan]);

  useEffect(() => {
    if (!querySuggestionId) return;
    setHighlightedSuggestionId(querySuggestionId);
    document
      .getElementById(`learning-suggestion-${querySuggestionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [querySuggestionId, suggestions]);

  useEffect(() => {
    if (!highlightedTaskId) return;
    document
      .getElementById(`study-task-${highlightedTaskId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedTaskId, tasks, viewMode, activeView]);

  const loadRecommendationInputs = useCallback(async () => {
    const resourcesByCourse = new Map<string, CourseDocumentOption[]>();
    if (!user) {
      return { topics: [] as EligibleTopic[], exams: new Map<string, number>(), resourcesByCourse };
    }

      const topics: EligibleTopic[] = [];
      const lastStudied = await latestStudyTimes(user.uid);
      for (const cls of classes) {
        const resourceSnap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "resources")
        );
        const courseResources = resourceSnap.docs.map((resourceDoc) => {
          const data = resourceDoc.data();
          return {
            id: resourceDoc.id,
            name: data.name,
            url: data.url,
            sourceDocKey: data.sourceDocKey,
            storageKey: data.storageKey,
          };
        });
        const pickerResources = courseResources.map((resource) => {
          const target = documentTargetForResource(resource);
          return {
            id: resource.id,
            name: resourceLabel(resource.name, resource.id),
            sourceDocKey: target.sourceDocKey,
          };
        });
        resourcesByCourse.set(cls.id, pickerResources);

        const masteryValue = (label: string, kind: "quiz_mastery" | "flashcard_engagement") => {
          const signalId = buildMasterySignalId(cls.id, label, kind);
          return masterySignals.get(signalId)?.value ?? null;
        };

        const quizSnap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "quizSets")
        );
        for (const qs of quizSnap.docs) {
          const data = qs.data();
          const topicLabel = data.topicName ?? data.name ?? qs.id;
          const matched = findResourceForSourceDocKey(data.sourceDocKey, courseResources);
          const activityTarget = matched ? documentTargetForResource(matched) : undefined;
          const repeats = repeatMissCountFor(suggestions, cls.id, qs.id);
          const mastery = masteryForSet(
            bySourceDocument,
            cls.id,
            data.sourceDocKey,
            topicLabel,
            masteryValue,
          );
          topics.push({
            courseId: cls.id,
            courseName: cls.className,
            courseCode: cls.classCode,
            topicLabel,
            targetId: qs.id,
            activityType: "quiz",
            ...(activityTarget ? { activityTarget } : {}),
            quizMastery: mastery.quizMastery,
            flashcardEngagement: mastery.flashcardEngagement,
            lastStudiedAt: studiedAtFor(lastStudied, cls.id, data.sourceDocKey),
            skipCount: 0,
            ...(repeats > 0 ? { repeatMissCount: repeats } : {}),
          });
        }
        const fcSnap = await getDocs(
          collection(db, "users", user.uid, "enrollment", cls.id, "flashcardSets")
        );
        for (const fc of fcSnap.docs) {
          const data = fc.data();
          const topicLabel = data.topicName ?? data.name ?? fc.id;
          const matched = findResourceForSourceDocKey(data.sourceDocKey, courseResources);
          const activityTarget = matched ? documentTargetForResource(matched) : undefined;
          const mastery = masteryForSet(
            bySourceDocument,
            cls.id,
            data.sourceDocKey,
            topicLabel,
            masteryValue,
          );
          topics.push({
            courseId: cls.id,
            courseName: cls.className,
            courseCode: cls.classCode,
            topicLabel,
            targetId: fc.id,
            activityType: "flashcards",
            ...(activityTarget ? { activityTarget } : {}),
            quizMastery: mastery.quizMastery,
            flashcardEngagement: mastery.flashcardEngagement,
            lastStudiedAt: studiedAtFor(lastStudied, cls.id, data.sourceDocKey),
            skipCount: 0,
          });
        }
      }

      for (const cls of classes) {
        if (topics.some((topic) => topic.courseId === cls.id)) continue;
        const resources = resourcesByCourse.get(cls.id) ?? [];
        if (resources.length > 0) {
          for (const resource of resources) {
            topics.push({
              courseId: cls.id,
              courseName: cls.className,
              courseCode: cls.classCode,
              topicLabel: resource.name,
              targetId: null,
              activityType: "reading",
              activityTarget: {
                kind: "document",
                resourceId: resource.id,
                sourceDocKey: resource.sourceDocKey,
              },
              quizMastery: null,
              flashcardEngagement: null,
              lastStudiedAt: studiedAtFor(lastStudied, cls.id, resource.sourceDocKey),
              skipCount: 0,
            });
          }
          continue;
        }
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

      return { topics, exams, resourcesByCourse };
    }, [user, classes, allEvents, masterySignals, bySourceDocument, suggestions]);

  const requestDocumentSelection = useCallback(
    (courseId: string, resources: CourseDocumentOption[]) =>
      new Promise<DocumentActivityTarget | null>((resolve) => {
        documentSelectionRef.current = resolve;
        setDocumentPicker({ courseId, resources });
      }),
    []
  );

  const finishDocumentSelection = useCallback((target: DocumentActivityTarget | null) => {
    setDocumentPicker(null);
    const resolve = documentSelectionRef.current;
    documentSelectionRef.current = null;
    resolve?.(target);
  }, []);

  const attachSelectedDocuments = useCallback(
    async (
      generated: GeneratedTask[],
      resourcesByCourse: Map<string, CourseDocumentOption[]>
    ) => {
      const ready: GeneratedTask[] = [];
      for (const task of generated) {
        if (!needsDocumentSelection(task)) {
          ready.push(task);
          continue;
        }
        const resources = resourcesByCourse.get(task.courseId) ?? [];
        if (resources.length === 0) continue;
        const selected = await requestDocumentSelection(task.courseId, resources);
        if (!selected) continue;
        ready.push({
          ...task,
          targetId: selected.resourceId,
          activityTarget: selected,
        });
      }
      return ready;
    },
    [requestDocumentSelection]
  );

  const courseInfoFor = useCallback(
    (courseId: string) => {
      const enrolled = classes.find((item) => item.id === courseId);
      return {
        name: enrolled?.className || "Course",
        code: enrolled?.classCode || "Course",
      };
    },
    [classes],
  );

  const revealTask = useCallback(
    (taskId: string) => {
      setHighlightedTaskId(taskId);
      if (hasUsablePlan(plan)) setActiveView("plan");
    },
    [plan],
  );

  const saveSuggestionOnPlan = useCallback(
    async (suggestion: MissedQuestionsSuggestion & { id: string }) => {
      if (!user || !plan || savingSuggestionRef.current) return null;
      savingSuggestionRef.current = true;
      setSavingSuggestion(true);
      try {
        const taskId = await createTaskFromSuggestion(
          suggestion,
          today,
          courseInfoFor(suggestion.courseId),
        );
        if (!taskId) return null;
        if (!(plan.taskIds ?? []).includes(taskId)) {
          await updatePlanState({
            state: "active",
            taskIds: appendPlanTaskIds(plan.taskIds ?? [], [taskId]),
            totalTasks: (plan.totalTasks ?? plan.taskIds?.length ?? 0) + 1,
          });
        }
        revealTask(taskId);
        setAddToast("Added to your plan");
        setPendingSuggestionId((current) =>
          current === suggestion.id ? completePendingAdd(current, true) : current,
        );
        return taskId;
      } finally {
        savingSuggestionRef.current = false;
        setSavingSuggestion(false);
      }
    },
    [user, plan, today, courseInfoFor, createTaskFromSuggestion, updatePlanState, revealTask],
  );

  const attachSuggestionToPlan = useCallback(
    async (
      suggestion: MissedQuestionsSuggestion & { id: string },
      baseTaskIds: string[],
    ) => {
      if (!user || savingSuggestionRef.current) return null;
      savingSuggestionRef.current = true;
      setSavingSuggestion(true);
      try {
        const taskId = await createTaskFromSuggestion(
          suggestion,
          today,
          courseInfoFor(suggestion.courseId),
        );
        if (!taskId) return null;
        if (!baseTaskIds.includes(taskId)) {
          await updatePlanState({
            state: "active",
            taskIds: appendPlanTaskIds(baseTaskIds, [taskId]),
            totalTasks: baseTaskIds.length + 1,
          });
        }
        setPendingSuggestionId((current) =>
          current === suggestion.id ? completePendingAdd(current, true) : current,
        );
        setHighlightedTaskId(taskId);
        setActiveView("plan");
        setAddToast("Added to your plan");
        return taskId;
      } finally {
        savingSuggestionRef.current = false;
        setSavingSuggestion(false);
      }
    },
    [user, today, courseInfoFor, createTaskFromSuggestion, updatePlanState],
  );

  const handleAddSuggestion = useCallback(
    (suggestion: MissedQuestionsSuggestion & { id: string }) => {
      if (savingSuggestion || savingSuggestionRef.current) return;
      if (!plan || !hasUsablePlan(plan)) {
        setPendingSuggestionId((current) => beginAddWithoutPlan(current, suggestion.id));
        setShowSetup(true);
        return;
      }
      const draft = buildTaskFromSuggestion(
        suggestion,
        courseInfoFor(suggestion.courseId),
        today,
      );
      const overage = getPlanTimeOverage(
        plan.setupConfig.availableMinutes,
        tasks,
        draft.estimatedMinutes,
      );
      if (overage > 0) {
        setTimeOverage({ suggestion, overageMinutes: overage });
        return;
      }
      void saveSuggestionOnPlan(suggestion).catch(() => {
        // The suggestion stays active so the student can try again.
      });
    },
    [savingSuggestion, plan, courseInfoFor, today, tasks, saveSuggestionOnPlan],
  );

  useEffect(() => {
    if (!querySuggestionId || planLoading || classesLoading || tasksLoading) return;
    // Wait for auto-plan to settle so it cannot overwrite a manually created plan.
    if (autoPlanStatus === "running") return;
    if (!hasUsablePlan(plan) && !autoPlanAttemptedRef.current) return;
    const intent = nextAddIntent(querySuggestionId, handledAddSuggestionIdRef.current);
    if (!intent.shouldAdd) return;
    const suggestion = suggestions.find((item) => item.id === querySuggestionId);
    if (!suggestion) return; // suggestions not loaded yet; effect re-runs when they are
    handledAddSuggestionIdRef.current = intent.handledSuggestionId;
    handleAddSuggestion(suggestion);
  }, [
    querySuggestionId,
    planLoading,
    classesLoading,
    tasksLoading,
    autoPlanStatus,
    plan,
    suggestions,
    handleAddSuggestion,
  ]);

  const handleSetupSubmit = useCallback(
    async (config: SetupConfig) => {
      if (!user) return;
      const { topics, exams, resourcesByCourse } = await loadRecommendationInputs();

      const generated = generateTasks(config, topics, exams);
      const tasksToSave = await attachSelectedDocuments(generated, resourcesByCourse);
      if (tasksToSave.length === 0) {
        throw new Error(getEmptyRecommendationReason(config, topics, exams));
      }
      const taskIds = await createTasksFromGenerated(tasksToSave, today);
      try {
        await createPlan(config, taskIds);
      } catch (error) {
        setPendingSuggestionId((current) => completePendingAdd(current, false));
        throw error;
      }
      setShowSetup(false);
      setActiveView("plan");

      if (!pendingSuggestionId) return;
      const suggestion = suggestions.find((item) => item.id === pendingSuggestionId);
      if (!suggestion) return;

      const draft = buildTaskFromSuggestion(
        suggestion,
        courseInfoFor(suggestion.courseId),
        today,
      );
      const overage = getPlanTimeOverage(
        config.availableMinutes,
        tasksToSave.map((task) => ({
          estimatedMinutes: task.estimatedMinutes,
          status: "recommended" as const,
        })),
        draft.estimatedMinutes,
      );
      const followUp = afterSuccessfulPlan(pendingSuggestionId, overage);
      setPendingSuggestionId(followUp.pendingSuggestionId);
      if (followUp.showOverage) {
        setTimeOverage({
          suggestion,
          overageMinutes: overage,
          baseTaskIds: taskIds,
        });
        return;
      }
      if (!followUp.createTask) return;
      const taskId = await attachSuggestionToPlan(suggestion, taskIds);
      if (!taskId) {
        setPendingSuggestionId((current) => completePendingAdd(current, false));
      }
    },
    [
      user,
      loadRecommendationInputs,
      attachSelectedDocuments,
      today,
      createPlan,
      createTasksFromGenerated,
      pendingSuggestionId,
      suggestions,
      courseInfoFor,
      attachSuggestionToPlan,
    ]
  );

  const handleSuggestTasks = useCallback(
    async (config: SetupConfig) => {
      if (!user || !plan) return;
      const { topics, exams, resourcesByCourse } = await loadRecommendationInputs();
      const activeExistingTasks = tasks.filter(
        (task) => task.status === "recommended" || task.status === "in_progress"
      );
      const availableTopics = filterTopicsAlreadyInPlan(
        topics,
        activeExistingTasks
      );
      const generated = generateTasks(config, availableTopics, exams);
      const tasksToSave = await attachSelectedDocuments(generated, resourcesByCourse);

      if (tasksToSave.length === 0) {
        throw new Error(
          getEmptyRecommendationReason(config, availableTopics, exams)
        );
      }

      const newTaskIds = await createTasksFromGenerated(tasksToSave, today);
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
      attachSelectedDocuments,
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

      const url = resolveTaskActivityUrl(task, taskId);

      if (session && session.taskId == null) {
        await updateTaskStatus(taskId, "in_progress");
        await attachTaskToSession(taskId, {
          courseId: task.courseId,
          activityType: task.activityType,
          targetId: task.targetId,
          activityUrl: url,
        });
        router.push(url);
        return;
      }

      if (session?.taskId) {
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
        task.targetId,
        "countup",
        task.estimatedMinutes * 60
      );

      router.push(url);
    },
    [user, tasks, session, pauseSession, updateTaskStatus, startSession, attachTaskToSession, router]
  );

  // "Continue" on an already in-progress task: just reopen its activity,
  // never restart the session.
  const handleOpenTaskActivity = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      router.push(resolveTaskActivityUrl(task, taskId));
    },
    [tasks, router]
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

  const runAutoPlan = useCallback(async () => {
    if (!user) return;
    setAutoPlanStatus("running");
    try {
      for (const t of carryoverTasks) {
        await carryOverTask(t.id, today);
      }
      const carried = carryoverTasks;
      const carriedIds = new Set(carried.map((t) => t.id));
      const existing = tasks.filter(
        (t) =>
          (t.status === "recommended" || t.status === "in_progress") &&
          !carriedIds.has(t.id)
      );
      const kept = [...carried, ...existing];
      const { topics, exams, resourcesByCourse } = await loadRecommendationInputs();
      const weekTasks = await loadTasksSince(user.uid, startOfWeekDateString(new Date()));
      const guaranteed = weakCoursesNeedingTask(topics, [...weekTasks, ...kept]);
      const budget = remainingMinutesAfterCarryover(
        DEFAULT_AUTO_PLAN_CONFIG.availableMinutes,
        kept
      );
      const generated =
        budget > 0
          ? generateTasks(
              DEFAULT_AUTO_PLAN_CONFIG,
              filterTopicsAlreadyInPlan(topics, kept),
              exams,
              { minutesBudget: budget, guaranteedCourseIds: guaranteed }
            )
          : [];
      const ready = attachFirstDocument(generated, resourcesByCourse);
      const newIds = ready.length > 0 ? await createTasksFromGenerated(ready, today) : [];
      const taskIds = [...kept.map((t) => t.id), ...newIds];
      if (taskIds.length === 0) {
        const classIds = classes.map((c) => c.id);
        const newest = await loadNewestDocument(user.uid, classIds);
        setPlanStarter(choosePlanStarter({ classIds, newestDocument: newest }));
        setAutoPlanStatus("empty");
        return;
      }
      await createPlan(DEFAULT_AUTO_PLAN_CONFIG, taskIds);
      setActiveView("plan");
      setAutoPlanStatus("done");
    } catch (error) {
      console.error("Auto plan failed:", error);
      setAutoPlanStatus("error");
    }
  }, [
    user,
    carryoverTasks,
    carryOverTask,
    today,
    tasks,
    loadRecommendationInputs,
    createTasksFromGenerated,
    createPlan,
    classes,
  ]);

  useEffect(() => {
    if (
      shouldAutoPlan({
        hasUser: !!user,
        dataReady:
          !authLoading &&
          !classesLoading &&
          !planLoading &&
          !tasksLoading &&
          carryoverChecked &&
          !documentMasteryLoading,
        hasUsablePlan: hasUsablePlan(plan),
        alreadyAttempted: autoPlanAttemptedRef.current,
      })
    ) {
      autoPlanAttemptedRef.current = true;
      void runAutoPlan();
    }
  }, [
    user,
    authLoading,
    classesLoading,
    planLoading,
    tasksLoading,
    carryoverChecked,
    documentMasteryLoading,
    plan,
    runAutoPlan,
  ]);

  useEffect(() => {
    if (!user || tasksLoading || !plan || !hasUsablePlan(plan)) return;
    const ordered = (plan.taskIds ?? [])
      .map((id) => tasks.find((task) => task.id === id))
      .filter((task): task is (typeof tasks)[number] => Boolean(task));
    const updates = scheduleUnscheduledTasks(ordered, new Date()).filter(
      (u) => !scheduledTaskIdsRef.current.has(u.taskId)
    );
    if (updates.length === 0) return;
    updates.forEach((u) => scheduledTaskIdsRef.current.add(u.taskId));
    void writeTaskSchedules(user.uid, updates).catch((err) => {
      console.error("Couldn't schedule study blocks:", err);
      updates.forEach((u) => scheduledTaskIdsRef.current.delete(u.taskId));
    });
  }, [user, tasksLoading, plan, tasks]);

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

  const pickableTasks = useMemo(
    () =>
      activeTasks.filter(
        (task) => task.status === "recommended" || task.status === "in_progress"
      ),
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

  const recommendedSuggestions = useMemo(
    () =>
      suggestions
        .filter(isRecommendedSuggestion)
        .sort((a, b) => b.priority - a.priority),
    [suggestions],
  );

  const [practiceQuizDocs, setPracticeQuizDocs] = useState<Record<string, PracticeQuizDoc>>({});
  const [practicingSuggestionId, setPracticingSuggestionId] = useState<string | null>(null);
  const [practiceErrors, setPracticeErrors] = useState<Record<string, string>>({});

  const loadPracticeQuizDoc = useCallback(
    async (uid: string, courseId: string, quizId: string): Promise<PracticeQuizDoc | null> => {
      const snap = await getDoc(doc(db, "users", uid, "enrollment", courseId, "quizSets", quizId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        name: typeof data.name === "string" ? data.name : "",
        questions: Array.isArray(data.questions)
          ? (data.questions as { id: string; question: string }[])
          : [],
        sourceDocKey: typeof data.sourceDocKey === "string" ? data.sourceDocKey : null,
      };
    },
    [],
  );

  const requestedQuizDocsRef = useRef<Set<string>>(new Set());
  const practicingRef = useRef(false);

  const quizDocUidRef = useRef<string | null>(null);

  // Reset the request cache only when the user changes (or on unmount).
  useEffect(() => {
    quizDocUidRef.current = user?.uid ?? null;
    requestedQuizDocsRef.current = new Set();
    return () => {
      quizDocUidRef.current = null;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    recommendedSuggestions.forEach((suggestion) => {
      if (requestedQuizDocsRef.current.has(suggestion.id)) return;
      const requested = requestedQuizDocsRef.current;
      requested.add(suggestion.id);
      loadPracticeQuizDoc(uid, suggestion.courseId, suggestion.quizId)
        .then((quizDoc) => {
          if (quizDocUidRef.current !== uid) return;
          if (!quizDoc) {
            requested.delete(suggestion.id);
            return;
          }
          setPracticeQuizDocs((prev) => ({ ...prev, [suggestion.id]: quizDoc }));
        })
        .catch(() => {
          requested.delete(suggestion.id);
        });
    });
  }, [user, recommendedSuggestions, loadPracticeQuizDoc]);

  const conceptLabelFor = useCallback(
    (suggestion: { id: string; courseId: string }, quizDoc?: PracticeQuizDoc | null) => {
      const d = quizDoc ?? practiceQuizDocs[suggestion.id] ?? null;
      return (d ? conceptLabelFromQuizName(d.name) : "") || courseInfoFor(suggestion.courseId).name;
    },
    [practiceQuizDocs, courseInfoFor],
  );

  const handlePracticeWeakSpot = useCallback(
    async (suggestion: (typeof recommendedSuggestions)[number]) => {
      if (!user || practicingRef.current) return;
      practicingRef.current = true;
      setPracticingSuggestionId(suggestion.id);
      setPracticeErrors((prev) => {
        const rest = { ...prev };
        delete rest[suggestion.id];
        return rest;
      });
      try {
        let quizDoc: PracticeQuizDoc | null = practiceQuizDocs[suggestion.id] ?? null;
        if (!quizDoc) {
          try {
            quizDoc = await loadPracticeQuizDoc(user.uid, suggestion.courseId, suggestion.quizId);
          } catch {
            quizDoc = null;
          }
        }
        const sourceDocKey = suggestion.sourceDocKey ?? quizDoc?.sourceDocKey ?? null;
        if (!sourceDocKey) {
          setPracticeErrors((prev) => ({
            ...prev,
            [suggestion.id]: "Couldn't find the source document for this quiz.",
          }));
          practicingRef.current = false;
          setPracticingSuggestionId(null);
          return;
        }
        const conceptLabel = conceptLabelFor(suggestion, quizDoc);
        const newId = await generateTargetedPracticeQuiz({
          uid: user.uid,
          courseId: suggestion.courseId,
          sourceDocKey,
          conceptLabel,
          avoidQuestions: quizDoc ? missedQuestionTexts(suggestion.questionIds, quizDoc.questions) : [],
        });
        router.push(`/courses/${suggestion.courseId}/quizzes/${newId}?mode=take`);
      } catch (err) {
        setPracticeErrors((prev) => ({
          ...prev,
          [suggestion.id]: err instanceof Error ? err.message : "Failed to generate practice questions.",
        }));
        practicingRef.current = false;
        setPracticingSuggestionId(null);
      }
    },
    [user, practiceQuizDocs, loadPracticeQuizDoc, conceptLabelFor, router],
  );

  // A 60-second clock so weak-spot tasks are noticed when their block starts.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // When a weak-spot task's calendar block starts, generate fresh targeted
  // practice and point the task at it. One task per run.
  const generatingPracticeRef = useRef<Set<string>>(new Set());
  const generatedQuizIdsRef = useRef<Map<string, string>>(new Map());
  const practiceAttemptsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!user || tasksLoading) return;
    const dueIds = weakSpotTasksDue(tasks, new Date(nowTick));
    // First due id not yet handled whose task and suggestion both resolve;
    // unresolvable ones are skipped (re-evaluated when suggestions load).
    let task: (typeof tasks)[number] | undefined;
    let suggestion: (typeof suggestions)[number] | undefined;
    for (const id of dueIds) {
      if (generatingPracticeRef.current.has(id)) continue;
      const t = tasks.find((item) => item.id === id);
      const sg = t ? suggestions.find((item) => item.id === t.sourceSuggestionId) : undefined;
      if (t && sg) {
        task = t;
        suggestion = sg;
        break;
      }
    }
    if (!task || !suggestion) return;
    const taskId = task.id;
    generatingPracticeRef.current.add(taskId);
    practiceAttemptsRef.current.set(taskId, (practiceAttemptsRef.current.get(taskId) ?? 0) + 1);
    const uid = user.uid;
    void (async () => {
      try {
        let newId = generatedQuizIdsRef.current.get(task.id) ?? null;
        let sourceDocKey: string | null = suggestion.sourceDocKey ?? null;
        if (!newId) {
          if (await getGeneratedPracticeQuizId(uid, task.id)) return; // already attached; snapshot catches up
          let quizDoc: PracticeQuizDoc | null = null;
          try {
            quizDoc = await loadPracticeQuizDoc(uid, suggestion.courseId, suggestion.quizId);
          } catch {
            quizDoc = null;
          }
          sourceDocKey = sourceDocKey ?? quizDoc?.sourceDocKey ?? null;
          if (!sourceDocKey) {
            console.error("Couldn't prepare weak-spot practice: no source document for", task.id);
            return;
          }
          const conceptLabel =
            conceptLabelFromQuizName(quizDoc?.name ?? "") || courseInfoFor(suggestion.courseId).name;
          const avoidQuestions = quizDoc ? missedQuestionTexts(suggestion.questionIds, quizDoc.questions) : [];
          newId = await generateTargetedPracticeQuiz({
            uid,
            courseId: suggestion.courseId,
            sourceDocKey,
            conceptLabel,
            avoidQuestions,
          });
          generatedQuizIdsRef.current.set(task.id, newId);
        }
        await attachGeneratedPractice(uid, task.id, newId, sourceDocKey);
      } catch (error) {
        console.error("Couldn't prepare weak-spot practice:", error);
        if ((practiceAttemptsRef.current.get(taskId) ?? 0) < 3) {
          generatingPracticeRef.current.delete(taskId);
        } else {
          console.error(`Giving up on weak-spot practice for task ${taskId} after 3 tries`);
        }
      }
    })();
  }, [user, tasksLoading, tasks, suggestions, nowTick, loadPracticeQuizDoc, courseInfoFor]);

  const highlightedTask = useMemo(
    () => tasks.find((task) => task.id === highlightedTaskId) ?? null,
    [tasks, highlightedTaskId],
  );

  const handleExploreClasses = useCallback(() => {
    setActiveView("explore");
  }, []);

  const handleHeroStartPlan = useCallback(() => {
    if (autoPlanStatus === "running") return;
    if (hasUsablePlan(plan)) {
      setActiveView("plan");
    } else {
      setShowSetup(true);
    }
  }, [plan, autoPlanStatus]);

  const handleStartNextTask = useCallback(() => {
    if (nextTask) handleStartTask(nextTask.id);
  }, [nextTask, handleStartTask]);

  useEffect(() => {
    if (!showTaskPicker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTaskPicker(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showTaskPicker]);

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
        highlightedTaskId={highlightedTaskId}
        onStart={handleStartTask}
        onContinue={handleOpenTaskActivity}
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
        highlightedTaskId={highlightedTaskId}
        calendarEvents={allEvents}
        today={today}
        onStart={handleStartTask}
        onContinue={handleOpenTaskActivity}
        onShowList={() => setViewMode("list")}
      />
    ) : (
      <ListView
        tasks={visibleTasks}
        highlightedTaskId={highlightedTaskId}
        onStart={handleStartTask}
        onContinue={handleOpenTaskActivity}
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
      <PageTutorial id="learning" steps={learningSteps} />
      <div className="mx-auto max-w-6xl space-y-8">
        <div data-tutorial="learning-header">
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
        </div>

        <div data-tutorial="learning-hero">
          <HeroBanner
            hasPlan={planIsUsable}
            onExploreClasses={handleExploreClasses}
            onStartPlan={handleHeroStartPlan}
          />
        </div>

        {autoPlanStatus === "running" && (
          <div className="flex items-center gap-2" role="status">
            <Loader2 size={16} className="animate-spin text-brown-label" />
            <p className="text-sm text-text-muted">Building today&apos;s plan…</p>
          </div>
        )}

        {autoPlanStatus === "error" && !planIsUsable && (
          <p className="text-sm text-text-muted">
            We couldn&apos;t build today&apos;s plan automatically. Use Start study plan to make one.
          </p>
        )}

        {autoPlanStatus === "empty" && planStarter && !planIsUsable && (
          <PlanStarter choice={planStarter} onGo={(href) => router.push(href)} />
        )}

        {recommendedSuggestions.length > 0 && (
          <section aria-labelledby="recommended-for-you">
            <h2 id="recommended-for-you" className="text-lg font-semibold text-navy">
              Recommended for you
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {recommendedSuggestions.map((suggestion) => {
                const course = courseInfoFor(suggestion.courseId);
                return (
                  <LearningSuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    courseCode={course.code}
                    courseName={course.name}
                    conceptLabel={conceptLabelFor(suggestion)}
                    highlighted={suggestion.id === highlightedSuggestionId}
                    busy={savingSuggestion}
                    onAdd={() => handleAddSuggestion(suggestion)}
                    onDismiss={() => {
                      void dismissSuggestion(suggestion.id);
                    }}
                    onPractice={() => {
                      void handlePracticeWeakSpot(suggestion);
                    }}
                    practicing={practicingSuggestionId === suggestion.id}
                    practiceDisabled={practicingSuggestionId !== null}
                    practiceError={practiceErrors[suggestion.id] ?? null}
                  />
                );
              })}
            </div>
          </section>
        )}

        {user && !documentMasteryLoading && documentCountsReady && classes.length > 0 && (
          <section aria-labelledby="course-mastery-heading" className="space-y-4">
            <h2 id="course-mastery-heading" className="text-lg font-semibold text-navy">
              Course mastery
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {classes.map((cls) => (
                <CourseMasterySummary
                  key={cls.id}
                  courseName={cls.className || cls.classCode}
                  summary={getCourseMastery(cls.id, documentCounts.get(cls.id) ?? 0)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Explore view: stats + classes + today's plan sidebar */}
        {(activeView === "explore" || (!activeView && !planIsUsable)) && (
          <>
            <StatCards {...workspaceStats} />

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
              <div id={CLASSES_ANCHOR} data-tutorial="learning-classes" className="min-w-0 scroll-mt-8">
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
                    onStartNextTask={handleStartNextTask}
                    onPickTask={() => setShowTaskPicker(true)}
                    hasNextTask={!!nextTask}
                    disabled={!!session}
                  />
                }
              >
                {highlightedTask &&
                  (highlightedTask.status === "recommended" ||
                    highlightedTask.status === "in_progress") && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-navy/15">
                      <p className="text-sm text-navy">
                        <span className="font-semibold">{highlightedTask.title}</span> is in today’s plan.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleStartTask(highlightedTask.id)}
                        className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        {highlightedTask.status === "in_progress" ? "Continue" : "Start"}
                      </button>
                    </div>
                  )}
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

        <WeeklyChickenChart />

        <SetupModal
          open={showSetup}
          onClose={() => {
            setPendingSuggestionId((current) => cancelPendingAdd(current));
            setShowSetup(false);
          }}
          onSubmit={handleSetupSubmit}
        />
        <PlanTimeOverageModal
          open={timeOverage != null}
          overageMinutes={timeOverage?.overageMinutes ?? 0}
          busy={savingSuggestion}
          onAddAnyway={() => {
            if (!timeOverage || savingSuggestion) return;
            const save = timeOverage.baseTaskIds
              ? attachSuggestionToPlan(timeOverage.suggestion, timeOverage.baseTaskIds)
              : saveSuggestionOnPlan(timeOverage.suggestion);
            void save
              .then((taskId) => {
                if (taskId) setTimeOverage(null);
              })
              .catch(() => {
                // Keep the warning open so Add anyway can be tried again.
              });
          }}
          onLater={() => {
            if (!timeOverage || savingSuggestion) return;
            const suggestion = timeOverage.suggestion;
            const kept = suggestionAfterLater(suggestion);
            const recordLater = () => {
              setPendingSuggestionId((current) =>
                deferOverageSuggestion(current, suggestion.id, kept).pendingSuggestionId,
              );
              setTimeOverage(null);
            };
            if (kept.status === "added") {
              recordLater();
              return;
            }
            void markSuggestionActive(suggestion.id)
              .then(recordLater)
              .catch(() => {
                // Deferral was not recorded, so keep the pending suggestion.
              });
          }}
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
        <ActionToast message={addToast} onDone={clearAddToast} />
        {showTaskPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/35 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-picker-title"
              className="relative w-full max-w-[500px] rounded-[20px] bg-beige-light p-6 shadow-[0_18px_50px_rgba(26,26,48,.08)]"
            >
              <button
                type="button"
                onClick={() => setShowTaskPicker(false)}
                className="absolute right-4 top-4 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-gray-secondary hover:bg-gray-input hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                aria-label="Close task picker"
              >
                <X size={20} aria-hidden="true" />
              </button>

              <h3
                id="task-picker-title"
                className="pr-12 text-xl font-bold tracking-[-0.04em] text-navy"
              >
                Choose a task
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-secondary">
                Start a focus session on a recommended or in-progress task.
              </p>

              {pickableTasks.length === 0 ? (
                <p className="mt-4 text-sm leading-relaxed text-gray-secondary">
                  No recommended or in-progress tasks are ready to start.
                </p>
              ) : (
                <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                  {pickableTasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTaskPicker(false);
                          void handleStartTask(task.id);
                        }}
                        className="flex min-h-11 w-full cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[10px] bg-gray-input px-3 py-2 text-left transition-colors hover:bg-beige-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                      >
                        <span className="text-sm font-semibold text-navy">
                          {task.title}
                        </span>
                        <span className="text-xs text-gray-secondary">
                          {task.courseCode} · {ACTIVITY_LABELS[task.activityType]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTaskPicker(false)}
                  className="min-h-11 cursor-pointer rounded-[10px] border border-brown-label px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-beige-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        <DocumentPickerModal
          open={documentPicker != null}
          courseId={documentPicker?.courseId ?? ""}
          resources={documentPicker?.resources ?? []}
          onSelect={(target) => finishDocumentSelection(target)}
          onClose={() => finishDocumentSelection(null)}
        />
      </div>
    </div>
  );
}
