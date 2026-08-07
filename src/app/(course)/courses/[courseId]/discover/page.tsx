'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { normalizeCourseCode } from '@/src/library/discover/normalizeCourseCode';
import type { PublicStudySet } from '@/src/library/discover/types';
import { Compass, ThumbsUp, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import LearnQuestionsSession from '@/src/components/discover/LearnQuestionsSession';
import { buildLearnQuestionsSession } from '@/src/library/discover/learnQuestions';
import type { LearnQuestion } from '@/src/library/discover/types';

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

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
      <div className="flex items-center gap-3 border-b border-border-light px-6 py-7 md:px-14">
        <Compass size={22} className="text-[#8B6914]" />
        <h1 className="text-xl font-bold text-[#1a1a2e]">Discover</h1>
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
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {recommendedSets.map((set) => (
                <button
                  key={set.id}
                  onClick={() => router.push(`/courses/${courseId}/discover/${set.id}`)}
                  className="flex w-64 shrink-0 flex-col rounded-2xl border border-border-light bg-bg-container p-5 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <h3 className="text-sm font-bold text-[#1a1a2e] line-clamp-2">{set.title}</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {set.itemCount} {set.type === 'quiz' ? 'question' : 'card'}
                    {set.itemCount !== 1 ? 's' : ''}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                    <span className="truncate">{set.creatorDisplayName}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <ThumbsUp size={12} />
                      {set.positiveVotes}
                    </span>
                  </div>
                </button>
              ))}
            </div>
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
            <LearnQuestionsSession questions={learnQuestions} />
          )}
        </section>
      </div>
    </div>
  );
}
