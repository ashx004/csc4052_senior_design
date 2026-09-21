import type { Timestamp } from "firebase/firestore";

// --- Plan ---

export type PlanState =
  | "no_plan"
  | "setup"
  | "active"
  | "completed"
  | "incomplete"
  | "abandoned";

export type StudyGoal = "exam_prep" | "weak_topics" | "assignment" | "general";
export type ActivityPreference = "quiz" | "flashcards" | "reading" | "ai_explanation" | "auto";
export type AvailableTime = 15 | 30 | 60 | 90;

export interface SetupConfig {
  availableMinutes: AvailableTime;
  goal: StudyGoal;
  courseId: string | null;
  activityPreference: ActivityPreference;
}

export interface DailyPlan {
  state: "active" | "completed" | "incomplete" | "abandoned";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  setupConfig: SetupConfig;
  taskIds: string[];
  totalTasks: number;
  completedCount: number;
  skippedCount: number;
  totalActiveMinutes: number;
}

// --- Task ---

export type TaskStatus =
  | "recommended"
  | "in_progress"
  | "completed"
  | "skipped"
  | "rescheduled";

export type TaskSource = "recommended" | "manual";
export type ActivityType = "quiz" | "flashcards" | "reading" | "ai_explanation";

export interface StatusChange {
  from: TaskStatus;
  to: TaskStatus;
  at: Timestamp;
  reason?: string;
}

export interface StudyTask {
  planDate: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  title: string;
  activityType: ActivityType;
  targetId: string | null;
  topicLabel: string;
  estimatedMinutes: number;
  source: TaskSource;
  reason: string | null;
  priorityScore: number | null;
  status: TaskStatus;
  statusHistory: StatusChange[];
  scheduledDate: string;
  rescheduleCount: number;
  skipCount: number;
  activeSessionId: string | null;
  totalActiveMinutes: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
}

// --- Session ---

export type SessionStatus =
  | "active"
  | "paused"
  | "expired"
  | "completed"
  | "abandoned";

export interface SessionPeriod {
  startedAt: Timestamp;
  endedAt: Timestamp | null;
}

export interface StudySession {
  taskId: string;
  courseId: string;
  activityType: ActivityType;
  targetId: string | null;
  status: SessionStatus;
  startedAt: Timestamp;
  pausedAt: Timestamp | null;
  completedAt: Timestamp | null;
  activeMinutes: number;
  periods: SessionPeriod[];
  activityUrl: string;
}

// --- Mastery ---

export type SignalType = "quiz_mastery" | "flashcard_engagement";

export interface MasterySignal {
  courseId: string;
  courseName: string;
  topicLabel: string;
  signalType: SignalType;
  value: number;
  lastStudiedAt: Timestamp;
  lastCalculatedAt: Timestamp;
  sourceAttemptIds?: string[];
  sourceSessionIds?: string[];
}

// --- Notifications ---

export type NotificationType =
  | "session_reminder"
  | "carryover"
  | "break_suggestion"
  | "pause_reminder"
  | "task_completed"
  | "plan_completed"
  | "streak_milestone"
  | "weekly_summary"
  | "session_expired"
  | "incomplete_plan"
  | "no_visit_recovery"
  | "deadline_warning";

export type NotificationStatus =
  | "created"
  | "delivered"
  | "read"
  | "acted_on"
  | "dismissed";

export interface StudyNotification {
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  taskId?: string;
  planDate?: string;
  courseId?: string;
  createdAt: Timestamp;
  deliveredAt: Timestamp | null;
  readAt: Timestamp | null;
  expiresAt: Timestamp;
  dedupeKey: string;
}

export interface NotificationPreferences {
  studyReminders: boolean;
  breakSuggestions: boolean;
  deadlineWarnings: boolean;
  progressUpdates: boolean;
}

// --- Flashcard Engagement ---

export interface FlashcardCardEngagement {
  flipped: boolean;
  viewedAt: Timestamp;
  flippedAt: Timestamp | null;
  leftAt: Timestamp | null;
  timeOnCardMs: number;
}

// --- Calendar Extension ---

export type EventCategory = "exam" | "deadline" | "class";

// --- Client-only state ---

export interface SetupFlowState {
  step: 1 | 2 | 3 | 4;
  config: Partial<SetupConfig>;
  isGenerating: boolean;
  error: string | null;
}

export type FocusBarMode = "active_on_task" | "active_navigated" | "paused";

export interface FocusBarState {
  visible: boolean;
  mode: FocusBarMode;
  taskId: string;
  taskTitle: string;
  courseCode: string;
  elapsedSeconds: number;
  sessionId: string;
  activityUrl: string;
}

export type PlanViewMode = "list" | "board" | "schedule";

export interface PlanViewState {
  viewMode: PlanViewMode;
  expandedTaskId: string | null;
}

// --- Recommendation Engine ---

export interface EligibleTopic {
  courseId: string;
  courseName: string;
  courseCode: string;
  topicLabel: string;
  targetId: string | null;
  activityType: ActivityType;
  quizMastery: number | null;
  flashcardEngagement: number | null;
  lastStudiedAt: Timestamp | null;
  skipCount: number;
}

export interface PriorityFactors {
  baseScore: number;
  examUrgency: number;
  lowQuizMastery: number;
  lowFlashcardEngagement: number;
  staleReview: number;
  skipPenalty: number;
}

export interface ScoredTopic extends EligibleTopic {
  factors: PriorityFactors;
  totalScore: number;
}

export interface GeneratedTask {
  title: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  topicLabel: string;
  activityType: ActivityType;
  targetId: string | null;
  estimatedMinutes: number;
  reason: string;
  priorityScore: number;
}
