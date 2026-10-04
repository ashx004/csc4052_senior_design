import type {
  ActivityType,
  ActivityPreference,
  ActivityTarget,
  EligibleTopic,
  GeneratedTask,
  PriorityFactors,
  ScoredTopic,
  SetupConfig,
} from "./types";

export const ESTIMATED_MINUTES: Record<ActivityType, number> = {
  quiz: 20,
  flashcards: 15,
  reading: 20,
  ai_explanation: 15,
};

const REQUIRED_ACTIVITY_MINUTES =
  ESTIMATED_MINUTES.reading + ESTIMATED_MINUTES.quiz + ESTIMATED_MINUTES.flashcards;

const REPEAT_MISS_BONUS = 5;
const REPEAT_MISS_BONUS_CAP = 15;

export function scoreTopic(
  topic: EligibleTopic,
  examsWithinDays: number | null,
  goalDoubleUrgency: boolean
): ScoredTopic {
  const factors: PriorityFactors = {
    baseScore: 10,
    examUrgency: computeExamUrgency(examsWithinDays, goalDoubleUrgency),
    lowQuizMastery: computeLowMasteryScore(topic.quizMastery, "quiz"),
    lowFlashcardEngagement: computeLowMasteryScore(
      topic.flashcardEngagement,
      "flashcard"
    ),
    staleReview: computeStaleReview(topic.lastStudiedAt),
    skipPenalty: Math.max(-15, topic.skipCount * -5),
    repeatMissBonus: computeRepeatMissBonus(topic.repeatMissCount),
  };

  const totalScore =
    factors.baseScore +
    factors.examUrgency +
    factors.lowQuizMastery +
    factors.lowFlashcardEngagement +
    factors.staleReview +
    factors.skipPenalty +
    factors.repeatMissBonus;

  return { ...topic, factors, totalScore };
}

function computeExamUrgency(
  daysUntilExam: number | null,
  double: boolean
): number {
  if (daysUntilExam === null) return 0;
  let urgency = 0;
  if (daysUntilExam <= 3) urgency = 30;
  else if (daysUntilExam <= 7) urgency = 20;
  else if (daysUntilExam <= 14) urgency = 10;
  return double ? urgency * 2 : urgency;
}

function computeLowMasteryScore(
  mastery: number | null,
  type: "quiz" | "flashcard"
): number {
  if (mastery === null) return 0;
  const value = mastery;
  const thresholds =
    type === "quiz"
      ? { low: 25, mid: 15, high: 5 }
      : { low: 15, mid: 10, high: 5 };

  if (value < 0.4) return thresholds.low;
  if (value < 0.6) return thresholds.mid;
  if (value < 0.8) return thresholds.high;
  return 0;
}

function computeRepeatMissBonus(count: number | undefined): number {
  if (count == null || count <= 0) return 0;
  return Math.min(REPEAT_MISS_BONUS_CAP, count * REPEAT_MISS_BONUS);
}

function computeStaleReview(
  lastStudiedAt: { toMillis(): number } | null
): number {
  // A study timestamp affects staleness only. Unknown mastery stays exploration.
  if (!lastStudiedAt) return 0;
  const daysSince =
    (Date.now() - lastStudiedAt.toMillis()) / (1000 * 60 * 60 * 24);
  if (daysSince > 14) return 15;
  if (daysSince >= 7) return 10;
  if (daysSince >= 3) return 5;
  return 0;
}

function averageMastery(topic: EligibleTopic): number | null {
  const known = [topic.quizMastery, topic.flashcardEngagement].filter(
    (value): value is number => value !== null
  );
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

export function isWeakTopic(topic: EligibleTopic): boolean {
  const average = averageMastery(topic);
  return average !== null && average < 0.6;
}

export function chooseActivityType(
  topic: EligibleTopic,
  preference: ActivityPreference
): ActivityType {
  if (topic.targetId === null) return "reading";
  if (preference !== "auto") return preference as ActivityType;

  if (topic.quizMastery === null && topic.flashcardEngagement === null) {
    return "reading";
  }

  if (topic.activityType === "flashcards" && topic.flashcardEngagement === null) {
    return "flashcards";
  }

  const qm = topic.quizMastery ?? 1;
  const fe = topic.flashcardEngagement ?? 1;

  if (qm <= fe) return "quiz";
  return "flashcards";
}

function buildReason(scored: ScoredTopic, activityType: ActivityType): string {
  const parts: string[] = [];

  if (scored.factors.examUrgency > 0) {
    parts.push("upcoming exam");
  }

  const mastery =
    activityType === "quiz" ? scored.quizMastery : scored.flashcardEngagement;
  if (mastery !== null && mastery < 0.6) {
    parts.push(`${activityType === "quiz" ? "quiz mastery" : "flashcard engagement"} at ${Math.round(mastery * 100)}%`);
  }

  if (scored.factors.staleReview >= 10) {
    parts.push("not reviewed recently");
  }

  if (scored.quizMastery === null && scored.flashcardEngagement === null) {
    const activityLabel =
      activityType === "quiz"
        ? "quiz"
        : activityType === "flashcards"
          ? "flashcard set"
          : "course materials";
    return `Explore ${scored.courseName} — try your first ${activityLabel}`;
  }

  if (parts.length === 0) {
    parts.push("general review");
  }

  const capitalized = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length === 1
    ? capitalized
    : `${capitalized} — ${parts.slice(1).join(", ")}`;
}

function activityTargetForTask(
  topic: EligibleTopic,
  activityType: ActivityType,
  targetId: string | null
): ActivityTarget | undefined {
  const source = topic.activityTarget;
  if (!source) return undefined;
  if (activityType === "reading") {
    return source.kind === "document" ? source : undefined;
  }
  if (topic.activityType !== activityType) return undefined;
  if (source.kind !== "document") return source;
  if (topic.activityType === "quiz" && activityType === "quiz" && targetId) {
    return {
      kind: "quiz",
      quizId: targetId,
      sourceDocKey: source.sourceDocKey,
      mode: "full",
    };
  }
  if (topic.activityType === "flashcards" && activityType === "flashcards" && targetId) {
    return {
      kind: "flashcard_set",
      setId: targetId,
      sourceDocKey: source.sourceDocKey,
    };
  }
  return undefined;
}

function buildTitle(activityType: ActivityType, topicLabel: string): string {
  const prefix: Record<ActivityType, string> = {
    quiz: "Quiz",
    flashcards: "Review",
    reading: "Read",
    ai_explanation: "Explore",
  };
  return `${prefix[activityType]}: ${topicLabel}`;
}

export function needsDocumentSelection(
  task: Pick<GeneratedTask, "activityType" | "activityTarget">
): boolean {
  return task.activityType === "reading" && task.activityTarget?.kind !== "document";
}

export interface RecommendationResource {
  id: string;
  url?: unknown;
  sourceDocKey?: unknown;
  storageKey?: unknown;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function documentTargetForResource(
  resource: RecommendationResource
): Extract<ActivityTarget, { kind: "document" }> {
  const stored =
    nonEmptyString(resource.sourceDocKey) ?? nonEmptyString(resource.storageKey);
  return {
    kind: "document",
    resourceId: resource.id,
    sourceDocKey: stored ?? nonEmptyString(resource.url) ?? "",
  };
}

function decodeKey(value: string): string {
  let current = value.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded.trim();
    } catch {
      break;
    }
  }
  return current;
}

function downloadKey(value: string): string | null {
  const marker = "key=";
  const index = value.indexOf(marker);
  if (index < 0) return null;
  const raw = value.slice(index + marker.length).split("&")[0] ?? "";
  const decoded = decodeKey(raw);
  return decoded.length > 0 ? decoded : null;
}

function comparableKeys(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const decoded = decodeKey(trimmed);
  const keys = new Set<string>([decoded]);
  const fromDecoded = downloadKey(decoded);
  if (fromDecoded) keys.add(fromDecoded);
  const fromRaw = downloadKey(trimmed);
  if (fromRaw) keys.add(fromRaw);
  return [...keys];
}

export function findResourceForSourceDocKey<T extends RecommendationResource>(
  sourceDocKey: unknown,
  resources: readonly T[]
): T | undefined {
  const source = nonEmptyString(sourceDocKey);
  if (!source) return undefined;
  const wanted = new Set(comparableKeys(source));
  return resources.find((resource) => {
    const candidates = [...comparableKeys(resource.id)];
    for (const value of [resource.sourceDocKey, resource.storageKey, resource.url]) {
      const stored = nonEmptyString(value);
      if (stored) candidates.push(...comparableKeys(stored));
    }
    return candidates.some((key) => wanted.has(key));
  });
}

export interface GenerateTasksOptions {
  /** Overrides config.availableMinutes as the minutes left to fill (e.g. after carryover). */
  minutesBudget?: number;
  /** Courses that must get a task (weak and untouched this week), forced in first. */
  guaranteedCourseIds?: readonly string[];
}

export function generateTasks(
  config: SetupConfig,
  topics: EligibleTopic[],
  exams: Map<string, number>,
  options: GenerateTasksOptions = {}
): GeneratedTask[] {
  let filtered = topics;

  if (config.courseId) {
    filtered = filtered.filter((t) => t.courseId === config.courseId);
  }

  const goalDoubleUrgency = config.goal === "exam_prep";

  if (config.goal === "exam_prep") {
    filtered = filtered.filter((t) => exams.has(t.courseId));
  } else if (config.goal === "weak_topics") {
    filtered = filtered.filter((t) => isWeakTopic(t));
  }

  const scored = filtered.map((t) => {
    const daysUntilExam = exams.get(t.courseId) ?? null;
    return scoreTopic(t, daysUntilExam, goalDoubleUrgency);
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const tasks: GeneratedTask[] = [];
  let remainingMinutes = options.minutesBudget ?? config.availableMinutes;
  const usedTopics = new Set<string>();

  const addTask = (
    topic: ScoredTopic,
    activityType: ActivityType,
    targetId = topic.targetId
  ) => {
    const topicKey = `${topic.courseId}:${topic.topicLabel}:${activityType}`;
    if (usedTopics.has(topicKey)) return false;

    const estMinutes = ESTIMATED_MINUTES[activityType];
    if (estMinutes > remainingMinutes) return false;

    const resolvedTargetId =
      activityType === "reading" && topic.activityTarget?.kind === "document"
        ? topic.activityTarget.resourceId
        : targetId;
    const activityTarget = activityTargetForTask(topic, activityType, targetId);

    tasks.push({
      title: buildTitle(activityType, topic.topicLabel),
      courseId: topic.courseId,
      courseName: topic.courseName,
      courseCode: topic.courseCode,
      topicLabel: topic.topicLabel,
      activityType,
      targetId: resolvedTargetId,
      estimatedMinutes: estMinutes,
      reason: buildReason(topic, activityType),
      priorityScore: topic.totalScore,
      ...(activityTarget ? { activityTarget } : {}),
    });

    remainingMinutes -= estMinutes;
    usedTopics.add(topicKey);
    return true;
  };

  for (const courseId of options.guaranteedCourseIds ?? []) {
    const topic = scored.find((candidate) => candidate.courseId === courseId);
    if (!topic) continue;
    addTask(topic, chooseActivityType(topic, config.activityPreference));
  }

  if (
    config.activityPreference === "auto" &&
    remainingMinutes >= REQUIRED_ACTIVITY_MINUTES
  ) {
    const quizTopic = scored.find(
      (topic) => topic.activityType === "quiz" && topic.targetId !== null
    );
    const flashcardTopic = scored.find(
      (topic) => topic.activityType === "flashcards" && topic.targetId !== null
    );
    const readingTopic = scored[0];

    if (quizTopic && flashcardTopic && readingTopic) {
      addTask(readingTopic, "reading", null);
      addTask(quizTopic, "quiz");
      addTask(flashcardTopic, "flashcards");
    }
  }

  for (const topic of scored) {
    if (tasks.length >= 3) break;

    const topicKey = `${topic.courseId}:${topic.topicLabel}`;
    if ([...usedTopics].some((key) => key.startsWith(`${topicKey}:`))) continue;

    const activityType = chooseActivityType(topic, config.activityPreference);
    addTask(topic, activityType);
  }

  return tasks;
}
