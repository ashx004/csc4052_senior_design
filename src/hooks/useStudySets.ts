'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAuth } from '@/src/context/AuthContext';
import { db } from '@/src/library/firebase';
import {
  toFlashcardSummary,
  toQuizSummary,
  type FlashcardSetSummary,
  type QuizSetSummary,
  type SavedQuizAttemptFields,
  type SavedQuizSetFields,
} from '@/src/library/studySets/viewModels';

interface SavedQuiz {
  id: string;
  data: SavedQuizSetFields;
}

export interface StudySetsResult {
  flashcards: FlashcardSetSummary[];
  quizzes: QuizSetSummary[];
  loading: boolean;
  error: Error | null;
}

/** Subscribe to course sets, plus one latest attempt for each visible quiz page. */
export function useStudySets(courseId: string, visibleQuizCount = 20): StudySetsResult {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid;
  const [flashcards, setFlashcards] = useState<FlashcardSetSummary[]>([]);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>([]);
  const [attempts, setAttempts] = useState<Record<string, SavedQuizAttemptFields | null>>({});
  const [flashcardsLoading, setFlashcardsLoading] = useState(true);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!uid || !courseId) {
      setFlashcards([]);
      setSavedQuizzes([]);
      setAttempts({});
      setFlashcardsLoading(false);
      setQuizzesLoading(false);
      setError(null);
      return;
    }

    setFlashcardsLoading(true);
    setQuizzesLoading(true);
    setError(null);
    const base = ['users', uid, 'enrollment', courseId] as const;
    const flashcardsQuery = query(collection(db, ...base, 'flashcardSets'), orderBy('createdAt', 'desc'));
    const quizzesQuery = query(collection(db, ...base, 'quizSets'), orderBy('createdAt', 'desc'));
    const unsubscribeFlashcards = onSnapshot(
      flashcardsQuery,
      (snapshot) => {
        setFlashcards(snapshot.docs.map((saved) => toFlashcardSummary(saved.id, saved.data())));
        setFlashcardsLoading(false);
      },
      (cause) => {
        setError(cause);
        setFlashcardsLoading(false);
      },
    );
    const unsubscribeQuizzes = onSnapshot(
      quizzesQuery,
      (snapshot) => {
        setSavedQuizzes(snapshot.docs.map((saved) => ({ id: saved.id, data: saved.data() })));
        setQuizzesLoading(false);
      },
      (cause) => {
        setError(cause);
        setQuizzesLoading(false);
      },
    );
    return () => {
      unsubscribeFlashcards();
      unsubscribeQuizzes();
    };
  }, [authLoading, uid, courseId]);

  // A library can request 40, 60, ... as the student expands its list.
  const pageSize = Math.max(20, Math.ceil(visibleQuizCount / 20) * 20);
  const visibleQuizIds = JSON.stringify(savedQuizzes.slice(0, pageSize).map((quiz) => quiz.id));
  useEffect(() => {
    if (!uid || !courseId) return;
    const ids = JSON.parse(visibleQuizIds) as string[];
    setAttempts((current) => Object.fromEntries(ids.filter((id) => id in current).map((id) => [id, current[id]])));
    const unsubscribers = ids.map((quizId) => {
      const attemptsRef = collection(db, 'users', uid, 'enrollment', courseId, 'quizSets', quizId, 'attempts');
      const latestQuery = query(attemptsRef, orderBy('completedAt', 'desc'), limit(1));
      return onSnapshot(
        latestQuery,
        (snapshot) => {
          const attempt = snapshot.docs[0]?.data() as SavedQuizAttemptFields | undefined;
          setAttempts((current) => ({ ...current, [quizId]: attempt ?? null }));
        },
        (cause) => setError(cause),
      );
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [uid, courseId, visibleQuizIds]);

  const quizzes = useMemo(
    () => savedQuizzes.map((quiz) => (
      quiz.id in attempts
        ? toQuizSummary(quiz.id, quiz.data, attempts[quiz.id])
        : toQuizSummary(quiz.id, quiz.data)
    )),
    [savedQuizzes, attempts],
  );

  return {
    flashcards,
    quizzes,
    loading: authLoading || flashcardsLoading || quizzesLoading,
    error,
  };
}
