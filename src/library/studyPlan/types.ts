import type { Timestamp } from "firebase/firestore";

export type ChickenState =
  | "egg"
  | "hatching"
  | "growing"
  | "almost"
  | "complete"
  | "dead"
  | "paused"
  | "break";

export type CardCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type TimerMode = "countdown" | "countup";

export type FocusCardMode = "active_on_task" | "active_navigated" | "paused";

export interface FocusCardState {
  visible: boolean;
  mode: FocusCardMode;
  taskId: string | null;
  taskTitle: string;
  courseCode: string;
  elapsedSeconds: number;
  sessionId: string;
  activityUrl: string;
  chickenState: ChickenState;
  isMinimized: boolean;
  corner: CardCorner;
  timerMode: TimerMode;
  targetSeconds: number | null;
  progress: number;
}

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

export type ActivityTarget =
  | { kind: "document"; resourceId: string; sourceDocKey: string }
  | { kind: "flashcard_set"; setId: string; sourceDocKey: string | null }
  | {
      kind: "quiz";
      quizId: string;
      sourceDocKey: string | null;
      mode: "full" | "missed_questions";
      questionIds?: string[];
    };

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
  activityTarget?: ActivityTarget;
  sourceSuggestionId?: string | null;
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
  taskId: string | null;
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
  timerMode: TimerMode;
  targetSeconds: number | null;
}

// --- Mastery ---

export type QuizAttemptType = "full_quiz" | "targeted_practice";

export interface QuizQuestionResult {
  questionId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface QuizAttemptEvidence {
  id: string;
  attemptType?: QuizAttemptType;
  score: number;
  total: number;
  questionIds: string[];
  fullQuizQuestionCount: number | null;
  completedAtMs: number;
}

export interface DocumentMasteryCalculation {
  value: number;
  level: "weak" | "developing" | "strong";
  sourceAttemptIds: string[];
}

export interface DocumentMastery {
  value: number;
}

export interface CourseMastery {
  value: number;
  knownDocuments: number;
  totalDocuments: number;
}

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

// --- Learning suggestions ---

export type LearningSuggestionStatus =
  | "active" | "added" | "dismissed" | "resolved" | "unavailable";

export interface MissedQuestionsSuggestion {
  type: "missed_questions";
  courseId: string;
  sourceDocKey: string | null;
  quizId: string;
  questionIds: string[];
  questionFailureCounts: Record<string, number>;
  status: LearningSuggestionStatus;
  priority: number;
  linkedTaskId: string | null;
  sourceAttemptId: string;
}

export interface LearningActivityEvent {
  type: "reading_finished" | "flashcard_review_finished";
  courseId: string;
  sourceDocKey: string;
  resourceId: string | null;
  flashcardSetId: string | null;
  sourceTaskId: string | null;
  completedAt: Timestamp;
}

export type NewLearningActivityEvent = Omit<LearningActivityEvent, "completedAt"> & {
  completedAt?: Timestamp;
};

export interface QuizContext {
  sourceDocKey: string | null;
  fullQuizQuestionCount: number;
}

export interface PersistQuizOutcomeInput {
  courseId: string;
  quizId: string;
  attemptId: string;
  mastery: DocumentMasteryCalculation | null;
  suggestion: MissedQuestionsSuggestion;
  taskId: string | null;
}

export interface PendingAttemptRef {
  courseId: string;
  quizId: string;
  attemptId: string;
}

export interface NewQuizAttempt {
  courseId: string;
  quizId: string;
  answers: Record<string, string>;
  score: number;
  total: number;
  attemptType: QuizAttemptType;
  questionIds: string[];
  questionResults: QuizQuestionResult[];
  sourceTaskId: string | null;
  sourceSuggestionId: string | null;
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

// Written server-side by src/library/advisingJobs.ts when an advising
// background job finishes. Kept out of NotificationType so study-plan rules
// (preferences, throttling) never apply to them.
export type AdvisingNotificationType =
  | "advising_documents_ready"
  | "advising_documents_failed"
  | "advising_schedule_ready"
  | "advising_schedule_failed";

export type NotificationStatus =
  | "created"
  | "delivered"
  | "read"
  | "acted_on"
  | "dismissed";

export interface StudyNotification {
  type: NotificationType | AdvisingNotificationType;
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
  repeatMissCount?: number;
  activityTarget?: ActivityTarget;
}

export interface PriorityFactors {
  baseScore: number;
  examUrgency: number;
  lowQuizMastery: number;
  lowFlashcardEngagement: number;
  staleReview: number;
  skipPenalty: number;
  repeatMissBonus: number;
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
  activityTarget?: ActivityTarget;
}
