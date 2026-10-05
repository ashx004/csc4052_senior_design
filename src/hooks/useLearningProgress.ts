"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { createFirebaseLearningProgressRepository } from "@/src/library/studyPlan/learningProgressRepository";
import {
  finishFlashcardReview as recordFlashcardReview,
  finishReading as recordReading,
  retryPendingAttempts as retrySavedAttempts,
  submitQuizResult,
  type ActivityProgressResult,
  type FinishFlashcardReviewInput,
  type FinishReadingInput,
  type QuizProgressOutcome,
  type SubmitQuizResultInput,
} from "@/src/library/studyPlan/learningProgressService";

function emptyQuizOutcome(): QuizProgressOutcome {
  return {
    attemptId: "",
    score: 0,
    total: 0,
    suggestion: null,
    taskShouldComplete: false,
  };
}

export function useLearningProgress() {
  const { user } = useAuth();
  const { session, completeSession, updateTaskStatus } = useStudyPlanContext();
  const uid = user?.uid ?? null;
  const repository = useMemo(
    () => (uid ? createFirebaseLearningProgressRepository(uid) : null),
    [uid],
  );

  const completeSavedTask = useCallback(
    async (taskId: string) => {
      if (session?.taskId === taskId) {
        try {
          await completeSession();
        } catch (error) {
          console.error(error);
        }
      }
      try {
        await updateTaskStatus(taskId, "completed");
      } catch (error) {
        console.error(error);
      }
    },
    [session?.taskId, completeSession, updateTaskStatus],
  );

  const submitQuiz = useCallback(
    async (input: SubmitQuizResultInput): Promise<QuizProgressOutcome> => {
      if (!repository) return emptyQuizOutcome();
      const outcome = await submitQuizResult(repository, input);
      if (outcome.taskShouldComplete && input.taskId != null) {
        await completeSavedTask(input.taskId);
      }
      return outcome;
    },
    [repository, completeSavedTask],
  );

  const finishReading = useCallback(
    async (input: FinishReadingInput): Promise<ActivityProgressResult> => {
      if (!repository) {
        return {
          eventId: "",
          courseId: input.courseId,
          sourceDocKey: input.sourceDocKey,
          resourceId: input.resourceId,
          flashcardSetId: null,
          taskId: input.taskId,
        };
      }
      const result = await recordReading(repository, input);
      if (result.taskId != null) await completeSavedTask(result.taskId);
      return result;
    },
    [repository, completeSavedTask],
  );

  const finishFlashcardReview = useCallback(
    async (input: FinishFlashcardReviewInput): Promise<ActivityProgressResult> => {
      if (!repository) {
        return {
          eventId: "",
          courseId: input.courseId,
          sourceDocKey: input.sourceDocKey,
          resourceId: null,
          flashcardSetId: input.flashcardSetId,
          taskId: input.taskId,
        };
      }
      const result = await recordFlashcardReview(repository, input);
      if (result.taskId != null) await completeSavedTask(result.taskId);
      return result;
    },
    [repository, completeSavedTask],
  );

  const retryPendingAttempts = useCallback(
    async (limitCount: number): Promise<QuizProgressOutcome[]> => {
      if (!repository) return [];
      return retrySavedAttempts(repository, limitCount);
    },
    [repository],
  );

  return {
    submitQuiz,
    finishReading,
    finishFlashcardReview,
    retryPendingAttempts,
  };
}
