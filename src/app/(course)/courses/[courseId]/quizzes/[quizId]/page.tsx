'use client';

import { createAnalyticsAttemptId } from '@/src/library/analyticsContract';
import { track } from '@/src/library/analytics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { useLearningProgress } from '@/src/hooks/useLearningProgress';
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
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { refreshCourseConfidence } from '@/src/library/courseConfidenceStore';
import { getEffectiveModelKey } from '@/src/library/chatMode';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import QuestionCard from '@/src/components/quizzes/QuestionCard';
import MatchingQuestionGroup from '@/src/components/quizzes/MatchingQuestionGroup';
import QuizResults from '@/src/components/quizzes/QuizResults';
import WeakConceptModal, { type WeakConceptBusy } from '@/src/components/quizzes/WeakConceptModal';
import { missedConcepts, retryWeakSpot, type ModalConcept } from '@/src/components/quizzes/weakConceptModalView';
import {
  askedQuestionTexts,
  commitStudyTask,
  documentName,
  documentUrl,
  generateConceptFlashcards,
  generateConceptQuiz,
  nameMissedConcepts,
  practiceCounts,
  saveConceptLabels,
  todayPlanDate,
  type ConceptPracticeType,
} from '@/src/components/quizzes/weakConceptPractice';
import { usePracticeGeneration } from '@/src/hooks/usePracticeGeneration';
import { allocateConceptQuotas } from '@/src/library/generation/allocateConceptQuotas';
import { mergeAvoid, type ConceptFocus } from '@/src/library/generation/conceptFocus';
import {
  buildConceptPracticeTask,
  buildRetryWrongAnswersTasks,
} from '@/src/library/studyPlan/addSuggestionToPlan';
import { createConceptWeakSpotRepository, readConceptMastery } from '@/src/library/studyPlan/conceptWeakSpotRepository';
// Aliased: `conceptKey` is already used as a destructured field name in this file.
import { conceptKey as conceptKeyOf } from '@/src/library/studyPlan/conceptKey';
import { chooseConceptLevel } from '@/src/library/studyPlan/quizLevelLadder';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildQuizSuggestions, type QuizResultPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { useChatContext } from '@/src/hooks/useChatContext';
import PageTutorial from '@/src/components/tutorial/PageTutorial';
import courseQuizSteps from '@/src/library/tutorials/steps/course-quiz';
import { resolveActivityTarget } from '@/src/library/studyPlan/activityTarget';
import {
  learningSuggestionId,
  learningSuggestionPath,
  studyTaskPath,
} from '@/src/library/studyPlan/firestorePaths';
import { filterAvailableQuestions } from '@/src/library/studyPlan/learningSuggestionEngine';
import { DEFAULT_QUIZ_DIFFICULTY, parseQuizDifficulty, storedQuizDifficulty, difficultyLabel, type QuizDifficulty } from '@/src/library/quizDifficulty';
import { resolvePracticeQuestions } from '@/src/library/studyPlan/quizSuggestionView';
import type { QuizProgressOutcome } from '@/src/library/studyPlan/learningProgressService';
import type {
  ActivityTarget,
  ActivityType,
  ConceptWeakSpot,
  LearningSuggestionStatus,
  MissedQuestionsSuggestion,
} from '@/src/library/studyPlan/types';

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'matching';
  question: string;
  options: string[];
  correctAnswer: string;
  matchingGroupId?: string;
  bloomLevel?: string;
  concept?: string;
  explanation?: string;
}

interface PastAttempt {
  id: string;
  score: number;
  total: number;
  completedAt: Timestamp | null;
  answers: Record<string, string>;
}

type Mode = 'landing' | 'taking' | 'results';

interface LoadedPracticeTask {
  id: string;
  courseId: string;
  sourceSuggestionId: string | null;
  activityType: ActivityType;
  targetId: string | null;
  activityTarget?: ActivityTarget;
}

interface PracticeReturnLinks {
  sourceDocKey: string | null;
  resourceId: string | null;
}

const ACTIVITY_TYPES: readonly ActivityType[] = ['quiz', 'flashcards', 'reading', 'ai_explanation'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readActivityTarget(value: unknown): ActivityTarget | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'document' && typeof value.resourceId === 'string' && typeof value.sourceDocKey === 'string') {
    return { kind: 'document', resourceId: value.resourceId, sourceDocKey: value.sourceDocKey };
  }
  if (value.kind === 'flashcard_set' && typeof value.setId === 'string') {
    return {
      kind: 'flashcard_set',
      setId: value.setId,
      sourceDocKey: typeof value.sourceDocKey === 'string' ? value.sourceDocKey : null,
    };
  }
  if (
    value.kind === 'quiz' &&
    typeof value.quizId === 'string' &&
    (value.mode === 'full' || value.mode === 'missed_questions')
  ) {
    const questionIds = Array.isArray(value.questionIds)
      ? value.questionIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    return {
      kind: 'quiz',
      quizId: value.quizId,
      sourceDocKey: typeof value.sourceDocKey === 'string' ? value.sourceDocKey : null,
      mode: value.mode,
      questionIds,
    };
  }
  return undefined;
}

function readPracticeTask(id: string, data: Record<string, unknown>): LoadedPracticeTask | null {
  const activityTarget = readActivityTarget(data.activityTarget);
  const activityType = ACTIVITY_TYPES.find((type) => type === data.activityType)
    ?? (activityTarget ? 'quiz' : null);
  if (!activityType) return null;
  return {
    id,
    courseId: typeof data.courseId === 'string' ? data.courseId : '',
    sourceSuggestionId: typeof data.sourceSuggestionId === 'string' && data.sourceSuggestionId
      ? data.sourceSuggestionId
      : null,
    activityType,
    targetId: typeof data.targetId === 'string' ? data.targetId : null,
    activityTarget,
  };
}

const PRACTICE_QUESTION_LIMIT = 10;

function practiceReturnLinks(
  data: Record<string, unknown> | null,
  quizSourceKey: string | null,
): PracticeReturnLinks {
  const target = data ? readActivityTarget(data.activityTarget) : undefined;
  if (target?.kind === 'document') {
    return {
      sourceDocKey: target.sourceDocKey || quizSourceKey,
      resourceId: target.resourceId || null,
    };
  }
  if (target && (target.kind === 'quiz' || target.kind === 'flashcard_set')) {
    return { sourceDocKey: target.sourceDocKey ?? quizSourceKey, resourceId: null };
  }
  return { sourceDocKey: quizSourceKey, resourceId: null };
}

function isSuggestionStatus(value: unknown): value is LearningSuggestionStatus {
  return (
    value === 'active' ||
    value === 'added' ||
    value === 'dismissed' ||
    value === 'resolved' ||
    value === 'unavailable'
  );
}

function readStoredSuggestion(
  id: string,
  data: Record<string, unknown>,
): (MissedQuestionsSuggestion & { id: string }) | null {
  if (!isSuggestionStatus(data.status)) return null;
  const questionFailureCounts =
    isRecord(data.questionFailureCounts)
      ? Object.fromEntries(
          Object.entries(data.questionFailureCounts).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : {};
  return {
    id,
    type: 'missed_questions',
    courseId: typeof data.courseId === 'string' ? data.courseId : '',
    sourceDocKey: typeof data.sourceDocKey === 'string' ? data.sourceDocKey : null,
    quizId: typeof data.quizId === 'string' ? data.quizId : '',
    questionIds: Array.isArray(data.questionIds)
      ? data.questionIds.filter((item): item is string => typeof item === 'string')
      : [],
    questionFailureCounts,
    status: data.status,
    priority: typeof data.priority === 'number' ? data.priority : 0,
    linkedTaskId: typeof data.linkedTaskId === 'string' ? data.linkedTaskId : null,
    sourceAttemptId: typeof data.sourceAttemptId === 'string' ? data.sourceAttemptId : '',
  };
}

async function persistUnavailableSuggestion(
  uid: string,
  courseId: string,
  quizId: string,
  preferredSuggestionId: string | null,
  availableIds: Set<string>,
): Promise<string | null> {
  const ids = [...new Set(
    [preferredSuggestionId, learningSuggestionId(courseId, quizId)].filter(
      (id): id is string => Boolean(id),
    ),
  )];
  let sourceDocKey: string | null = null;
  for (const id of ids) {
    const suggestionRef = doc(db, learningSuggestionPath(uid, id));
    const snap = await getDoc(suggestionRef);
    if (!snap.exists()) continue;
    const raw: unknown = snap.data();
    const data = isRecord(raw) ? raw : null;
    if (!data) continue;
    const suggestion = readStoredSuggestion(id, data);
    if (!suggestion) continue;
    sourceDocKey ??= suggestion.sourceDocKey;
    const filtered = filterAvailableQuestions(suggestion, availableIds);
    if (filtered.status !== 'unavailable') continue;
    if (suggestion.status === 'unavailable' && suggestion.questionIds.length === 0) continue;
    await updateDoc(suggestionRef, {
      status: 'unavailable',
      questionIds: filtered.questionIds,
      priority: filtered.priority,
      updatedAt: serverTimestamp(),
    });
  }
  return sourceDocKey;
}

function taskPointsAtQuiz(task: LoadedPracticeTask, courseId: string, quizId: string): boolean {
  if (task.courseId !== courseId) return false;
  const target = resolveActivityTarget(task);
  return Boolean(target && target.kind === 'quiz' && target.quizId === quizId);
}

function acceptedQuizTarget(
  task: LoadedPracticeTask,
  courseId: string,
  quizId: string,
): Extract<ActivityTarget, { kind: 'quiz' }> | null {
  if (!taskPointsAtQuiz(task, courseId, quizId)) return null;
  const target = resolveActivityTarget(task);
  if (!target || target.kind !== 'quiz' || target.mode !== 'missed_questions') return null;
  return target;
}

function isFullQuestionSet(
  active: readonly { id: string }[],
  all: readonly { id: string }[],
): boolean {
  if (active.length !== all.length) return false;
  const ids = new Set(active.map((question) => question.id));
  return all.every((question) => ids.has(question.id));
}

function limitPracticeQuestions<T extends { id: string }>(
  questions: readonly T[],
  questionIds: readonly string[] | undefined,
): T[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const limited: T[] = [];
  for (const questionId of questionIds ?? []) {
    const question = byId.get(questionId);
    if (!question) continue;
    limited.push(question);
    if (limited.length === PRACTICE_QUESTION_LIMIT) break;
  }
  return limited;
}

function storageKeyFromUrl(url: string): string {
  const key = url.split('key=')[1] ?? '';
  if (!key) return '';
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function resourceIdForSource(
  sourceDocKey: string | null,
  explicitResourceId: string | null,
  documents: readonly { resourceId: string; url: string }[],
): string | null {
  if (explicitResourceId) return explicitResourceId;
  if (!sourceDocKey) return null;
  const match = documents.find((document) => {
    if (document.resourceId === sourceDocKey || document.url === sourceDocKey) return true;
    const key = storageKeyFromUrl(document.url);
    return key !== '' && key === sourceDocKey;
  });
  return match?.resourceId ?? null;
}

function resolveCourseResourceId(
  sourceDocKey: string | null,
  explicitResourceId: string | null,
  quizSourceKey: string | null,
  quizResourceId: string | null,
  documents: readonly { resourceId: string; url: string }[],
): string | null {
  if (explicitResourceId) return explicitResourceId;
  if (quizResourceId && (!sourceDocKey || sourceDocKey === quizSourceKey)) return quizResourceId;
  return resourceIdForSource(sourceDocKey, null, documents);
}

function courseHref(courseId: string, resourceId: string | null): string {
  if (!resourceId) return `/courses/${courseId}`;
  return `/courses/${courseId}?resourceId=${encodeURIComponent(resourceId)}`;
}

async function acceptedSubmitTaskId(
  uid: string,
  taskId: string | null,
  courseId: string,
  quizId: string,
): Promise<string | null> {
  if (!taskId) return null;
  try {
    const taskSnap = await getDoc(doc(db, studyTaskPath(uid, taskId)));
    if (!taskSnap.exists()) return null;
    const raw: unknown = taskSnap.data();
    const data = isRecord(raw) ? raw : null;
    const task = data ? readPracticeTask(taskSnap.id, data) : null;
    if (!task || !taskPointsAtQuiz(task, courseId, quizId)) return null;
    return task.id;
  } catch (error) {
    console.error('Error loading quiz task:', error);
    return null;
  }
}

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
  const { submitQuiz, recordNamedMisses } = useLearningProgress();

  const { displayName: courseDisplayName, courseCode, className } = useCourseInfo(courseId);
  const practiceGeneration = usePracticeGeneration(courseId);

  const [quizName, setQuizName] = useState('Quiz');
  const [quizDifficulty, setQuizDifficulty] = useState<QuizDifficulty | null>(null);
  const [quizMixedLevels, setQuizMixedLevels] = useState(false);
  // Where the quiz came from, so "New questions" can build a fresh set from the same file.
  const [quizSource, setQuizSource] = useState<{ key: string; questionTypes: unknown } | null>(null);
  const [quizResourceId, setQuizResourceId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quizDocumentMissing, setQuizDocumentMissing] = useState(false);

  const [mode, setMode] = useState<Mode>('landing');
  const [modeResolved, setModeResolved] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptStartTime, setAttemptStartTime] = useState<number>(Date.now());
  const [submitting, setSubmitting] = useState(false);

  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [attemptsLoaded, setAttemptsLoaded] = useState(false);
  const [viewedAttempt, setViewedAttempt] = useState<PastAttempt | null>(null);
  const [attemptNotFound, setAttemptNotFound] = useState(false);
  const [practiceTask, setPracticeTask] = useState<{ id: string; sourceSuggestionId: string | null } | null>(null);
  const [practiceUnavailable, setPracticeUnavailable] = useState<PracticeReturnLinks | null>(null);
  const [quizOutcome, setQuizOutcome] = useState<QuizProgressOutcome | null>(null);

  // The post-quiz modal. The score renders at once; concept names fill in when naming returns.
  const [weakModalOpen, setWeakModalOpen] = useState(false);
  const [namedLabels, setNamedLabels] = useState<Record<string, string>>({});
  const [namingInFlight, setNamingInFlight] = useState(false);
  const [openWeakSpots, setOpenWeakSpots] = useState<ConceptWeakSpot[]>([]);
  const [modalBusy, setModalBusy] = useState<WeakConceptBusy>(null);
  const modalBusyRef = useRef(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const namingRunRef = useRef(0);
  // Keyed by what was queued, so a second tap returns the first task instead of adding another.
  const queuedTaskIdsRef = useRef(new Map<string, string>());

  const [catalystOpen, setCatalystOpen] = useState(false);
  const catalystBtnRef = useRef<HTMLButtonElement | null>(null);
  
  // Build the same ChatContext shape the full AI Assistant uses, so the
  // Catalyst sidebar can fall back to read_document/search_documents for
  // this course's materials.
  const catalystChatContext = useChatContext(user?.uid, user?.email);

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
      setQuizDocumentMissing(false);

      try {
        const quizRef = doc(db, 'users', user.uid, 'enrollment', courseId, 'quizSets', quizId);
        const quizSnap = await getDoc(quizRef);

        if (!quizSnap.exists()) {
          setQuizDocumentMissing(true);
          setAllQuestions([]);
          setActiveQuestions([]);
          setQuizSource(null);
          setQuizResourceId(null);
          setLoading(false);
          return;
        }
        setQuizDocumentMissing(false);

        const data = quizSnap.data();
        const questions: QuizQuestion[] = data.questions || [];

        setQuizName(data.name || 'Quiz');
        setQuizDifficulty(storedQuizDifficulty(data.difficulty));
        setQuizMixedLevels(data.mixedLevels === true);
        setQuizSource(
          typeof data.sourceDocKey === 'string' && data.sourceDocKey
            ? { key: data.sourceDocKey, questionTypes: data.questionTypes }
            : null
        );
        setQuizResourceId(typeof data.resourceId === 'string' && data.resourceId ? data.resourceId : null);
        setAllQuestions(questions);
        setActiveQuestions(questions);
      } catch (error) {
        console.error('Error loading quiz set:', error);
        setQuizDocumentMissing(false);
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
    } finally {
      setAttemptsLoaded(true);
    }
  };

  // Load the list of past attempts once the quiz set is loaded
  useEffect(() => {
    if (!user || loading || notFound || quizDocumentMissing) return;
    fetchPastAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId, quizId, loading, notFound, quizDocumentMissing]);

  // Resolve mode from the URL — no params -> landing, ?mode=take -> full quiz,
  // ?mode=practice&taskId= -> missed-question practice, ?attemptId= -> results.
  useEffect(() => {
    if (!user || loading) return;
    if (notFound && !quizDocumentMissing) return;

    let cancelled = false;
    const attemptId = searchParams.get('attemptId');
    const modeParam = searchParams.get('mode');

    const resolveMode = async () => {
      if (quizDocumentMissing && modeParam !== 'practice') {
        setPracticeTask(null);
        setPracticeUnavailable(null);
        setNotFound(true);
        setModeResolved(true);
        return;
      }
      if (attemptId && !quizDocumentMissing) {
        setPracticeTask(null);
        setPracticeUnavailable(null);
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
      } else if (modeParam === 'practice') {
        setNotFound(false);
        setViewedAttempt(null);
        setAttemptNotFound(false);
        const taskId = searchParams.get('taskId');
        let links = practiceReturnLinks(null, quizSource?.key ?? null);
        let accepted: { id: string; sourceSuggestionId: string | null } | null = null;
        let suggestionId: string | null = null;
        let requestedQuestionIds: string[] = [];
        let questions: QuizQuestion[] = [];

        if (taskId) {
          try {
            const taskSnap = await getDoc(doc(db, studyTaskPath(user.uid, taskId)));
            if (cancelled) return;
            if (taskSnap.exists()) {
              const raw: unknown = taskSnap.data();
              const data = isRecord(raw) ? raw : null;
              links = practiceReturnLinks(data, quizSource?.key ?? null);
              const task = data ? readPracticeTask(taskSnap.id, data) : null;
              const target = task ? acceptedQuizTarget(task, courseId, quizId) : null;
              if (task && target) {
                suggestionId = task.sourceSuggestionId;
                requestedQuestionIds = target.questionIds ?? [];
                questions = limitPracticeQuestions(
                  resolvePracticeQuestions(allQuestions, target),
                  target.questionIds,
                );
                if (questions.length > 0) {
                  accepted = { id: task.id, sourceSuggestionId: task.sourceSuggestionId };
                }
              }
            }
          } catch (error) {
            console.error('Error loading practice task:', error);
          }
        }

        if (cancelled) return;
        const targetsMissing = requestedQuestionIds.length > 0 && questions.length === 0;
        if (!accepted && (quizDocumentMissing || targetsMissing)) {
          try {
            const sourceDocKey = await persistUnavailableSuggestion(
              user.uid,
              courseId,
              quizId,
              suggestionId,
              new Set(allQuestions.map((question) => question.id)),
            );
            if (!links.sourceDocKey && sourceDocKey) {
              links = { sourceDocKey, resourceId: links.resourceId };
            }
          } catch (error) {
            console.error('Error updating practice suggestion:', error);
          }
        }

        if (cancelled) return;
        if (accepted) {
          setPracticeTask(accepted);
          setPracticeUnavailable(null);
          setActiveQuestions(questions);
          setAnswers({});
          setAttemptStartTime(Date.now());
          setMode('taking');
        } else {
          setPracticeTask(null);
          setActiveQuestions([]);
          setPracticeUnavailable(links);
          setMode('landing');
        }
        setModeResolved(true);
      } else if (modeParam === 'take') {
        setPracticeTask(null);
        setPracticeUnavailable(null);
        setViewedAttempt(null);
        setAttemptNotFound(false);
        setActiveQuestions(allQuestions);
        setAnswers({});
        setAttemptStartTime(Date.now());
        setMode('taking');
        setModeResolved(true);
      } else {
        setPracticeTask(null);
        setPracticeUnavailable(null);
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
  }, [searchParams, user, loading, notFound, quizDocumentMissing, allQuestions, courseId, quizId, quizSource]);

  const analyticsAttempt = useRef({
    key: '',
    startedAtMs: 0,
    isActive: false,
  });

  useEffect(() => {
    if (mode !== 'taking') {
      analyticsAttempt.current.isActive = false;
      return;
    }

    const isReadyToStart = modeResolved && activeQuestions.length > 0;
    if (!isReadyToStart || analyticsAttempt.current.isActive) return;

    analyticsAttempt.current = {
      key: createAnalyticsAttemptId(),
      startedAtMs: Date.now(),
      isActive: true,
    };
    const isTargetedPractice = practiceTask !== null || !isFullQuestionSet(activeQuestions, allQuestions);
    void track(
      'quiz_started',
      {
        quiz_type: isTargetedPractice ? 'targeted_practice' : 'full_quiz',
        question_count: activeQuestions.length,
      },
      analyticsAttempt.current.key,
    );
  }, [mode, modeResolved, activeQuestions, allQuestions, practiceTask]);
  // The landing page (Take again / Past Attempts) used to sit between the quiz
  // list and the thing the user came for. A bare /quizzes/<id> now goes straight
  // to the newest result, or straight into the questions when the quiz has never
  // been taken. The page's own result screen already offers "Do it again",
  // practice and the other follow-ups, so nothing is lost.
  //
  // `landing` still renders when a practice task is unavailable (that state needs
  // its message) and when the set has no questions to take and no attempts to show.
  const landingSkippable =
    mode === 'landing' &&
    !practiceUnavailable &&
    !attemptNotFound &&
    !searchParams.get('attemptId') &&
    !searchParams.get('mode') &&
    (pastAttempts.length > 0 || allQuestions.length > 0);

  useEffect(() => {
    if (!modeResolved || !attemptsLoaded || !landingSkippable) return;
    const base = `/courses/${courseId}/quizzes/${quizId}`;
    router.replace(
      pastAttempts.length > 0 ? `${base}?attemptId=${pastAttempts[0].id}` : `${base}?mode=take`,
    );
  }, [modeResolved, attemptsLoaded, landingSkippable, pastAttempts, courseId, quizId, router]);

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
  // history, the saved submitQuiz outcome right after a Submit, or the live tally
  // if saving has not returned an attempt yet.
  const resultsScore = viewedAttempt ? viewedAttempt.score : (quizOutcome?.score ?? score);
  const resultsTotal = viewedAttempt ? viewedAttempt.total : (quizOutcome?.total ?? total);
  const courseDocuments = catalystChatContext?.classes.find((item) => item.classId === courseId)?.documents ?? [];

  const attemptConcepts = useMemo(
    () => missedConcepts(activeQuestions, answers, namedLabels, openWeakSpots),
    [activeQuestions, answers, namedLabels, openWeakSpots],
  );
  const retrySpot = retryWeakSpot(
    openWeakSpots,
    attemptConcepts.concepts.map((concept) => concept.conceptKey),
  );
  const showWeakModal = mode === 'results' && weakModalOpen && !viewedAttempt;

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
    setQuizOutcome(null);
    let savedAttemptId: string | null = null;

    try {
      const linkedTaskId = practiceTask
        ? practiceTask.id
        : await acceptedSubmitTaskId(user.uid, searchParams.get('taskId'), courseId, quizId);
      const result = await submitQuiz({
        courseId,
        quizId,
        attemptType: practiceTask || !isFullQuestionSet(activeQuestions, allQuestions)
          ? 'targeted_practice'
          : 'full_quiz',
        taskId: linkedTaskId,
        suggestionId: practiceTask?.sourceSuggestionId ?? null,
        answers,
        questions: activeQuestions,
      });
      if (result.attemptId && analyticsAttempt.current.key) {
        const isTargetedPractice = practiceTask !== null || !isFullQuestionSet(activeQuestions, allQuestions);
        const elapsedSeconds = (Date.now() - analyticsAttempt.current.startedAtMs) / 1000;
        void track(
          'quiz_completed',
          {
            quiz_type: isTargetedPractice ? 'targeted_practice' : 'full_quiz',
            question_count: activeQuestions.length,
            duration_seconds: Math.max(0, elapsedSeconds),
          },
          analyticsAttempt.current.key,
        );
      }
      setQuizOutcome(result.attemptId ? result : null);
      savedAttemptId = result.attemptId || null;
      await fetchPastAttempts();
      // Best-effort: the AI assistant's sense of how the student is doing.
      refreshCourseConfidence(user.uid, courseId).catch((e) => console.error('Refreshing course confidence failed:', e));
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    } finally {
      setSubmitting(false);
    }

    setMode('results');
    setNamedLabels({});
    setOpenWeakSpots([]);
    setModalError(null);
    practiceGeneration.clearError();
    setPlanNotice(null);
    setWeakModalOpen(true);
    void nameAttemptConcepts(user.uid, savedAttemptId, activeQuestions, answers);
    scrollToTop();
  };

  // Runs behind the open modal. A failed load or naming call leaves the misses
  // listed as unnamed, so the modal keeps its "still working out" copy.
  const nameAttemptConcepts = async (
    uid: string,
    attemptId: string | null,
    questions: QuizQuestion[],
    attemptAnswers: Record<string, string>,
  ) => {
    const run = ++namingRunRef.current;
    let spots: ConceptWeakSpot[] = [];
    try {
      spots = await createConceptWeakSpotRepository(uid).listOpen(courseId);
    } catch (error) {
      console.error('Loading weak spots failed:', error);
    }
    if (run !== namingRunRef.current) return;
    setOpenWeakSpots(spots);

    const unnamed = new Set(missedConcepts(questions, attemptAnswers, {}, spots).unnamedIds);
    if (unnamed.size === 0) return;
    setNamingInFlight(true);
    try {
      const labels = await nameMissedConcepts(
        questions.filter((question) => unnamed.has(question.id)),
        spots,
      );
      if (run !== namingRunRef.current) return;
      setNamedLabels(labels);
      saveConceptLabels(uid, courseId, quizId, labels).catch((error) =>
        console.error('Saving concept labels failed:', error),
      );
      // The attempt was processed before these names existed, so its misses on these
      // questions are recorded now. The attempt is marked, so this happens once.
      if (attemptId && Object.keys(labels).length > 0) {
        recordNamedMisses({ courseId, quizId, attemptId, labels })
          .then(async (status) => {
            if (status !== 'recorded' || run !== namingRunRef.current) return;
            const refreshed = await createConceptWeakSpotRepository(uid).listOpen(courseId);
            if (run === namingRunRef.current) setOpenWeakSpots(refreshed);
          })
          .catch((error) => console.error('Recording named misses failed:', error));
      }
    } catch (error) {
      console.error('Naming concepts failed:', error);
    } finally {
      if (run === namingRunRef.current) setNamingInFlight(false);
    }
  };

  const closeWeakModal = useCallback(() => {
    setWeakModalOpen(false);
    setModalError(null);
  }, []);

  const courseForTasks = { name: className || 'Course', code: courseCode || 'Course' };

  const conceptSourceKeys = (concepts: ModalConcept[]): string[] => {
    const keys = new Set(concepts.map((concept) => concept.conceptKey));
    return [...new Set([
      ...(quizSource?.key ? [quizSource.key] : []),
      ...openWeakSpots.filter((spot) => keys.has(spot.conceptKey)).flatMap((spot) => spot.sourceDocKeys),
    ])];
  };

  const conceptFocus = async (type: ConceptPracticeType): Promise<{ focus: ConceptFocus; totalItems: number } | null> => {
    const counts = practiceCounts(type);
    const { quotas, totalItems } = allocateConceptQuotas(
      attemptConcepts.concepts.map(({ conceptKey, label, missCount }) => ({ conceptKey, label, missCount })),
      counts.requested,
      counts.max,
    );
    if (quotas.length === 0) return null;
    // This quiz's questions go first, so they survive the route's cap on the avoid list.
    const current = allQuestions.map((question) => question.question).filter(Boolean);
    const asked = user
      ? await askedQuestionTexts(user.uid, courseId, conceptSourceKeys(attemptConcepts.concepts)).catch((error) => {
          console.error('Loading earlier questions failed:', error);
          return [];
        })
      : [];
    // Every concept here is one the student just missed, so it is asked at the level the ladder
    // gives it rather than the generator's `exam` default. Without mastery the ladder's entry
    // level is `review`, which is the right place to restart a concept you got wrong.
    const stored = user
      ? await readConceptMastery(user.uid, courseId).catch((error) => {
          console.error('Loading concept mastery failed:', error);
          return new Map<string, { value: number; lastAskedLevel: QuizDifficulty | null }>();
        })
      : new Map<string, { value: number; lastAskedLevel: QuizDifficulty | null }>();
    const leveled = quotas.map((quota) => {
      const mastery = stored.get(conceptKeyOf(quota.conceptKey));
      return {
        ...quota,
        level: chooseConceptLevel({
          conceptMastery: mastery?.value ?? null,
          documentMastery: null,
          lastAskedLevel: mastery?.lastAskedLevel ?? null,
          // This attempt's miss count is not the cross-attempt repeat signal the hold wants.
          repeatMissCount: 0,
          daysUntilExam: null,
        }),
      };
    });
    return {
      focus: { quotas: leveled, avoid: mergeAvoid(current, asked) },
      totalItems,
    };
  };

  const beginModalAction = (busy: NonNullable<WeakConceptBusy>): boolean => {
    if (modalBusyRef.current) return false;
    modalBusyRef.current = true;
    setModalBusy(busy);
    setModalError(null);
    practiceGeneration.clearError();
    return true;
  };

  const endModalAction = () => {
    modalBusyRef.current = false;
    setModalBusy(null);
  };

  // Generates first and routes only once the new set exists. A failure leaves
  // the weak spots as they are and keeps the modal open to try again.
  const handleStartConceptPractice = async (type: ConceptPracticeType) => {
    if (!user || !beginModalAction({ action: 'start', type })) return;
    try {
      const planned = await conceptFocus(type);
      const sourceDocKey = conceptSourceKeys(attemptConcepts.concepts)[0] ?? null;
      if (!planned) throw new Error('There are no concepts to practice yet.');
      if (!sourceDocKey) throw new Error("Couldn't find the source document for this quiz.");
      const { focus, totalItems } = planned;

      let route: string | null = null;
      if (type === 'quiz') {
        // Pinned: a set the student asked for from this modal belongs in the course sidebar.
        const setId = await generateConceptQuiz({ uid: user.uid, courseId, sourceDocKey, focus, pinned: true });
        route = `/courses/${courseId}/quizzes/${setId}?mode=take`;
      } else if (type === 'flashcards') {
        const setId = await generateConceptFlashcards({ uid: user.uid, courseId, sourceDocKey, focus, count: totalItems });
        route = `/courses/${courseId}/flashcards/${setId}`;
      } else {
        const setId = await practiceGeneration.generate({
          source: { sourceDocKey, name: documentName(sourceDocKey), url: documentUrl(sourceDocKey) },
          kind: type,
          count: totalItems,
          difficulty: DEFAULT_QUIZ_DIFFICULTY,
          avoid: focus.avoid,
          focus,
        });
        if (setId) route = `/courses/${courseId}/practice/${setId}`;
      }

      if (!route) {
        endModalAction();
        return;
      }
      router.push(route);
    } catch (error) {
      console.error('Starting concept practice failed:', error);
      setModalError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      endModalAction();
    }
  };

  const handlePlanConceptPractice = async (type: ConceptPracticeType) => {
    if (!user || !beginModalAction({ action: 'plan', type })) return;
    try {
      const planned = await conceptFocus(type);
      if (!planned) throw new Error('There are no concepts to practice yet.');
      const planDate = todayPlanDate();
      const draft = buildConceptPracticeTask({
        courseId,
        course: courseForTasks,
        planDate,
        quotas: planned.focus.quotas,
        sourceDocKeys: conceptSourceKeys(attemptConcepts.concepts),
        practiceType: type,
      });
      const queueKey = `${type}:${planned.focus.quotas.map((quota) => quota.conceptKey).join('|')}`;
      const taskId = await commitStudyTask({
        uid: user.uid,
        courseId,
        suggestionKey: `concept-practice-${quizId}`,
        course: courseForTasks,
        planDate,
        draft,
        existingTaskId: queuedTaskIdsRef.current.get(queueKey) ?? null,
      });
      if (!taskId) throw new Error("Couldn't add this to your plan. Please try again.");
      queuedTaskIdsRef.current.set(queueKey, taskId);
      endModalAction();
      closeWeakModal();
      setPlanNotice('Added to your study plan.');
    } catch (error) {
      console.error('Adding concept practice to the plan failed:', error);
      setModalError(error instanceof Error ? error.message : "Couldn't add this to your plan. Please try again.");
      endModalAction();
    }
  };

  const handleRetryWrongAnswers = async () => {
    if (!user || !retrySpot || !beginModalAction({ action: 'retry' })) return;
    try {
      const planDate = todayPlanDate();
      const drafts = buildRetryWrongAnswersTasks(retrySpot, courseForTasks, planDate);
      let saved = 0;
      for (const draft of drafts) {
        const target = draft.activityTarget;
        if (target.kind !== 'quiz') continue;
        const queueKey = `retry:${target.quizId}:${(target.questionIds ?? []).join('|')}`;
        const taskId = await commitStudyTask({
          uid: user.uid,
          courseId,
          suggestionKey: target.quizId,
          course: courseForTasks,
          planDate,
          draft,
          existingTaskId: queuedTaskIdsRef.current.get(queueKey) ?? null,
        });
        if (!taskId) continue;
        queuedTaskIdsRef.current.set(queueKey, taskId);
        saved += 1;
      }
      if (saved === 0) throw new Error("Couldn't add these questions to your plan. Please try again.");
      endModalAction();
      closeWeakModal();
      setPlanNotice(saved === 1 ? 'Added your wrong answers to your study plan.' : `Added ${saved} retry tasks to your study plan.`);
    } catch (error) {
      console.error('Adding retry tasks failed:', error);
      setModalError(error instanceof Error ? error.message : "Couldn't add these questions to your plan. Please try again.");
      endModalAction();
    }
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
    setPracticeTask(null);
    setPracticeUnavailable(null);
    setViewedAttempt(null);
    setAttemptNotFound(false);
    setActiveQuestions(allQuestions);
    setAnswers({});
    setAttemptStartTime(Date.now());
    setMode('taking');
    router.push(`/courses/${courseId}/quizzes/${quizId}?mode=take`);
    scrollToTop();
  };

  // A new quiz set from the same file that avoids this quiz's questions. It's a
  // separate set (not an overwrite) so this quiz's attempt history stays intact.
  const handleNewQuestions = async () => {
    if (!user || !quizSource || regenerating) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const docName = quizSource.key.split('/').pop()?.replace(/^\d+[-_]/, '') || 'document';
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl: `/api/download?key=${encodeURIComponent(quizSource.key)}`,
          docName,
          questionCount: allQuestions.length || 10,
          questionTypes: quizSource.questionTypes,
          difficulty: quizDifficulty ?? DEFAULT_QUIZ_DIFFICULTY,
          modelKey: getEffectiveModelKey('quiz'),
          avoidQuestions: allQuestions.map((q) => q.question).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate new questions.');

      const baseName = quizName.replace(/\s*\(new questions(?: \d+)?\)$/i, '');
      const newDoc = await addDoc(collection(db, 'users', user.uid, 'enrollment', courseId, 'quizSets'), {
        name: `${baseName} (new questions)`,
        sourceDocKey: quizSource.key,
        questions: data.questions,
        questionTypes: quizSource.questionTypes ?? null,
        difficulty: parseQuizDifficulty(data.difficulty),
        questionCount: data.questions.length,
        pinned: true,
        visibility: 'private',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/courses/${courseId}/quizzes/${newDoc.id}`);
    } catch (error) {
      console.error('Error generating new questions:', error);
      setRegenerateError(error instanceof Error ? error.message : 'Failed to generate new questions.');
    } finally {
      setRegenerating(false);
    }
  };

  const newQuestionsButton = quizSource ? (
    <button
      onClick={handleNewQuestions}
      disabled={regenerating}
      title="Make a new quiz from the same file, with different questions"
      className="inline-flex items-center gap-2 rounded-xl border border-border-light px-5 py-2.5 text-sm font-semibold text-text-main transition-colors hover:bg-bg-warm disabled:cursor-wait disabled:opacity-60"
    >
      {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {regenerating ? 'Writing new questions…' : 'New questions'}
    </button>
  ) : null;

  const regenerateErrorNote = regenerateError ? (
    <p className="w-full text-sm text-red-600">{regenerateError}</p>
  ) : null;

  const handleViewLastResult = () => {
    if (pastAttempts.length === 0) return;
    router.push(`/courses/${courseId}/quizzes/${quizId}?attemptId=${pastAttempts[0].id}`);
  };

  const quizPageContext: QuizResultPageContext | null =
    mode === 'results' && activeQuestions.length > 0
      ? {
          kind: 'quiz_result',
          courseId,
          quizName,
          score: resultsScore,
          total: activeQuestions.length,
          questions: activeQuestions.map((q) => ({
            question: q.question,
            selectedAnswer: answers[q.id] || '',
            correctAnswer: q.correctAnswer,
            isCorrect: answers[q.id] === q.correctAnswer,
          })),
        }
      : null;

  const catalystSuggestions = quizPageContext ? buildQuizSuggestions(quizPageContext) : [];

  // Standard questions render one-per-QuestionCard; matching questions are
  // grouped by matchingGroupId into one MatchingQuestionGroup each, ordered
  // by the first appearance of that group in activeQuestions.
  type RenderItem =
    | { kind: 'standard'; question: QuizQuestion & { type: 'multiple_choice' | 'true_false' } }
    | { kind: 'matching'; groupId: string; questions: QuizQuestion[] };

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    const groupIndex = new Map<string, number>();

    for (const q of activeQuestions) {
      if (q.type === 'matching' && q.matchingGroupId) {
        const idx = groupIndex.get(q.matchingGroupId);
        if (idx === undefined) {
          groupIndex.set(q.matchingGroupId, items.length);
          items.push({ kind: 'matching', groupId: q.matchingGroupId, questions: [q] });
        } else {
          const item = items[idx];
          if (item.kind === 'matching') item.questions.push(q);
        }
      } else if (q.type !== 'matching') {
        items.push({
          kind: 'standard',
          question: q as QuizQuestion & { type: 'multiple_choice' | 'true_false' },
        });
      }
    }
    return items;
  }, [activeQuestions]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg-main">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
        <p className="text-sm text-text-muted">Loading your quiz...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-main px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-text-main">
          Quiz not found. It may have been deleted.
        </p>
        <button
          onClick={() => router.push(`/courses/${courseId}/learning`)}
          className="mt-2 rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-bg-warm"
        >
          Back to Learning
        </button>
      </div>
    );
  }

  if (attemptNotFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-main px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-text-main">
          Attempt not found. It may have been deleted.
        </p>
        <button
          onClick={() => router.push(`/courses/${courseId}/quizzes/${quizId}`)}
          className="mt-2 rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-bg-warm"
        >
          Back to quiz
        </button>
      </div>
    );
  }

  if (!modeResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  if (practiceUnavailable) {
    const resourceId = resolveCourseResourceId(
      practiceUnavailable.sourceDocKey,
      practiceUnavailable.resourceId,
      quizSource?.key ?? null,
      quizResourceId,
      courseDocuments,
    );
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-main px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-text-main">
          This practice quiz is unavailable.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/learning"
            className="rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-bg-warm"
          >
            Back to Learning
          </Link>
          <Link
            href={courseHref(courseId, resourceId)}
            className="rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-bg-warm"
          >
            {resourceId ? 'Open source document' : 'Back to course'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <PageTutorial id="course-quiz" steps={courseQuizSteps} />
      {/* Header */}
      <div className="relative flex h-[60px] items-center border-b border-border-light px-6 md:px-14">
        <div className="relative z-10 flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-bg-warm"
          >
            <ArrowLeft size={20} className="text-text-main" />
          </button>
        </div>
        <div className="pointer-events-none absolute inset-x-16 min-w-0 text-center md:inset-x-28" data-tutorial="course-quiz-heading">
          <p className="truncate text-xs text-text-muted">{courseDisplayName}</p>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-bold text-text-main">{quizName}</h1>
            {quizDifficulty && (
              <span className="shrink-0 rounded-full border border-border-light px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {difficultyLabel(quizDifficulty)}
              </span>
            )}
            {quizDifficulty && quizMixedLevels && (
              <span className="shrink-0 rounded-full border border-border-light px-2 py-0.5 text-[11px] font-medium text-text-muted">
                Mixed levels
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 md:px-14">
        {mode === 'landing' && !landingSkippable && (
          <div className="flex flex-col gap-8 pb-10">
            <div className="flex flex-wrap items-center gap-3" data-tutorial="course-quiz-actions">
              <button
                onClick={handleResetToFullQuiz}
                className="rounded-xl bg-[#1a1a2e] px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
              >
                Take again
              </button>
              {pastAttempts.length > 0 && (
                <button
                  onClick={handleViewLastResult}
                  className="rounded-xl border border-border-light px-6 py-3.5 text-sm font-semibold text-text-main transition-colors hover:bg-bg-warm"
                >
                  View last result
                </button>
              )}
              {newQuestionsButton}
              {regenerateErrorNote}
            </div>

            {pastAttempts.length > 0 ? (
              <div>
                <h2 className="mb-3 text-sm font-bold text-text-main">Past Attempts</h2>
                <div className="flex flex-col divide-y divide-border-light rounded-2xl border border-border-light bg-bg-container">
                  {pastAttempts.map((attempt) => (
                    <button
                      key={attempt.id}
                      onClick={() =>
                        router.push(`/courses/${courseId}/quizzes/${quizId}?attemptId=${attempt.id}`)
                      }
                      className="flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-bg-warm"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-main">
                          {attempt.score} out of {attempt.total} correct
                        </p>
                        <p className="text-xs text-text-muted">{formatAttemptDate(attempt.completedAt)}</p>
                      </div>
                      {attempt.total < allQuestions.length && (
                        <span className="shrink-0 rounded-full bg-bg-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          Partial retest
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No attempts yet</p>
            )}
          </div>
        )}

        {landingSkippable && (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        )}

        {(mode === 'taking' || mode === 'results') && (
          <>
            {mode === 'results' && (
              <div className="mb-6" data-tutorial="course-quiz-actions">
                <QuizResults score={resultsScore} total={resultsTotal} />
                {planNotice && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border-light bg-bg-container px-5 py-3 text-sm text-text-main" role="status">
                    <span>{planNotice}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link href="/learning" className="font-semibold underline-offset-2 hover:underline">
                        Open study plan
                      </Link>
                      <button type="button" onClick={() => setPlanNotice(null)} className="text-text-muted hover:text-text-main" aria-label="Dismiss">
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div key={attemptStartTime} className="flex flex-col gap-4">
              {renderItems.map((item, index) =>
                item.kind === 'standard' ? (
                  <QuestionCard
                    key={item.question.id}
                    question={item.question}
                    questionNumber={index + 1}
                    selectedAnswer={answers[item.question.id]}
                    onSelect={(answer) => handleAnswerChange(item.question.id, answer)}
                    mode={mode}
                  />
                ) : (
                  <MatchingQuestionGroup
                    key={item.groupId}
                    questions={item.questions}
                    answers={answers}
                    onSelect={handleAnswerChange}
                    mode={mode}
                  />
                )
              )}
            </div>

            {mode === 'taking' ? (
              <div className="mt-8 flex flex-col items-end gap-2 pb-10" data-tutorial="course-quiz-actions">
                <p className="text-xs text-text-muted">
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
              <div className="mt-8 flex flex-wrap items-center justify-end gap-3 pb-10">
                {regenerateErrorNote}
                {newQuestionsButton}
                <button
                  onClick={handleRetestMissed}
                  disabled={missedCount === 0}
                  className="rounded-xl border border-border-light px-5 py-2.5 text-sm font-semibold text-text-main transition-colors hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-40"
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

      {showWeakModal && (
        <WeakConceptModal
          quizName={quizName}
          score={resultsScore}
          total={resultsTotal}
          concepts={attemptConcepts.concepts}
          namingPending={attemptConcepts.unnamedIds.length > 0}
          namingInFlight={namingInFlight}
          busy={modalBusy}
          error={modalError ?? practiceGeneration.error}
          canRetry={retrySpot !== null}
          onClose={closeWeakModal}
          onStart={handleStartConceptPractice}
          onPlan={handlePlanConceptPractice}
          onRetry={handleRetryWrongAnswers}
        />
      )}

      {mode === 'results' && quizPageContext && catalystChatContext && (
        <>
          <CatalystLauncher onClick={() => setCatalystOpen(true)} visible={!catalystOpen} buttonRef={catalystBtnRef} />
          <ContextualAiPanel
            open={catalystOpen}
            onClose={() => setCatalystOpen(false)}
            contextLabel={`Quiz Results — ${resultsScore}/${activeQuestions.length}`}
            suggestions={catalystSuggestions}
            pageContext={quizPageContext}
            chatContext={catalystChatContext}
            panelContextKey={`quiz:${quizId}`}
            launcherRef={catalystBtnRef}
          />
        </>
      )}
    </div>
  );
}
