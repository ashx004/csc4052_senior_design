import { conceptKey } from "./conceptKey";
import { topicDocumentLabel } from "./topicDocumentLabel";
import type { ActivityTarget, EligibleTopic } from "./types";

type ConceptPracticeTarget = Extract<ActivityTarget, { kind: "concept_practice" }>;

// Must stay in step with practiceCounts() in src/components/quizzes/weakConceptPractice.ts.
// Re-declared here because importing that module pulls firebase into this pure library module.
// The quiz count is test-pinned: targetedPractice.test.ts asserts the built target's
// questionCount equals TARGETED_PRACTICE_QUESTION_COUNT, which is what practiceCounts("quiz")
// returns, so the two cannot drift. The flashcards count is NOT pinned — practiceCounts
// returns a bare literal for it with no exported counterpart to compare against.
const QUESTION_COUNTS: Record<"quiz" | "flashcards", number> = {
  quiz: 10,
  flashcards: 10,
};

function cleanKey(key: string | null | undefined): string | null {
  const trimmed = key?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** The source document key a topic's activity target points at, or null when it has none. */
export function topicSourceDocKey(topic: Pick<EligibleTopic, "activityTarget">): string | null {
  const target = topic.activityTarget;
  if (!target) return null;
  switch (target.kind) {
    case "document":
    case "quiz":
    case "flashcard_set":
      return cleanKey(target.sourceDocKey);
    case "concept_practice":
      return cleanKey(target.sourceDocKeys[0]);
  }
}

/**
 * Builds the concept_practice target for a topic that has no matching set yet.
 * Returns null when the topic has no resolvable source document.
 */
export function buildGeneratedPracticeTarget(
  topic: EligibleTopic,
  practiceType: "quiz" | "flashcards",
): ConceptPracticeTarget | null {
  const sourceDocKey = topicSourceDocKey(topic);
  if (!sourceDocKey) return null;
  const label = topicDocumentLabel(topic.topicLabel);
  return {
    kind: "concept_practice",
    conceptKeys: [conceptKey(label)],
    conceptLabels: [label],
    conceptLevels: {},
    sourceDocKeys: [sourceDocKey],
    practiceType,
    questionCount: QUESTION_COUNTS[practiceType],
    generatedSetId: null,
    generationClaimedAtMs: null,
  };
}
