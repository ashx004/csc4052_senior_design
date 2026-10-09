'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import { getEffectiveModelKey } from '@/src/library/chatMode';
import {
  doc,
  getDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import {ArrowLeft,ChevronLeft,ChevronRight,RefreshCw,Shuffle,Loader2,AlertCircle,} from 'lucide-react';
import FlashCard from '@/src/components/learning/FlashCard';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildFlashcardSuggestions, type FlashcardPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { useChatContext } from '@/src/hooks/useChatContext';
import FlashcardSetupModal from '@/src/components/discover/FlashcardSetupModal';
import QuizSetupModal from '@/src/components/quizzes/QuizSetupModal';
import QuizChoiceModal, { type QuizChoice } from '@/src/components/studyPlan/QuizChoiceModal';
import { publishStudySet } from '@/src/library/discover/publishStudySet';
import type { StudySetVisibility } from '@/src/library/discover/types';
import PageTutorial from '@/src/components/tutorial/PageTutorial';
import courseFlashcardsSteps from '@/src/library/tutorials/steps/course-flashcards';
import { useLearningProgress } from '@/src/hooks/useLearningProgress';
import { useGenerateQuizFromResource } from '@/src/hooks/useGenerateQuizFromResource';
import { findResourceForSourceDocKey } from '@/src/library/studyPlan/recommendationEngine';
import {
  resolveQuizNextStep,
  type QuizNextStep,
  type QuizSetRef,
} from '@/src/library/studyPlan/nextStudyActivity';

interface Flashcard {
  question: string;
  answer: string;
}

interface PendingResource {
  id: string;
  url: string;
  name: string;
}

function extractStorageKey(url: string): string {
  return decodeURIComponent(url.split('key=')[1] ?? '');
}

interface LoadedQuiz extends QuizSetRef {
  name: string;
}

function millisFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    const millis = (value as { toMillis: () => unknown }).toMillis();
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
  }
  return null;
}

async function loadCourseQuizzes(userId: string, courseId: string): Promise<LoadedQuiz[]> {
  const snapshot = await getDocs(collection(db, 'users', userId, 'enrollment', courseId, 'quizSets'));
  return snapshot.docs.map((quizDoc) => {
    const data = quizDoc.data();
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    return {
      id: quizDoc.id,
      name: name || 'Untitled quiz',
      sourceDocKey: typeof data.sourceDocKey === 'string' ? data.sourceDocKey : null,
      createdAtMs: millisFrom(data.createdAt),
    };
  });
}

async function requestFlashcards(
  docUrl: string,
  docName: string,
  previousQuestions?: string[]
): Promise<{ topicName: string; questions: Flashcard[] }> {
  const response = await fetch('/api/generate-flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docUrl, docName, previousQuestions, modelKey: getEffectiveModelKey('flashcards') }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate flashcards.');
  }

  return { topicName: data.topicName, questions: data.questions };
}

// Creates a new flashcardSets doc for this source document, or appends cards
// to the existing one if a set for this sourceDocKey already exists.
// `visibility` is only ever written on the create branch — appending cards
// to an already-existing set never changes its visibility.
async function persistFlashcardSet(
  userId: string,
  courseId: string,
  sourceDocKey: string,
  topicName: string,
  cards: Flashcard[],
  visibility: StudySetVisibility
): Promise<string> {
  const setsRef = collection(db, 'users', userId, 'enrollment', courseId, 'flashcardSets');
  const existing = await getDocs(query(setsRef, where('sourceDocKey', '==', sourceDocKey)));

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    await updateDoc(existingDoc.ref, {
      cards: arrayUnion(...cards),
      updatedAt: serverTimestamp(),
    });
    return existingDoc.id;
  }

  const newDoc = await addDoc(setsRef, {
    name: topicName,
    sourceDocKey,
    cards,
    pinned: true,
    visibility,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newDoc.id;
}

export default function FlashcardsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const courseId = params.courseId as string;
  const { courseCode } = useCourseInfo(courseId);
  const { finishFlashcardReview } = useLearningProgress();
  const quizFromResource = useGenerateQuizFromResource(courseId);
  const docId = searchParams.get('docId') || '';
  const docNameParam = searchParams.get('docName') || '';
  const setId = searchParams.get('setId') || '';
  const taskIdParam = searchParams.get('taskId');
  const taskId = taskIdParam && taskIdParam.trim() ? taskIdParam : null;

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [originalCards, setOriginalCards] = useState<Flashcard[]>([]);
  const [allPreviousQuestions, setAllPreviousQuestions] = useState<string[]>([]);

  const [displayName, setDisplayName] = useState(
    docNameParam ? decodeURIComponent(docNameParam) : 'Document'
  );
  const [sourceDocKey, setSourceDocKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The resolved source document, waiting on the user's visibility choice
  // in FlashcardSetupModal before generation actually starts.
  const [pendingResource, setPendingResource] = useState<PendingResource | null>(null);
  const [savedSetId, setSavedSetId] = useState<string | null>(setId || null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [finishingReview, setFinishingReview] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [quizLookupFailed, setQuizLookupFailed] = useState(false);
  const [quizGuidance, setQuizGuidance] = useState<QuizNextStep | null>(null);
  const [loadedQuizzes, setLoadedQuizzes] = useState<LoadedQuiz[]>([]);
  const [choiceOpen, setChoiceOpen] = useState(false);

  const [catalystOpen, setCatalystOpen] = useState(false);
  const catalystBtnRef = useRef<HTMLButtonElement | null>(null);
  
  // Build the same ChatContext shape the full AI Assistant uses, so the
  // Catalyst sidebar can fall back to read_document/search_documents for
  // this course's materials.
  const catalystChatContext = useChatContext(user?.uid, user?.email);

  useEffect(() => {
    if (setId) setSavedSetId(setId);
  }, [setId]);

  // Load a previously saved flashcard set (opened from the course sidebar)
  useEffect(() => {
    if (!user || !setId) return;

    const loadSavedSet = async () => {
      setLoading(true);
      setError(null);

      try {
        const setRef = doc(db, 'users', user.uid, 'enrollment', courseId, 'flashcardSets', setId);
        const setSnap = await getDoc(setRef);

        if (!setSnap.exists()) {
          setError('Flashcard set not found. It may have been deleted.');
          setLoading(false);
          return;
        }

        const data = setSnap.data();
        const cards: Flashcard[] = data.cards || [];

        setFlashcards(cards);
        setOriginalCards(cards);
        setAllPreviousQuestions(cards.map((c) => c.question));
        setDisplayName(data.name || 'Document');
        setSourceDocKey(data.sourceDocKey || null);
      } catch (err) {
        console.error('Error loading flashcard set:', err);
        setError('Something went wrong loading this flashcard set.');
      } finally {
        setLoading(false);
      }
    };

    loadSavedSet();
  }, [user, setId, courseId]);

  // Resolve the source document for a brand-new set, then hand off to
  // FlashcardSetupModal — generation only starts once the user confirms a
  // visibility choice there and clicks "Generate".
  useEffect(() => {
    if (!user || !docId || setId) return;

    let cancelled = false;

    const resolveResource = async () => {
      setLoading(true);
      setError(null);

      try {
        const resources = await getCourseResources(user.uid, courseId);
        const resource = resources.find((r: { id: string }) => r.id === docId);
        if (cancelled) return;

        if (!resource) {
          setError('Document not found. It may have been deleted.');
          setLoading(false);
          return;
        }

        setPendingResource(resource);
      } catch (err) {
        if (cancelled) return;
        console.error('Error resolving document for flashcards:', err);
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolveResource();
    return () => {
      cancelled = true;
    };
  }, [user, docId, setId, courseId]);

  const handleGenerateFromModal = async (visibility: StudySetVisibility) => {
    if (!user || !pendingResource) return;
    // Capture and clear pendingResource up front so the modal closes
    // immediately (its `open` prop is driven by pendingResource) and the
    // full-page "generating" state renders in its place, rather than the
    // modal staying open — or an empty page showing behind it — for the
    // whole duration of generation.
    const resource = pendingResource;
    setPendingResource(null);
    setGenerating(true);
    setError(null);

    try {
      const key = extractStorageKey(resource.url);
      const { topicName, questions } = await requestFlashcards(resource.url, resource.name);

      setFlashcards(questions);
      setOriginalCards(questions);
      setAllPreviousQuestions(questions.map((f) => f.question));
      setDisplayName(topicName || resource.name);
      setSourceDocKey(key);

      const setDocId = await persistFlashcardSet(user.uid, courseId, key, topicName, questions, visibility);
      setSavedSetId(setDocId);

      // Publishing is best-effort — a failure here shouldn't block the
      // student from reaching their newly created (already-private-until-
      // this-succeeds) flashcard set. Logged, not surfaced as a blocking error.
      if (visibility === 'public' && courseCode) {
        try {
          const publicSetId = await publishStudySet({
            type: 'flashcard',
            setData: { name: topicName, cards: questions },
            courseCode,
            ownerUid: user.uid,
            originalPath: `users/${user.uid}/enrollment/${courseId}/flashcardSets/${setDocId}`,
          });
          await updateDoc(
            doc(db, 'users', user.uid, 'enrollment', courseId, 'flashcardSets', setDocId),
            { publicSetId }
          );
        } catch (publishError) {
          console.error('Error publishing flashcard set to Discover:', publishError);
        }
      }
    } catch (err) {
      console.error('Error generating flashcards:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCloseSetupModal = () => {
    setPendingResource(null);
    router.push(`/courses/${courseId}/learning`);
  };

  const totalCards = flashcards.length;
  const isFirstCard = currentIndex === 0;
  const isLastCard = currentIndex === totalCards - 1;

  const goToPrevious = () => {
    if (!isFirstCard) setCurrentIndex((prev) => prev - 1);
  };

  const goToNext = () => {
    if (!isLastCard) setCurrentIndex((prev) => prev + 1);
  };

  const shuffleCards = () => {
    if (isShuffled) {
      setFlashcards(originalCards);
    } else {
      const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
      setFlashcards(shuffled);
    }
    setIsShuffled(!isShuffled);
    setCurrentIndex(0);
  };

  const handleGenerateMore = async () => {
    if (!user) return;
    setGenerating(true);
    setError(null);

    try {
      let docUrl: string;
      let docName: string;

      if (docId) {
        const resources = await getCourseResources(user.uid, courseId);
        const resource = resources.find((r: { id: string }) => r.id === docId);

        if (!resource) {
          setError('Document not found.');
          setGenerating(false);
          return;
        }

        docUrl = resource.url;
        docName = resource.name;
      } else if (sourceDocKey) {
        docUrl = `/api/download?key=${encodeURIComponent(sourceDocKey)}`;
        docName = sourceDocKey.split('/').pop() || 'document';
      } else {
        setError('Source document not found for this flashcard set.');
        setGenerating(false);
        return;
      }

      const { questions } = await requestFlashcards(docUrl, docName, allPreviousQuestions);

      setFlashcards(questions);
      setOriginalCards(questions);
      setIsShuffled(false);
      setCurrentIndex(0);
      setAllPreviousQuestions((prev) => [...prev, ...questions.map((f) => f.question)]);

      if (sourceDocKey) {
        // "Generate more" always appends to an already-existing set (the one
        // created by the initial generation), so this visibility value is
        // inert in practice — persistFlashcardSet only writes it on the
        // create branch. Kept conservative ("private") in case that
        // assumption is ever wrong for an edge case not covered here.
        const appendedSetId = await persistFlashcardSet(user.uid, courseId, sourceDocKey, '', questions, 'private');
        setSavedSetId(appendedSetId);
      }
    } catch (err) {
      console.error('Error generating more flashcards:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const resolveQuizzes = async (key: string) => {
    if (!user) return;
    const quizzes = await loadCourseQuizzes(user.uid, courseId);
    setLoadedQuizzes(quizzes);
    setQuizGuidance(resolveQuizNextStep(key, quizzes));
    setQuizLookupFailed(false);
    setFinishError(null);
  };

  const handleFinishReview = async () => {
    if (!user || reviewSaved || finishingReview) return;
    if (!sourceDocKey) {
      setFinishError('Source document not found for this flashcard set.');
      return;
    }

    setFinishingReview(true);
    setFinishError(null);

    try {
      await finishFlashcardReview({
        courseId,
        sourceDocKey,
        flashcardSetId: savedSetId,
        taskId,
      });
      setReviewSaved(true);
      try {
        await resolveQuizzes(sourceDocKey);
      } catch (lookupError) {
        console.error('Error loading quizzes after review:', lookupError);
        setQuizLookupFailed(true);
        setFinishError('Your review was saved, but quizzes could not be loaded.');
      }
    } catch (err) {
      console.error('Error finishing flashcard review:', err);
      setFinishError(err instanceof Error ? err.message : 'Could not save this review. Please try again.');
    } finally {
      setFinishingReview(false);
    }
  };

  const retryQuizLookup = async () => {
    if (!user || !sourceDocKey || !reviewSaved || finishingReview) return;
    setFinishingReview(true);
    setFinishError(null);
    try {
      await resolveQuizzes(sourceDocKey);
    } catch (lookupError) {
      console.error('Error loading quizzes after review:', lookupError);
      setQuizLookupFailed(true);
      setFinishError('Your review was saved, but quizzes could not be loaded.');
    } finally {
      setFinishingReview(false);
    }
  };

  const openQuizSetup = async () => {
    if (!user || !sourceDocKey) {
      setFinishError('Source document not found for this flashcard set.');
      return;
    }

    try {
      const resources = await getCourseResources(user.uid, courseId);
      const mapped = resources.map((resource: {
        id: string;
        name?: string;
        url?: string;
        sourceDocKey?: string;
        storageKey?: string;
      }) => ({
        id: resource.id,
        name: typeof resource.name === 'string' ? resource.name : '',
        url: typeof resource.url === 'string' ? resource.url : '',
        sourceDocKey: resource.sourceDocKey,
        storageKey: resource.storageKey,
      }));
      const byDocId = docId ? mapped.find((resource) => resource.id === docId) : undefined;
      const matched = findResourceForSourceDocKey(sourceDocKey, mapped) ?? byDocId;
      quizFromResource.begin({
        sourceDocKey,
        resourceId: matched?.id || docId || sourceDocKey,
        name: matched?.name || displayName,
        url: matched?.url || `/api/download?key=${encodeURIComponent(sourceDocKey)}`,
      });
    } catch (err) {
      console.error('Error opening quiz setup:', err);
      setFinishError('Could not open quiz setup. Please try again.');
    }
  };

  const openQuiz = (quizId: string) => {
    setChoiceOpen(false);
    router.push(`/courses/${courseId}/quizzes/${quizId}?mode=take`);
  };

  const alternativeIds =
    quizGuidance?.action === 'open_quiz' ? quizGuidance.alternatives : [];
  const matchingQuizChoices: QuizChoice[] = alternativeIds.flatMap((id) => {
    const quiz = loadedQuizzes.find((item) => item.id === id);
    return quiz ? [{ id: quiz.id, name: quiz.name }] : [];
  });

  const flashcardPageContext: FlashcardPageContext | null =
    flashcards.length > 0
      ? {
          kind: 'flashcard',
          courseId,
          documentName: displayName,
          cardIndex: currentIndex,
          totalCards: flashcards.length,
          question: flashcards[currentIndex]?.question || '',
          answer: flashcards[currentIndex]?.answer || '',
        }
      : null;

  const catalystSuggestions = flashcardPageContext ? buildFlashcardSuggestions(flashcardPageContext) : [];

  // Loading state — resolving a saved set, or resolving the source document
  // before FlashcardSetupModal opens (brief; actual generation happens
  // after the user confirms visibility there, see the state below).
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="animate-spin text-[#8B6914]" />
        <p className="text-text-muted text-sm">
          {setId ? 'Loading your saved flashcards...' : 'Preparing your document...'}
        </p>
      </div>
    );
  }

  // Error state
  if (error && flashcards.length === 0 && !pendingResource) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-text-main text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => router.push(`/courses/${courseId}/learning`)}
          className="mt-2 px-4 py-2 text-sm text-[#8B6914] border border-[#8B6914] rounded-lg hover:bg-[#F5F0EB] transition-colors"
        >
          Back to documents
        </button>
      </div>
    );
  }

  // Generating the very first set from FlashcardSetupModal — the modal
  // itself is already closed by this point (see handleGenerateFromModal),
  // so show a full-page spinner rather than an empty page underneath it.
  if (generating && flashcards.length === 0 && !pendingResource) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="animate-spin text-[#8B6914]" />
        <p className="text-text-muted text-sm">Reading your document and generating flashcards...</p>
        <p className="text-text-muted text-xs">This may take a few seconds</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <PageTutorial id="course-flashcards" steps={courseFlashcardsSteps} />
      {/* Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-border-light px-6 md:px-14">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors"
          >
            <ArrowLeft size={20} className="text-text-main" />
          </button>
          <h1 className="text-xl font-bold text-[#1a1a2e]">
            {displayName}
          </h1>
        </div>
      </div>

      {/* Flashcard area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {flashcards.length > 0 && (
          <>
            {/* Sized like FlashCard itself (w-full max-w-xl) - a bare wrapper
                shrinks to fit in this centered flex column, and the card
                inside sizes to it, collapsing into a narrow sliver. */}
            <div className="w-full max-w-xl" data-tutorial="course-flashcards-card">
              <FlashCard
                key={currentIndex}
                question={flashcards[currentIndex].question}
                answer={flashcards[currentIndex].answer}
              />
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-6 mt-8" data-tutorial="course-flashcards-nav">
              <button
                onClick={goToPrevious}
                disabled={isFirstCard}
                className={`p-2 rounded-md transition-colors ${
                  isFirstCard
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-muted hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronLeft size={24} />
              </button>

              <span className="text-sm font-medium text-text-muted min-w-[40px] text-center">
                {currentIndex + 1}/{totalCards}
              </span>

              <button
                onClick={goToNext}
                disabled={isLastCard}
                className={`p-2 rounded-md transition-colors ${
                  isLastCard
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-muted hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronRight size={24} />
              </button>

              <button
                onClick={shuffleCards}
                className={`p-2 rounded-md transition-colors ${
                  isShuffled
                    ? 'text-[#8B6914] bg-[#F5F0EB]'
                    : 'text-text-muted hover:bg-[#F5F0EB] hover:text-text-main'
                }`}
                title={isShuffled ? 'Unshuffle' : 'Shuffle'}
              >
                <Shuffle size={20} />
              </button>
            </div>

            {/* Error during "generate more" or finish review */}
            {error && (
              <p className="mt-4 text-sm text-red-400">{error}</p>
            )}
            {finishError && (
              <p className="mt-4 text-sm text-red-400 text-center">{finishError}</p>
            )}
            {quizLookupFailed && reviewSaved && (
              <button
                type="button"
                onClick={() => void retryQuizLookup()}
                disabled={finishingReview}
                className="mt-3 text-sm font-medium text-[#8B6914] hover:underline disabled:opacity-50"
              >
                Try again
              </button>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {!reviewSaved && (
                <button
                  type="button"
                  onClick={() => void handleFinishReview()}
                  disabled={finishingReview}
                  className={
                    isLastCard
                      ? `flex items-center gap-2 rounded-xl bg-[#8B6914] px-6 py-3 text-base font-semibold text-white shadow-md transition-colors hover:bg-[#6F5410] disabled:cursor-not-allowed disabled:opacity-50`
                      : `flex items-center gap-2 rounded-lg border border-border-light bg-bg-container px-4 py-2 text-sm font-medium text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB] disabled:cursor-not-allowed disabled:opacity-50`
                  }
                >
                  {finishingReview ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving review...
                    </>
                  ) : (
                    'Finish Review'
                  )}
                </button>
              )}

              {isLastCard && (
                <button
                  onClick={handleGenerateMore}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1a2e] text-text-inverse
                             text-sm font-medium rounded-lg hover:bg-[#2a2a3e] transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Generate More Flashcards
                    </>
                  )}
                </button>
              )}
            </div>

            {quizGuidance && (
              <div
                className="mt-6 w-full max-w-xl rounded-xl border border-border-light bg-bg-container px-4 py-4"
                role="region"
                aria-label="Quiz next step"
              >
                <h2 className="text-sm font-semibold text-text-main">You finished this review</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {quizGuidance.action === 'open_quiz'
                    ? 'A quiz from this document is ready whenever you want to check what you remember.'
                    : 'You can make a quiz from this document whenever you want to check what you remember.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quizGuidance.action === 'open_quiz' ? (
                    <button
                      type="button"
                      onClick={() => openQuiz(quizGuidance.quizId)}
                      className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e]"
                    >
                      Take quiz
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openQuizSetup()}
                      className="rounded-xl bg-[#1a1a2e] px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-[#2a2a3e]"
                    >
                      Create quiz
                    </button>
                  )}
                  {quizGuidance.action === 'open_quiz' && quizGuidance.alternatives.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChoiceOpen(true)}
                      className="rounded-xl border border-border-light px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm"
                    >
                      Choose another quiz
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setQuizGuidance(null);
                      setChoiceOpen(false);
                    }}
                    className="rounded-xl border border-border-light px-4 py-2 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-bg-warm"
                  >
                    Later
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {flashcardPageContext && catalystChatContext && (
        <>
          <CatalystLauncher onClick={() => setCatalystOpen(true)} visible={!catalystOpen} buttonRef={catalystBtnRef} />
          <ContextualAiPanel
            open={catalystOpen}
            onClose={() => setCatalystOpen(false)}
            contextLabel={`Card ${currentIndex + 1} of ${flashcards.length} — ${displayName}`}
            suggestions={catalystSuggestions}
            pageContext={flashcardPageContext}
            chatContext={catalystChatContext}
            panelContextKey={`flashcard:${setId || docId}`}
            launcherRef={catalystBtnRef}
          />
        </>
      )}

      <FlashcardSetupModal
        open={!!pendingResource}
        documentName={pendingResource?.name ?? ''}
        onClose={handleCloseSetupModal}
        onGenerate={handleGenerateFromModal}
        loading={generating}
      />

      <QuizSetupModal
        open={quizFromResource.open}
        documentName={quizFromResource.documentName}
        onClose={quizFromResource.close}
        onStart={quizFromResource.start}
        loading={quizFromResource.loading}
        error={quizFromResource.error}
      />

      <QuizChoiceModal
        open={choiceOpen}
        quizzes={matchingQuizChoices}
        onClose={() => setChoiceOpen(false)}
        onSelect={openQuiz}
      />
    </div>
  );
}
