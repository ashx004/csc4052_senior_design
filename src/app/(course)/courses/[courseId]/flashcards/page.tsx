'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
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
import {ArrowLeft,ChevronLeft,ChevronRight,BookOpen,Bookmark,RefreshCw,Shuffle,Loader2,AlertCircle,} from 'lucide-react';
import FlashCard from '@/src/components/learning/FlashCard';

interface Flashcard {
  question: string;
  answer: string;
}

function extractStorageKey(url: string): string {
  return decodeURIComponent(url.split('key=')[1] ?? '');
}

async function requestFlashcards(
  docUrl: string,
  docName: string,
  previousQuestions?: string[]
): Promise<{ topicName: string; questions: Flashcard[] }> {
  const response = await fetch('/api/generate-flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docUrl, docName, previousQuestions }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate flashcards.');
  }

  return { topicName: data.topicName, questions: data.questions };
}

// Creates a new flashcardSets doc for this source document, or appends cards
// to the existing one if a set for this sourceDocKey already exists.
async function persistFlashcardSet(
  userId: string,
  courseId: string,
  sourceDocKey: string,
  topicName: string,
  cards: Flashcard[]
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
  const docId = searchParams.get('docId') || '';
  const docNameParam = searchParams.get('docName') || '';
  const setId = searchParams.get('setId') || '';

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

  // Generate a brand-new set of flashcards from a source document
  useEffect(() => {
    if (!user || !docId || setId) return;

    const generateInitialFlashcards = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get the resource to find its download URL
        const resources = await getCourseResources(user.uid, courseId);
        const resource = resources.find((r: { id: string }) => r.id === docId);

        if (!resource) {
          setError('Document not found. It may have been deleted.');
          setLoading(false);
          return;
        }

        const key = extractStorageKey(resource.url);
        const { topicName, questions } = await requestFlashcards(resource.url, resource.name);

        setFlashcards(questions);
        setOriginalCards(questions);
        setAllPreviousQuestions(questions.map((f) => f.question));
        setDisplayName(topicName || resource.name);
        setSourceDocKey(key);

        await persistFlashcardSet(user.uid, courseId, key, topicName, questions);
      } catch (err) {
        console.error('Error generating flashcards:', err);
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    generateInitialFlashcards();
  }, [user, docId, setId, courseId]);

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
        await persistFlashcardSet(user.uid, courseId, sourceDocKey, '', questions);
      }
    } catch (err) {
      console.error('Error generating more flashcards:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="animate-spin text-[#8B6914]" />
        <p className="text-gray-500 text-sm">
          {setId ? 'Loading your saved flashcards...' : 'Reading your document and generating flashcards...'}
        </p>
        {!setId && <p className="text-gray-400 text-xs">This may take a few seconds</p>}
      </div>
    );
  }

  // Error state
  if (error && flashcards.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-gray-700 text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => router.push(`/courses/${courseId}/learning`)}
          className="mt-2 px-4 py-2 text-sm text-[#8B6914] border border-[#8B6914] rounded-lg hover:bg-[#F5F0EB] transition-colors"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-[#1a1a2e]">
            {displayName}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <BookOpen size={20} className="text-gray-500" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <Bookmark size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Flashcard area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {flashcards.length > 0 && (
          <>
            <FlashCard
              key={currentIndex}
              question={flashcards[currentIndex].question}
              answer={flashcards[currentIndex].answer}
            />

            {/* Navigation */}
            <div className="flex items-center gap-6 mt-8">
              <button
                onClick={goToPrevious}
                disabled={isFirstCard}
                className={`p-2 rounded-md transition-colors ${
                  isFirstCard
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronLeft size={24} />
              </button>

              <span className="text-sm font-medium text-gray-600 min-w-[40px] text-center">
                {currentIndex + 1}/{totalCards}
              </span>

              <button
                onClick={goToNext}
                disabled={isLastCard}
                className={`p-2 rounded-md transition-colors ${
                  isLastCard
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-[#F5F0EB]'
                }`}
              >
                <ChevronRight size={24} />
              </button>

              <button
                onClick={shuffleCards}
                className={`p-2 rounded-md transition-colors ${
                  isShuffled
                    ? 'text-[#8B6914] bg-[#F5F0EB]'
                    : 'text-gray-400 hover:bg-[#F5F0EB] hover:text-gray-600'
                }`}
                title={isShuffled ? 'Unshuffle' : 'Shuffle'}
              >
                <Shuffle size={20} />
              </button>
            </div>

            {/* Error during "generate more" */}
            {error && (
              <p className="mt-4 text-sm text-red-400">{error}</p>
            )}

            {/* Generate More — only on last card */}
            {isLastCard && (
              <button
                onClick={handleGenerateMore}
                disabled={generating}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-[#1a1a2e] text-white
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
          </>
        )}
      </div>
    </div>
  );
}
