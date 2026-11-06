"use client";

import { useCallback, useState } from "react";
import {
  askedQuestionTexts,
  generateConceptFlashcards,
  generateConceptQuiz,
  practiceCounts,
} from "@/src/components/quizzes/weakConceptPractice";
import { DAILY_QUIZ_AVOID_SET_LIMIT } from "@/src/library/studyPlan/dailyQuizTarget";
import { generationFailureMessage } from "@/src/hooks/usePracticeGeneration";
import { resolveActivityTarget } from "@/src/library/studyPlan/activityTarget";
import {
  claimTaskGeneration,
  conceptFocusFromTarget,
  releaseTaskGeneration,
  saveGeneratedSetId,
  startDecision,
} from "@/src/library/studyPlan/conceptPracticeTask";
import type { StudyTask } from "@/src/library/studyPlan/types";

export const BEING_PREPARED_MESSAGE =
  "This practice is already being prepared. Give it a moment, then try Start again.";
const NO_SOURCE_MESSAGE = "This practice has no source document to build it from.";

/**
 * Makes sure a daily concept-practice set (quiz or flashcards) exists before its task opens.
 * Resolves with the set's id, or null when there is nothing to open: the task is not a
 * quiz or flashcard concept-practice task, or generation is under way elsewhere or failed
 * (then `error` says why). The caller
 * must not navigate on null.
 */
export function useConceptPracticeStart(uid: string | null) {
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const ensureGeneratedSet = useCallback(
    async (task: StudyTask & { id: string }): Promise<string | null> => {
      const target = resolveActivityTarget(task);
      if (!uid || !target || target.kind !== "concept_practice") return null;
      if (target.practiceType !== "quiz" && target.practiceType !== "flashcards") return null;

      setError(null);
      const decision = startDecision(target, Date.now());
      if (decision.action === "open_existing") return decision.setId;
      if (decision.action === "wait") {
        setError(BEING_PREPARED_MESSAGE);
        return null;
      }
      // One source document per daily set: splitting quotas across several breaks the
      // per-concept counts and several model calls would outlast the claim.
      const sourceDocKey = target.sourceDocKeys[0];
      if (!sourceDocKey) {
        setError(NO_SOURCE_MESSAGE);
        return null;
      }

      setGeneratingTaskId(task.id);
      let claimed = false;
      try {
        claimed = await claimTaskGeneration(uid, task.id, decision.claimAtMs);
        if (!claimed) {
          setError(BEING_PREPARED_MESSAGE);
          return null;
        }
        // A daily set is regenerated every day, so it is never pinned to the course sidebar;
        // the generatedForPlan marker keeps the plan from recommending its own output back.
        const setId =
          target.practiceType === "flashcards"
            ? await generateConceptFlashcards({
                uid,
                courseId: task.courseId,
                sourceDocKey,
                // askedQuestionTexts reads quiz sets, so there is nothing to avoid here.
                focus: conceptFocusFromTarget(target, []),
                count: practiceCounts("flashcards").requested,
                generatedForPlan: true,
              })
            : await generateConceptQuiz({
                uid,
                courseId: task.courseId,
                sourceDocKey,
                focus: conceptFocusFromTarget(
                  target,
                  await askedQuestionTexts(uid, task.courseId, [sourceDocKey], {
                    maxSets: DAILY_QUIZ_AVOID_SET_LIMIT,
                  }),
                ),
                pinned: false,
                generatedForPlan: true,
              });
        await saveGeneratedSetId(uid, task.id, setId);
        return setId;
      } catch (failure) {
        if (claimed) await releaseTaskGeneration(uid, task.id, decision.claimAtMs).catch(() => undefined);
        setError(generationFailureMessage(500, failure instanceof Error ? failure.message : null));
        return null;
      } finally {
        setGeneratingTaskId(null);
      }
    },
    [uid],
  );

  return { ensureGeneratedSet, generatingTaskId, error, clearError };
}
