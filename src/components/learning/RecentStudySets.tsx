'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Globe, Lock, MoreVertical, Pin, PinOff, Trash2 } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { db } from '@/src/library/firebase';
import { studySetRoutes } from '@/src/library/studySets/routes';
import { quizResultLabel, type FlashcardSetSummary, type QuizSetSummary } from '@/src/library/studySets/viewModels';

interface RecentStudySetsProps {
  flashcards: FlashcardSetSummary[];
  quizzes: QuizSetSummary[];
  courseId: string;
  onDelete: (target: { id: string; kind: 'flashcard' | 'quiz' }) => void;
  onToggleVisibility: (kind: 'flashcard' | 'quiz', id: string) => void;
  togglingVisibilityId?: string | null;
}

type RecentCard =
  | { kind: 'flashcard'; set: FlashcardSetSummary }
  | { kind: 'quiz'; set: QuizSetSummary };

export default function RecentStudySets({
  flashcards,
  quizzes,
  courseId,
  onDelete,
  onToggleVisibility,
  togglingVisibilityId = null,
}: RecentStudySetsProps) {
  const routes = studySetRoutes(courseId);
  const cards: RecentCard[] = [
    ...flashcards.map((set) => ({ kind: 'flashcard' as const, set })),
    ...quizzes.map((set) => ({ kind: 'quiz' as const, set })),
  ].sort((a, b) => (b.set.createdAt?.toMillis() ?? 0) - (a.set.createdAt?.toMillis() ?? 0));

  return (
    <section className="mt-10" data-tutorial="course-learning-recent">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-[21px] font-bold tracking-tight text-text-main">Pick up where you left off</h2>
        <span className="flex gap-4 text-[13px] font-bold">
          <Link href={routes.flashcards} className="text-text-main hover:underline">Flashcards</Link>
          <Link href={routes.quizzes} className="text-text-main hover:underline">Quizzes</Link>
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">No study sets yet. Make a quiz or a deck from your course material.</p>
      ) : (
        <div className="grid grid-cols-2 gap-[13px] lg:grid-cols-4">
          {cards.map((card) => (
            <RecentCardFace
              key={`${card.kind}-${card.set.id}`}
              card={card}
              courseId={courseId}
              onDelete={onDelete}
              onToggleVisibility={onToggleVisibility}
              toggling={togglingVisibilityId === card.set.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentCardFace({
  card,
  courseId,
  onDelete,
  onToggleVisibility,
  toggling,
}: {
  card: RecentCard;
  courseId: string;
  onDelete: RecentStudySetsProps['onDelete'];
  onToggleVisibility: RecentStudySetsProps['onToggleVisibility'];
  toggling: boolean;
}) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const routes = studySetRoutes(courseId);
  const href = card.kind === 'flashcard' ? routes.flashcard(card.set.id) : routes.quiz(card.set.id);
  const pinned = card.set.pinned !== false;
  const isPublic = card.set.visibility === 'public';
  const meta = card.kind === 'flashcard'
    ? `${card.set.cardCount} cards${typeof card.set.estimatedMinutes === 'number' ? ` · about ${card.set.estimatedMinutes} min` : ''}`
    : card.set.latestAttemptKnown
      ? quizResultLabel(card.set.latestAttempt)
      : 'Checking last result';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const togglePin = async () => {
    if (!user) return;
    const collectionName = card.kind === 'flashcard' ? 'flashcardSets' : 'quizSets';
    await updateDoc(doc(db, 'users', user.uid, 'enrollment', courseId, collectionName, card.set.id), { pinned: !pinned });
    setMenuOpen(false);
  };

  return (
    <article className="relative flex min-h-[134px] flex-col rounded-[17px] bg-bg-container p-4 hover:bg-[#f0f2f7] focus-within:bg-[#f0f2f7] dark:hover:bg-bg-warm dark:focus-within:bg-bg-warm">
      <Link href={href} className="flex min-h-[96px] flex-col rounded-md focus-visible:outline-none focus-visible:underline">
        <strong className="pr-8 text-sm leading-snug text-text-main">{card.set.name}</strong>
        <span className={`mt-2 w-max rounded px-1.5 py-1 text-[11px] font-bold ${card.kind === 'flashcard' ? 'bg-[#e6defb] text-[#6151aa]' : 'bg-[#ffe0d4] text-[#af553a]'}`}>
          {card.kind === 'flashcard' ? 'Flashcards' : 'Quiz'}
        </span>
        <small className="mt-auto text-xs text-text-muted">{meta}</small>
      </Link>
      <div ref={menuRef} className="absolute right-2 top-2">
        <button type="button" aria-label={`Actions for ${card.set.name}`} className="rounded-md p-1.5 text-text-muted hover:bg-bg-warm focus-visible:bg-bg-warm focus-visible:outline-none" onClick={() => setMenuOpen((open) => !open)}>
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border-light bg-bg-container py-1 shadow-lg">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-warm" onClick={() => void togglePin()}>
              {pinned ? <PinOff size={14} /> : <Pin size={14} />} {pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
            </button>
            <button type="button" disabled={toggling} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-warm disabled:opacity-50" onClick={() => { setMenuOpen(false); onToggleVisibility(card.kind, card.set.id); }}>
              {isPublic ? <Lock size={14} /> : <Globe size={14} />} {isPublic ? 'Make private' : 'Share with classmates'}
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-warm" onClick={() => { setMenuOpen(false); onDelete({ id: card.set.id, kind: card.kind }); }}>
              <Trash2 size={14} /> Remove from folder
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
