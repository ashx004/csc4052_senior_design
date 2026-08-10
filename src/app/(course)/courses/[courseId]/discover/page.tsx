'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { normalizeCourseCode } from '@/src/library/discover/normalizeCourseCode';
import type { PublicStudySet } from '@/src/library/discover/types';
import { Compass, Loader2, AlertCircle, Sparkles, Gamepad2 } from 'lucide-react';
import LearnQuestionsSession from '@/src/components/discover/LearnQuestionsSession';
import StudySetCarousel from '@/src/components/discover/StudySetCarousel';
import { buildLearnQuestionsSession } from '@/src/library/discover/learnQuestions';
import type { LearnQuestion } from '@/src/library/discover/types';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildLearnQuestionSuggestions, type LearnQuestionsPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { buildChatContext, type ChatContext } from '@/src/library/chatContext';

interface PublicStudySetWithId extends PublicStudySet {
  id: string;
}

const RECOMMENDATION_LIMIT = 20;

export default function DiscoverPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const { courseCode, displayName: courseDisplayName, loading: courseInfoLoading } = useCourseInfo(courseId);

  const [recommendedSets, setRecommendedSets] = useState<PublicStudySetWithId[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [setsError, setSetsError] = useState<string | null>(null);

  const [learnQuestionsLoading, setLearnQuestionsLoading] = useState(true);
  const [learnQuestionsError, setLearnQuestionsError] = useState<string | null>(null);
  const [learnQuestions, setLearnQuestions] = useState<LearnQuestion[]>([]);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [learnQuestionsState, setLearnQuestionsState] = useState<{
    currentQuestion: LearnQuestion;
    currentIndex: number;
    totalQuestions: number;
    selectedAnswer: string | null;
    isCorrect: boolean | null;
    sessionScore: { answered: number; correct: number };
  } | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Build the same ChatContext shape the full AI Assistant uses, so the
  // Catalyst sidebar can fall back to read_document/search_documents for
  // this course's materials.
  useEffect(() => {
    if (!user?.email) return;

    buildChatContext(user.uid, user.email)
      .then(setChatContext)
      .catch((err) => {
        console.error('Error building Catalyst chat context:', err);
        setChatContext(null);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const loadLearnQuestions = async () => {
      setLearnQuestionsLoading(true);
      setLearnQuestionsError(null);

      try {
        const questions = await buildLearnQuestionsSession(user.uid);
        if (cancelled) return;
        setLearnQuestions(questions);
      } catch (err) {
        if (cancelled) return;
        console.error('Error building Learn Questions session:', err);
        setLearnQuestionsError('Something went wrong loading your practice questions. Please try again.');
      } finally {
        if (!cancelled) setLearnQuestionsLoading(false);
      }
    };

    loadLearnQuestions();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || courseInfoLoading || !courseCode) return;

    let cancelled = false;

    const loadRecommendations = async () => {
      setLoadingSets(true);
      setSetsError(null);

      try {
        const setsRef = collection(db, 'publicStudySets');
        const q = query(
          setsRef,
          where('schoolDomain', '==', 'latech.edu'),
          where('normalizedCourseCode', '==', normalizeCourseCode(courseCode)),
          where('status', '==', 'active'),
          orderBy('positiveVotes', 'desc'),
          orderBy('createdAt', 'desc'),
          limit(RECOMMENDATION_LIMIT)
        );
        const snapshot = await getDocs(q);
        if (cancelled) return;

        setRecommendedSets(
          snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PublicStudySetWithId))
        );
      } catch (err) {
        if (cancelled) return;
        // Most likely cause: this compound query (3 equality filters + a
        // 2-field orderBy) needs a Firestore composite index that hasn't
        // been created yet — see the Phase 0 investigation notes. Firestore
        // itself would normally return a console link to auto-create it.
        console.error('Error loading Discover recommendations:', err);
        setSetsError('Could not load shared study sets right now. Please try again later.');
      } finally {
        if (!cancelled) setLoadingSets(false);
      }
    };

    loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [user, courseInfoLoading, courseCode]);

  const learnQuestionsPageContext: LearnQuestionsPageContext | null = learnQuestionsState
    ? {
        kind: 'learn_questions',
        currentQuestion: learnQuestionsState.currentQuestion.question,
        currentOptions: learnQuestionsState.currentQuestion.options,
        correctAnswer: learnQuestionsState.currentQuestion.correctAnswer,
        selectedAnswer: learnQuestionsState.selectedAnswer,
        isCorrect: learnQuestionsState.isCorrect,
        questionIndex: learnQuestionsState.currentIndex,
        totalQuestions: learnQuestionsState.totalQuestions,
        sourceCourse: learnQuestionsState.currentQuestion.sourceCourse,
        sessionScore: learnQuestionsState.sessionScore,
      }
    : null;

  const catalystSuggestions = learnQuestionsPageContext
    ? buildLearnQuestionSuggestions(learnQuestionsPageContext)
    : [];

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex h-[60px] items-center border-b border-border-light px-6 md:px-14">
        <div className="ml-4 flex translate-y-3 items-center gap-3">
          <Compass size={22} className="text-[#8B6914]" />
          <h1 className="ml-1 text-xl font-bold text-[#1a1a2e]">Discover</h1>
        </div>
      </div>

      <div className="px-6 py-8 md:px-14">
        {/* Recommended Study Sets */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Based on your recent studying
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#1a1a2e]">
            {courseInfoLoading ? 'Loading...' : courseDisplayName}
          </h2>

          {loadingSets ? (
            <div className="flex items-center gap-2 py-10 text-sm text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              Loading shared study sets...
            </div>
          ) : setsError ? (
            <div className="flex items-center gap-2 py-10 text-sm text-red-500">
              <AlertCircle size={18} />
              {setsError}
            </div>
          ) : recommendedSets.length === 0 ? (
            <p className="py-10 text-sm text-text-muted">
              No shared study sets for this course yet. Be the first to share!
            </p>
          ) : (
            <StudySetCarousel
              sets={recommendedSets}
              onSelect={(setId) => router.push(`/courses/${courseId}/discover/${setId}`)}
            />
          )}
        </section>

        {/* Learn Questions — compact widget */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-[#1a1a2e] mb-1">Learn Questions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Test yourself with random questions from all your active courses.
          </p>

          {learnQuestionsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              Loading questions...
            </div>
          ) : learnQuestionsError ? (
            <div className="flex items-center gap-2 py-6 text-sm text-red-500">
              <AlertCircle size={18} />
              {learnQuestionsError}
            </div>
          ) : learnQuestions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Sparkles size={24} className="text-text-muted" />
              <p className="text-sm text-text-muted">Complete some quizzes first to unlock practice questions.</p>
            </div>
          ) : (
            <LearnQuestionsSession questions={learnQuestions} onStateChange={setLearnQuestionsState} />
          )}
        </section>

        {/* Switch It Up With a Game */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-[#1a1a2e] mb-1">Switch It Up With a Game</h2>
          <p className="text-sm text-gray-500 mb-4">
            Answer questions, build with blocks, and make studying fun.
          </p>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5">
            <div>
              <p className="text-sm font-semibold text-[#1a1a2e]">Blocks</p>
              <p className="text-xs text-gray-500">
                Place pieces on the board, answer questions to keep them coming.
              </p>
            </div>
            <button
              onClick={() => router.push(`/courses/${courseId}/discover/blocks`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2a2a3e]"
            >
              <Gamepad2 size={14} />
              Play Blocks
            </button>
          </div>
        </section>
      </div>

      {learnQuestions.length > 0 && learnQuestionsPageContext && chatContext && (
        <>
          <CatalystLauncher onClick={() => setAiPanelOpen(true)} visible={!aiPanelOpen} buttonRef={launcherRef} />
          <ContextualAiPanel
            open={aiPanelOpen}
            onClose={() => setAiPanelOpen(false)}
            contextLabel={`Question ${learnQuestionsPageContext.questionIndex + 1} of ${learnQuestionsPageContext.totalQuestions} — ${learnQuestionsPageContext.sourceCourse}`}
            suggestions={catalystSuggestions}
            pageContext={learnQuestionsPageContext}
            chatContext={chatContext}
            launcherRef={launcherRef}
          />
        </>
      )}
    </div>
  );
}
