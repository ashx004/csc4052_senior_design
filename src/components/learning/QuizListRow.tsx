'use client';

import Link from 'next/link';
import type { Timestamp } from 'firebase/firestore';
import { quizResultLabel, type QuizSetSummary } from '@/src/library/studySets/viewModels';
import { studySetRoutes } from '@/src/library/studySets/routes';

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`;
}

export default function QuizListRow({ quiz, courseId }: { quiz: QuizSetSummary; courseId: string }) {
  const details = [
    `${quiz.questionCount} questions`,
    typeof quiz.sourceCount === 'number' ? `${quiz.sourceCount} sources` : null,
    formatDate(quiz.createdAt),
  ].filter(Boolean).join(' · ');
  const result = quiz.latestAttemptKnown ? quizResultLabel(quiz.latestAttempt) : 'Checking last result';

  return (
    <Link href={studySetRoutes(courseId).quiz(quiz.id)} className="grid min-h-[94px] grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-4 rounded-[17px] bg-bg-container px-4 py-4 text-left hover:bg-[#f0f2f7] focus-visible:bg-[#f0f2f7] focus-visible:outline-none sm:grid-cols-[12px_minmax(0,1fr)_auto_auto] sm:px-[22px] dark:hover:bg-bg-warm dark:focus-visible:bg-bg-warm">
      <span className="block h-[58px] w-[10px] rounded-full bg-[#d5c4f4]" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-bold text-text-main">{quiz.name}</span>
        <span className="mt-1 block text-[13px] text-text-muted">{details}</span>
      </span>
      <span className="text-right text-base font-extrabold text-text-main sm:text-[19px]">
        {result}
        {quiz.latestAttemptKnown && quiz.latestAttempt && <span className="mt-1 block text-[11px] font-medium text-text-muted">Correct</span>}
      </span>
      <span className="hidden text-xl text-text-muted sm:block" aria-hidden="true">→</span>
    </Link>
  );
}
