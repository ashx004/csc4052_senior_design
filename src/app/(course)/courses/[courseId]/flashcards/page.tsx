'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import FlashcardDeckCard from '@/src/components/learning/FlashcardDeckCard';
import FlashcardViewer from '@/src/components/learning/FlashcardViewer';
import StudyLaunch from '@/src/components/learning/StudyLaunch';
import { useStudySets } from '@/src/hooks/useStudySets';
import { resolveLegacyFlashcardQuery, studySetRoutes } from '@/src/library/studySets/routes';
import deckStyles from '@/src/components/learning/FlashcardDeckCard.module.css';

export default function FlashcardLibraryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.courseId as string;
  const routes = studySetRoutes(courseId);
  const legacy = resolveLegacyFlashcardQuery(courseId, searchParams);
  const docId = searchParams.get('docId');
  const { flashcards, loading, error } = useStudySets(courseId);

  useEffect(() => {
    if (legacy) router.replace(legacy);
  }, [legacy, router]);

  if (legacy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  if (docId) return <FlashcardViewer courseId={courseId} />;

  return (
    <div className="min-h-screen bg-bg-main">
      <div className="flex min-h-[68px] items-center border-b border-border-light px-5 sm:px-8 lg:px-14">
        <button type="button" aria-label="Go back" onClick={() => router.push(routes.hub)} className="rounded-md p-1.5 hover:bg-bg-warm">
          <ArrowLeft size={20} className="text-text-main" />
        </button>
        <h1 className="ml-3 text-xl font-bold text-text-main">Flashcards</h1>
      </div>
      <div className="mx-auto max-w-[1310px] px-5 py-8 sm:px-8 lg:px-12">
        <p className="mb-2 text-sm font-semibold text-text-muted">Your flashcards</p>
        <h2 className="max-w-xl text-4xl font-bold tracking-tight text-text-main">Small cards. Stronger recall.</h2>
        <p className="mt-3 max-w-xl text-text-muted">Come back to a deck or build a new one from your course material.</p>
        <StudyLaunch courseId={courseId} variant="compact" initialKind="flashcards">
          {(open) => (
            <>
              <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="text-[22px] font-bold tracking-tight text-text-main">Your decks</h3>
                  <p className="mt-1 text-sm text-text-muted">Choose a deck to open its cards.</p>
                </div>
                <button type="button" className="rounded-full bg-[#1d1b1a] px-5 py-3 text-sm font-bold text-white" onClick={() => open('flashcards')}>Make flashcards →</button>
              </div>
              {error && <p role="alert" className="mt-4 text-sm text-alert-error">Could not load flashcard decks.</p>}
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
              ) : (
                <div className="mt-8 grid grid-cols-1 gap-7 md:grid-cols-2 xl:grid-cols-3">
                  {flashcards.map((set, index) => (
                    <FlashcardDeckCard key={set.id} set={set} courseId={courseId} index={index} />
                  ))}
                  <button type="button" className={deckStyles.add} onClick={() => open('flashcards')}>+<br />Make a new deck</button>
                </div>
              )}
              {!loading && flashcards.length === 0 && <p className="mt-6 text-center text-sm text-text-muted">No decks yet. Make flashcards from a course document.</p>}
            </>
          )}
        </StudyLaunch>
      </div>
    </div>
  );
}
