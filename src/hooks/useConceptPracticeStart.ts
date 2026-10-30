"use client";

import { useCallback, useState } from "react";
import { askedQuestionTexts, generateConceptQuiz } from "@/src/components/quizzes/weakConceptPractice";
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
  "This quiz is already being prepared. Give it a moment, then try Start again.";
const NO_SOURCE_MESSAGE = "This practice has no source document to build a quiz from.";

/**
 * Makes sure a daily concept-practice quiz exists before its task opens. Resolves with the
 * quiz set's id, or null when there is nothing to open: the task is not a concept-practice
 * quiz, or generation is under way elsewhere or failed (then `error` says why). The caller
 * must not navigate on null.
 */
export function useConceptPracticeStart(uid: string | null) {
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const ensureGeneratedSet = useCallback(
    async (task: StudyTask & { id: string }): Promise<string | null> => {
      const target = resolveActivityTarget(task);
      if (!uid || !target || target.kind !== "concept_practice" || target.practiceType !== "quiz") return null;

      setError(null);
      const decision = startDecision(target, Date.now());
      if (decision.action === "open_existing") return decision.setId;
      if (decision.action === "wait") {
        setError(BEING_PREPARED_MESSAGE);
        return null;
      }
      // One source document per daily quiz: splitting quotas across several breaks the
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
        const avoid = await askedQuestionTexts(uid, task.courseId, [sourceDocKey], {
          maxSets: DAILY_QUIZ_AVOID_SET_LIMIT,
        });
        const setId = await generateConceptQuiz({
          uid,
          courseId: task.courseId,
          sourceDocKey,
          focus: conceptFocusFromTarget(target, avoid),
          // A daily set is regenerated every day, so pinning it would flood the course
          // sidebar; the marker keeps the plan from recommending its own output back.
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
