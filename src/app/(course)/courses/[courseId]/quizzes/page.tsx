'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import QuizListRow from '@/src/components/learning/QuizListRow';
import StudyLaunch from '@/src/components/learning/StudyLaunch';
import { useStudySets } from '@/src/hooks/useStudySets';
import { studySetRoutes } from '@/src/library/studySets/routes';

export default function QuizLibraryPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const routes = studySetRoutes(courseId);
  const { quizzes, loading, error } = useStudySets(courseId);

  return (
    <div className="min-h-screen bg-bg-main">
      <div className="flex min-h-[68px] items-center border-b border-border-light px-5 sm:px-8 lg:px-14">
        <button type="button" aria-label="Go back" onClick={() => router.push(routes.hub)} className="rounded-md p-1.5 hover:bg-bg-warm">
          <ArrowLeft size={20} className="text-text-main" />
        </button>
        <h1 className="ml-3 text-xl font-bold text-text-main">Quizzes</h1>
      </div>
      <div className="mx-auto max-w-[1310px] px-5 py-8 sm:px-8 lg:px-12">
        <p className="mb-2 text-sm font-semibold text-text-muted">Your quizzes</p>
        <h2 className="text-4xl font-bold tracking-tight text-text-main">See what you know.</h2>
        <p className="mt-3 max-w-xl text-text-muted">Return to a quiz, check your last result, or make a new one.</p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-[22px] font-bold tracking-tight text-text-main">Recent quizzes</h3>
            <p className="mt-1 text-sm text-text-muted">Your latest checks, with the result from your most recent attempt.</p>
          </div>
          <StudyLaunch courseId={courseId} variant="compact" initialKind="quiz" />
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-alert-error">Could not load quizzes.</p>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : quizzes.length === 0 ? (
          <p className="mt-8 text-center text-sm text-text-muted">No quizzes yet. Make one from a course document.</p>
        ) : (
          <div className="mt-7 grid gap-3">
            {quizzes.map((quiz, index) => <QuizListRow key={quiz.id} quiz={quiz} courseId={courseId} index={index} />)}
          </div>
        )}
      </div>
    </div>
  );
}
