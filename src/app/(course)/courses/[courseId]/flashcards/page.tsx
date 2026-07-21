'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import {ArrowLeft,ChevronLeft,ChevronRight,BookOpen,Bookmark,RefreshCw,Shuffle,Loader2,AlertCircle,} from 'lucide-react';
import FlashCard from '@/src/components/learning/FlashCard';

interface Flashcard {
  question: string;
  answer: string;
}

export default function FlashcardsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const courseId = params.courseId as string;
  const docId = searchParams.get('docId') || '';
  const docName = searchParams.get('docName') || 'Document';

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [originalCards, setOriginalCards] = useState<Flashcard[]>([]);
  const [allPreviousQuestions, setAllPreviousQuestions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the resource URL and generate flashcards on mount
  useEffect(() => {
    if (!user || !docId) return;

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

        // Call our API to generate flashcards
        const response = await fetch('/api/generate-flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docUrl: resource.url,
            docName: resource.name,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Failed to generate flashcards.');
          setLoading(false);
          return;
        }

        setFlashcards(data.flashcards);
        setOriginalCards(data.flashcards);
        setAllPreviousQuestions(data.flashcards.map((f: Flashcard) => f.question));
      } catch (err) {
        console.error('Error generating flashcards:', err);
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    generateInitialFlashcards();
  }, [user, docId, courseId]);

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
      const resources = await getCourseResources(user.uid, courseId);
      const resource = resources.find((r: { id: string }) => r.id === docId);

      if (!resource) {
        setError('Document not found.');
        setGenerating(false);
        return;
      }

      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl: resource.url,
          docName: resource.name,
          previousQuestions: allPreviousQuestions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to generate more flashcards.');
        setGenerating(false);
        return;
      }

      setFlashcards(data.flashcards);
      setOriginalCards(data.flashcards);
      setIsShuffled(false);
      setCurrentIndex(0);
      setAllPreviousQuestions((prev) => [
        ...prev,
        ...data.flashcards.map((f: Flashcard) => f.question),
      ]);
    } catch (err) {
      console.error('Error generating more flashcards:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-container flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-text-muted text-sm">Reading your document and generating flashcards...</p>
        <p className="text-text-muted text-xs">This may take a few seconds</p>
      </div>
    );
  }

  // Error state
  if (error && flashcards.length === 0) {
    return (
      <div className="min-h-screen bg-bg-container flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-text-muted text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => router.push(`/courses/${courseId}/learning`)}
          className="mt-2 px-4 py-2 text-sm text-primary border border-primary rounded-lg hover:bg-bg-warm transition-colors"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-container flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="p-1.5 rounded-md hover:bg-bg-warm transition-colors"
          >
            <ArrowLeft size={20} className="text-text-muted" />
          </button>
          <h1 className="text-xl font-bold text-text-main">
            {decodeURIComponent(docName)}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-md hover:bg-bg-warm transition-colors">
            <BookOpen size={20} className="text-text-muted" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-bg-warm transition-colors">
            <Bookmark size={20} className="text-text-muted" />
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
                    ? 'text-text-muted cursor-not-allowed'
                    : 'text-text-muted hover:bg-bg-warm'
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
                    ? 'text-text-muted cursor-not-allowed'
                    : 'text-text-muted hover:bg-bg-warm'
                }`}
              >
                <ChevronRight size={24} />
              </button>

              <button
                onClick={shuffleCards}
                className={`p-2 rounded-md transition-colors ${
                  isShuffled
                    ? 'text-primary bg-bg-warm'
                    : 'text-text-muted hover:bg-bg-warm hover:text-text-muted'
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
                className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-primary text-white
                           text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors
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