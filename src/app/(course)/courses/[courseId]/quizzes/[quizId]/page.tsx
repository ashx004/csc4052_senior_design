'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import QuestionCard from '@/src/components/quizzes/QuestionCard';
import QuizResults from '@/src/components/quizzes/QuizResults';

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false';
  question: string;
  options: string[];
  correctAnswer: string;
}

interface PastAttempt {
  id: string;
  score: number;
  total: number;
  completedAt: Timestamp | null;
  answers: Record<string, string>;
}

type Mode = 'landing' | 'taking' | 'results';

function formatAttemptDate(timestamp: Timestamp | null): string {
  if (!timestamp) return 'Unknown date';
  const date = timestamp.toDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${date.getDate()} ${date.getFullYear()}, ${time}`;
}

export default function QuizTakingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const quizId = params.quizId as string;

  const { displayName: courseDisplayName } = useCourseInfo(courseId);

  const [quizName, setQuizName] = useState('Quiz');
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [mode, setMode] = useState<Mode>('landing');
  const [modeResolved, setModeResolved] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptStartTime, setAttemptStartTime] = useState<number>(Date.now());
  const [submitting, setSubmitting] = useState(false);

  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [viewedAttempt, setViewedAttempt] = useState<PastAttempt | null>(null);
  const [attemptNotFound, setAttemptNotFound] = useState(false);

  // Redirect to /login if unauthenticated, mirroring the course layout's own gate
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Load the quiz set
  useEffect(() => {
    if (!user || !quizId) return;

    const loadQuiz = async () => {
      setLoading(true);
      setNotFound(false);

      try {
        const quizRef = doc(db, 'users', user.uid, 'enrollment', courseId, 'quizSets', quizId);
        const quizSnap = await getDoc(quizRef);

        if (!quizSnap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = quizSnap.data();
        const questions: QuizQuestion[] = data.questions || [];

        setQuizName(data.name || 'Quiz');
        setAllQuestions(questions);
        setActiveQuestions(questions);
      } catch (error) {
        console.error('Error loading quiz set:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadQuiz();
  }, [user, quizId, courseId]);

  const fetchPastAttempts = async () => {
    if (!user) return;
    try {
      const attemptsRef = collection(
        db,
        'users',
        user.uid,
        'enrollment',
        courseId,
        'quizSets',
        quizId,
        'attempts'
      );
      const attemptsQuery = query(attemptsRef, orderBy('completedAt', 'desc'));
      const snapshot = await getDocs(attemptsQuery);

      setPastAttempts(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            score: data.score ?? 0,
            total: data.total ?? 0,
            completedAt: (data.completedAt as Timestamp) ?? null,
            answers: data.answers ?? {},
          };
        })
      );
    } catch (error) {
      console.error('Error fetching past attempts:', error);
      setPastAttempts([]);
    }
  };

  // Load the list of past attempts once the quiz set is loaded
  useEffect(() => {
    if (!user || loading || notFound) return;
    fetchPastAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId, quizId, loading, notFound]);

  // Resolve mode from the URL — no params -> landing, ?mode=take -> taking, ?attemptId= -> results
  useEffect(() => {
    if (!user || loading || notFound) return;

    let cancelled = false;
    const attemptId = searchParams.get('attemptId');
    const modeParam = searchParams.get('mode');

    const resolveMode = async () => {
      if (attemptId) {
        setAttemptNotFound(false);
        try {
          const attemptRef = doc(
            db,
            'users',
            user.uid,
            'enrollment',
            courseId,
            'quizSets',
            quizId,
            'attempts',
            attemptId
          );
          const attemptSnap = await getDoc(attemptRef);
          if (cancelled) return;

          if (!attemptSnap.exists()) {
            setAttemptNotFound(true);
            setModeResolved(true);
            return;
          }

          const data = attemptSnap.data();
          const attemptAnswers: Record<string, string> = data.answers || {};
          const questionsForAttempt = allQuestions.filter((q) =>
            Object.prototype.hasOwnProperty.call(attemptAnswers, q.id)
          );

          setViewedAttempt({
            id: attemptSnap.id,
            score: data.score ?? 0,
            total: data.total ?? 0,
            completedAt: (data.completedAt as Timestamp) ?? null,
            answers: attemptAnswers,
          });
          setActiveQuestions(questionsForAttempt);
          setAnswers(attemptAnswers);
          setMode('results');
          setModeResolved(true);
        } catch (error) {
          console.error('Error loading quiz attempt:', error);
          if (!cancelled) {
            setAttemptNotFound(true);
            setModeResolved(true);
          }
        }
      } else if (modeParam === 'take') {
        setViewedAttempt(null);
        setAttemptNotFound(false);
        setActiveQuestions(allQuestions);
        setAnswers({});
        setAttemptStartTime(Date.now());
        setMode('taking');
        setModeResolved(true);
      } else {
        setViewedAttempt(null);
        setAttemptNotFound(false);
        setMode('landing');
        setModeResolved(true);
      }
    };

    resolveMode();

    return () => {
      cancelled = true;
    };
  }, [searchParams, user, loading, notFound, allQuestions, courseId, quizId]);

  const answeredCount = activeQuestions.filter((q) => !!answers[q.id]).length;
  const allAnswered = activeQuestions.length > 0 && answeredCount === activeQuestions.length;

  const score = useMemo(
    () =>
      activeQuestions.reduce(
        (count, q) => (answers[q.id] === q.correctAnswer ? count + 1 : count),
        0
      ),
    [activeQuestions, answers]
  );
  const total = activeQuestions.length;
  const missedCount = activeQuestions.filter((q) => answers[q.id] !== q.correctAnswer).length;

  // The results banner shows the loaded past attempt's saved score/total when viewing
  // history, or the freshly computed score/total right after a Submit.
  const resultsScore = viewedAttempt ? viewedAttempt.score : score;
  const resultsTotal = viewedAttempt ? viewedAttempt.total : total;

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    if (!user || !allAnswered || submitting) return;
    setSubmitting(true);

    const finalScore = activeQuestions.reduce(
      (count, q) => (answers[q.id] === q.correctAnswer ? count + 1 : count),
      0
    );

    try {
      const attemptsRef = collection(
        db,
        'users',
        user.uid,
        'enrollment',
        courseId,
        'quizSets',
        quizId,
        'attempts'
      );
      await addDoc(attemptsRef, {
        answers,
        score: finalScore,
        total: activeQuestions.length,
        completedAt: serverTimestamp(),
      });
      await fetchPastAttempts();
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    } finally {
      setSubmitting(false);
    }

    setMode('results');
    scrollToTop();
  };

  const handleRetestMissed = () => {
    const missed = activeQuestions.filter((q) => answers[q.id] !== q.correctAnswer);
    if (missed.length === 0) return;

    setActiveQuestions(missed);
    setAnswers({});
    setAttemptStartTime(Date.now());
    setViewedAttempt(null);
    setMode('taking');
    scrollToTop();
  };

  // Shared by "Take again" (landing) and "Do it again" (results) — both reset to the
  // full quiz in taking mode and sync the URL so a refresh preserves the mode.
  const handleResetToFullQuiz = () => {
    setViewedAttempt(null);
    setAttemptNotFound(false);
    setActiveQuestions(allQuestions);
    setAnswers({});
    setAttemptStartTime(Date.now());
    setMode('taking');
    router.push(`/courses/${courseId}/quizzes/${quizId}?mode=take`);
    scrollToTop();
  };

  const handleViewLastResult = () => {
    if (pastAttempts.length === 0) return;
    router.push(`/courses/${courseId}/quizzes/${quizId}?attemptId=${pastAttempts[0].id}`);
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
        <p className="text-sm text-gray-500">Loading your quiz...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-gray-700">
          Quiz not found. It may have been deleted.
        </p>
        <button
          onClick={() => router.push(`/courses/${courseId}/learning`)}
          className="mt-2 rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-[#F5F0EB]"
        >
          Back to Learning
        </button>
      </div>
    );
  }

  if (attemptNotFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-gray-700">
          Attempt not found. It may have been deleted.
        </p>
        <button
          onClick={() => router.push(`/courses/${courseId}/quizzes/${quizId}`)}
          className="mt-2 rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-[#F5F0EB]"
        >
          Back to quiz
        </button>
      </div>
    );
  }

  if (!modeResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-7 md:px-14">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[#F5F0EB]"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs text-gray-400">{courseDisplayName}</p>
            <h1 className="truncate text-xl font-bold text-[#1a1a2e]">{quizName}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 md:px-14">
        {mode === 'landing' && (
          <div className="flex flex-col gap-8 pb-10">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleResetToFullQuiz}
                className="rounded-xl bg-[#1a1a2e] px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
              >
                Take again
              </button>
              {pastAttempts.length > 0 && (
                <button
                  onClick={handleViewLastResult}
                  className="rounded-xl border border-gray-200 px-6 py-3.5 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-gray-50"
                >
                  View last result
                </button>
              )}
            </div>

            {pastAttempts.length > 0 ? (
              <div>
                <h2 className="mb-3 text-sm font-bold text-[#1a1a2e]">Past Attempts</h2>
                <div className="flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
                  {pastAttempts.map((attempt) => (
                    <button
                      key={attempt.id}
                      onClick={() =>
                        router.push(`/courses/${courseId}/quizzes/${quizId}?attemptId=${attempt.id}`)
                      }
                      className="flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[#F5F0EB]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1a1a2e]">
                          {attempt.score} out of {attempt.total} correct
                        </p>
                        <p className="text-xs text-gray-400">{formatAttemptDate(attempt.completedAt)}</p>
                      </div>
                      {attempt.total < allQuestions.length && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Partial retest
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No attempts yet</p>
            )}
          </div>
        )}

        {(mode === 'taking' || mode === 'results') && (
          <>
            {mode === 'results' && (
              <div className="mb-6">
                <QuizResults score={resultsScore} total={resultsTotal} />
              </div>
            )}

            <div key={attemptStartTime} className="flex flex-col gap-4">
              {activeQuestions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  questionNumber={index + 1}
                  selectedAnswer={answers[question.id]}
                  onSelect={(answer) => handleAnswerChange(question.id, answer)}
                  mode={mode}
                />
              ))}
            </div>

            {mode === 'taking' ? (
              <div className="mt-8 flex flex-col items-end gap-2 pb-10">
                <p className="text-xs text-gray-400">
                  {answeredCount} of {activeQuestions.length} answered
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitting}
                  className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-8 flex items-center justify-end gap-3 pb-10">
                <button
                  onClick={handleRetestMissed}
                  disabled={missedCount === 0}
                  className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Retest missed terms
                </button>
                <button
                  onClick={handleResetToFullQuiz}
                  className="rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
                >
                  Do it again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
