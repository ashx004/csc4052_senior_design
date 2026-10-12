'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import StudySetActions from './StudySetActions';
import type { Timestamp } from 'firebase/firestore';
import { quizScoreParts, type QuizSetSummary } from '@/src/library/studySets/viewModels';
import { studySetRoutes } from '@/src/library/studySets/routes';

/** The shared study-set colour cycle (see "Study-set accents" in global.css). */
const ACCENTS = ['var(--set-accent-1)', 'var(--set-accent-2)', 'var(--set-accent-3)', 'var(--set-accent-4)'];

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`;
}

export default function QuizListRow({ quiz, courseId, index = 0 }: { quiz: QuizSetSummary; courseId: string; index?: number }) {
  const details = [
    `${quiz.questionCount} questions`,
    typeof quiz.sourceCount === 'number' ? `${quiz.sourceCount} sources` : null,
    formatDate(quiz.createdAt),
  ].filter(Boolean).join(' · ');
  const score = quiz.latestAttemptKnown
    ? quizScoreParts(quiz.latestAttempt)
    : { value: 'Checking last result', label: null };

  return (
    <article className="relative">
    <Link href={studySetRoutes(courseId).quiz(quiz.id)} className="group grid min-h-[100px] grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-4 rounded-[17px] !pr-14 bg-bg-container px-4 py-4 text-left hover:bg-[#f0f2f7] focus-visible:bg-[#f0f2f7] focus-visible:outline-none sm:grid-cols-[12px_minmax(0,1fr)_auto_auto] sm:gap-6 sm:px-[22px] dark:hover:bg-bg-warm dark:focus-visible:bg-bg-warm">
      <span className="block h-[58px] w-[10px] rounded-full" style={{ background: ACCENTS[index % ACCENTS.length] }} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-bold text-text-main group-hover:underline group-hover:underline-offset-4">{quiz.name}</span>
        <span className="mt-1 block text-[13px] text-text-muted">{details}</span>
      </span>
      <span className="text-right">
        <span className={`block font-extrabold leading-none text-text-main ${score.label ? 'text-[22px] sm:text-[26px]' : 'text-[15px] sm:text-[17px]'}`}>{score.value}</span>
        {score.label && <span className="mt-1.5 block text-[11px] font-medium text-text-muted">{score.label}</span>}
      </span>
      <ArrowRight size={26} strokeWidth={2} className="hidden shrink-0 text-text-main transition-transform duration-150 group-hover:translate-x-1 sm:block" aria-hidden="true" />
    </Link>
    <StudySetActions set={quiz} kind="quiz" courseId={courseId} />
    </article>
  );
}
