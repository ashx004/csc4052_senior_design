import type {
  ActivityType,
  ActivityPreference,
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
  };

  const totalScore =
    factors.baseScore +
    factors.examUrgency +
    factors.lowQuizMastery +
    factors.lowFlashcardEngagement +
    factors.staleReview +
    factors.skipPenalty;

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
  const value = mastery ?? 0;
  const thresholds =
    type === "quiz"
      ? { low: 25, mid: 15, high: 5 }
      : { low: 15, mid: 10, high: 5 };

  if (value < 0.4) return thresholds.low;
  if (value < 0.6) return thresholds.mid;
  if (value < 0.8) return thresholds.high;
  return 0;
}

function computeStaleReview(
  lastStudiedAt: { toMillis(): number } | null
): number {
  // Never studied earns no staleness bonus — the unknown-mastery bonus already
  // prioritizes it.
  if (!lastStudiedAt) return 0;
  const daysSince =
    (Date.now() - lastStudiedAt.toMillis()) / (1000 * 60 * 60 * 24);
  if (daysSince > 14) return 15;
  if (daysSince >= 7) return 10;
  if (daysSince >= 3) return 5;
  return 0;
}

// Combined mastery across whichever signals exist. No data at all counts as 0,
// so brand-new topics are treated as weak.
function averageMastery(topic: EligibleTopic): number {
  const known = [topic.quizMastery, topic.flashcardEngagement].filter(
    (value): value is number => value !== null
  );
  if (known.length === 0) return 0;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

export function chooseActivityType(
  topic: EligibleTopic,
  preference: ActivityPreference
): ActivityType {
  if (preference !== "auto") return preference as ActivityType;

  if (topic.quizMastery === null && topic.flashcardEngagement === null) {
    return "reading";
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
    return `Explore ${scored.courseName} — try your first ${activityType === "quiz" ? "quiz" : "flashcard set"}`;
  }

  if (parts.length === 0) {
    parts.push("general review");
  }

  const capitalized = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length === 1
    ? capitalized
    : `${capitalized} — ${parts.slice(1).join(", ")}`;
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

export function generateTasks(
  config: SetupConfig,
  topics: EligibleTopic[],
  exams: Map<string, number>
): GeneratedTask[] {
  let filtered = topics;

  if (config.courseId) {
    filtered = filtered.filter((t) => t.courseId === config.courseId);
  }

  const goalDoubleUrgency = config.goal === "exam_prep";

  if (config.goal === "exam_prep") {
    filtered = filtered.filter((t) => exams.has(t.courseId));
  } else if (config.goal === "weak_topics") {
    filtered = filtered.filter((t) => averageMastery(t) < 0.6);
  }

  const scored = filtered.map((t) => {
    const daysUntilExam = exams.get(t.courseId) ?? null;
    return scoreTopic(t, daysUntilExam, goalDoubleUrgency);
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const tasks: GeneratedTask[] = [];
  let remainingMinutes = config.availableMinutes;
  const usedTopics = new Set<string>();

  for (const topic of scored) {
    if (tasks.length >= 3) break;

    const topicKey = `${topic.courseId}:${topic.topicLabel}`;
    if (usedTopics.has(topicKey)) continue;

    const activityType = chooseActivityType(topic, config.activityPreference);
    const estMinutes = ESTIMATED_MINUTES[activityType];

    if (estMinutes > remainingMinutes) continue;

    tasks.push({
      title: buildTitle(activityType, topic.topicLabel),
      courseId: topic.courseId,
      courseName: topic.courseName,
      courseCode: topic.courseCode,
      topicLabel: topic.topicLabel,
      activityType,
      targetId: topic.targetId,
      estimatedMinutes: estMinutes,
      reason: buildReason(topic, activityType),
      priorityScore: topic.totalScore,
    });

    remainingMinutes -= estMinutes;
    usedTopics.add(topicKey);
  }

  return tasks;
}
