'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { ArrowLeft, Loader2, AlertCircle, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import QuestionCard from '@/src/components/quizzes/QuestionCard';
import MatchingQuestionGroup from '@/src/components/quizzes/MatchingQuestionGroup';
import FlashCard from '@/src/components/learning/FlashCard';
import VoteButtons from '@/src/components/discover/VoteButtons';
import type { PublicStudySet, QuizQuestion } from '@/src/library/discover/types';

interface PublicStudySetWithId extends PublicStudySet {
  id: string;
}

type RenderItem =
  | { kind: 'standard'; question: QuizQuestion & { type: 'multiple_choice' | 'true_false' } }
  | { kind: 'matching'; groupId: string; questions: QuizQuestion[] };

// PREVIEW-ONLY PAGE — the only Firestore writes anywhere in this file are
// (1) saving an independent copy into the viewer's own collection, on an
// explicit "Save to my study materials" click. No attempt is created, no
// pinned/updatedAt field on the ORIGINAL owner's document is ever touched,
// and no generation/persistence helper from the quiz/flashcard creation
// flows is called. Voting (batch 4) adds one more, separately-gated write.
export default function DiscoverSetPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const publicSetId = params.publicSetId as string;

  const [set, setSet] = useState<PublicStudySetWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Local-only preview state — never persisted.
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});
  const [cardIndex, setCardIndex] = useState(0);

  const [saving, setSaving] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push('/login');
  }, [authLoading, user, router]);

  // Read-only load of the public set.
  useEffect(() => {
    if (!publicSetId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const setRef = doc(db, 'publicStudySets', publicSetId);
        const snap = await getDoc(setRef);
        if (cancelled) return;

        if (!snap.exists() || (snap.data() as PublicStudySet).status !== 'active') {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setSet({ id: snap.id, ...(snap.data() as PublicStudySet) });
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading public study set:', err);
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [publicSetId]);

  // Has this user already saved a copy of this set? Single equality filter
  // on `savedFrom` — no composite index required.
  useEffect(() => {
    if (!user || !set) return;

    let cancelled = false;
    const checkSaved = async () => {
      setCheckingSaved(true);
      try {
        const collectionName = set.type === 'quiz' ? 'quizSets' : 'flashcardSets';
        const setsRef = collection(db, 'users', user.uid, 'enrollment', courseId, collectionName);
        const existing = await getDocs(query(setsRef, where('savedFrom', '==', publicSetId)));
        if (cancelled) return;
        setAlreadySaved(!existing.empty);
      } catch (err) {
        if (cancelled) return;
        console.error('Error checking saved state:', err);
      } finally {
        if (!cancelled) setCheckingSaved(false);
      }
    };

    checkSaved();
    return () => {
      cancelled = true;
    };
  }, [user, set, courseId, publicSetId]);

  // Is the current user the creator of this set? Queries the ownerMapping
  // subcollection directly from the client — see the security note in
  // publishStudySet.ts: without committed firestore.rules, this is not a
  // hard security boundary today, only a UI convenience that hides the
  // vote buttons from the owner's own view.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const checkOwner = async () => {
      try {
        const mappingRef = collection(db, 'publicStudySets', publicSetId, 'ownerMapping');
        const mine = await getDocs(query(mappingRef, where('ownerUid', '==', user.uid)));
        if (cancelled) return;
        setIsOwner(!mine.empty);
      } catch (err) {
        if (cancelled) return;
        console.error('Error checking study set ownership:', err);
      }
    };

    checkOwner();
    return () => {
      cancelled = true;
    };
  }, [user, publicSetId]);

  // Same grouping logic as the real quiz-taking page — standard questions
  // render one-per-QuestionCard, matching questions group by matchingGroupId.
  const renderItems = useMemo<RenderItem[]>(() => {
    if (!set || set.type !== 'quiz' || !set.questions) return [];
    const items: RenderItem[] = [];
    const groupIndex = new Map<string, number>();

    for (const q of set.questions) {
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
  }, [set]);

  const handleSelectAnswer = (questionId: string, answer: string) => {
    setPreviewAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSaveToMySets = async () => {
    if (!user || !set || alreadySaved || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const collectionName = set.type === 'quiz' ? 'quizSets' : 'flashcardSets';
      const setsRef = collection(db, 'users', user.uid, 'enrollment', courseId, collectionName);

      // Independent copy: new doc, new ID, study content + safe provenance
      // only (`savedFrom`) — no sourceDocKey, no reference back to the
      // original owner. Always saved Private (requirement C default).
      const payload: Record<string, unknown> = {
        name: set.title,
        pinned: true,
        visibility: 'private',
        savedFrom: publicSetId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (set.type === 'quiz') {
        payload.questions = set.questions ?? [];
        payload.questionCount = (set.questions ?? []).length;
      } else {
        payload.cards = set.cards ?? [];
      }

      await addDoc(setsRef, payload);
      setAlreadySaved(true);
    } catch (err) {
      console.error('Error saving study set:', err);
      setSaveError('Could not save this set right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  if (notFound || !set) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="max-w-md text-center text-sm text-text-main">
          This study set is no longer available. It may have been made private or removed.
        </p>
        <button
          onClick={() => router.push(`/courses/${courseId}/discover`)}
          className="mt-2 rounded-lg border border-[#8B6914] px-4 py-2 text-sm text-[#8B6914] transition-colors hover:bg-[#F5F0EB]"
        >
          Back to Discover
        </button>
      </div>
    );
  }

  const totalCards = set.cards?.length ?? 0;
  const isFirstCard = cardIndex === 0;
  const isLastCard = cardIndex === totalCards - 1;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light px-6 py-7 md:px-14">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/discover`)}
            className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[#F5F0EB]"
            aria-label="Back to Discover"
          >
            <ArrowLeft size={20} className="text-text-main" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs text-text-muted">
              {set.courseCode} • {set.type === 'quiz' ? 'Quiz' : 'Flashcards'} •{' '}
              {set.itemCount} {set.type === 'quiz' ? 'question' : 'card'}
              {set.itemCount !== 1 ? 's' : ''}
            </p>
            <h1 className="truncate text-xl font-bold text-[#1a1a2e]">{set.title}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <span className="text-xs text-text-muted">by {set.creatorDisplayName}</span>
          {user && (
            <VoteButtons
              publicSetId={publicSetId}
              currentVoterId={user.uid}
              isOwner={isOwner}
              initialPositive={set.positiveVotes}
              initialNegative={set.negativeVotes}
            />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 md:px-14">
        {/* Save action */}
        <div className="mb-8 flex items-center justify-between rounded-2xl border border-border-light bg-bg-container p-4">
          <p className="text-sm text-text-muted">
            {alreadySaved
              ? 'This set is already in your study materials.'
              : 'Save your own private copy to study, edit, and track separately.'}
          </p>
          <button
            onClick={handleSaveToMySets}
            disabled={alreadySaved || saving || checkingSaved}
            className="ml-4 flex shrink-0 items-center gap-2 rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : alreadySaved ? (
              <>
                <Check size={16} />
                Already Saved
              </>
            ) : (
              'Save to my study materials'
            )}
          </button>
        </div>
        {saveError && <p className="mb-4 text-xs text-red-500">{saveError}</p>}

        {/* Quiz preview */}
        {set.type === 'quiz' && renderItems.length === 0 && (
          <p className="py-10 text-center text-sm text-text-muted">This quiz has no questions.</p>
        )}
        {set.type === 'quiz' && renderItems.length > 0 && (
          <div className="flex flex-col gap-4">
            {renderItems.map((item, index) =>
              item.kind === 'standard' ? (
                <QuestionCard
                  key={item.question.id}
                  question={item.question}
                  questionNumber={index + 1}
                  selectedAnswer={previewAnswers[item.question.id]}
                  onSelect={(answer) => handleSelectAnswer(item.question.id, answer)}
                  mode={previewAnswers[item.question.id] ? 'results' : 'taking'}
                />
              ) : (
                <MatchingQuestionGroup
                  key={item.groupId}
                  questions={item.questions}
                  answers={previewAnswers}
                  onSelect={handleSelectAnswer}
                  mode={item.questions.every((q) => previewAnswers[q.id]) ? 'results' : 'taking'}
                />
              )
            )}
          </div>
        )}

        {/* Flashcard preview */}
        {set.type === 'flashcard' && totalCards === 0 && (
          <p className="py-10 text-center text-sm text-text-muted">This set has no cards.</p>
        )}
        {set.type === 'flashcard' && totalCards > 0 && (
          <div className="flex flex-col items-center">
            <FlashCard
              key={cardIndex}
              question={set.cards![cardIndex].question}
              answer={set.cards![cardIndex].answer}
            />
            <div className="mt-8 flex items-center gap-6">
              <button
                onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                disabled={isFirstCard}
                className={`p-2 rounded-md transition-colors ${
                  isFirstCard
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-muted hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronLeft size={24} />
              </button>
              <span className="min-w-[40px] text-center text-sm font-medium text-text-muted">
                {cardIndex + 1}/{totalCards}
              </span>
              <button
                onClick={() => setCardIndex((i) => Math.min(totalCards - 1, i + 1))}
                disabled={isLastCard}
                className={`p-2 rounded-md transition-colors ${
                  isLastCard
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-muted hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
