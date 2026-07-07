'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, MessagesSquare, Bookmark, RefreshCw, Shuffle } from 'lucide-react';
import FlashCard from '@/src/components/learning/FlashCard';

const mockFlashcards = [
  { id: 1, question: 'What is a Boolean value?', answer: 'A value that can only be true or false.' },
  { id: 2, question: 'What is a variable?', answer: 'A named container that stores a value in memory.' },
  { id: 3, question: 'What is an array?', answer: 'An ordered collection of elements, each identified by an index.' },
  { id: 4, question: 'What is a function?', answer: 'A reusable block of code that performs a specific task.' },
  { id: 5, question: 'What is a loop?', answer: 'A control structure that repeats a block of code while a condition is true.' },
  { id: 6, question: 'What is a conditional statement?', answer: 'A statement that executes different code depending on whether a condition is true or false.' },
  { id: 7, question: 'What is recursion?', answer: 'A technique where a function calls itself to solve a smaller version of the same problem.' },
  { id: 8, question: 'What is a string?', answer: 'A sequence of characters used to represent text.' },
  { id: 9, question: 'What is an algorithm?', answer: 'A step-by-step procedure for solving a problem or performing a computation.' },
  { id: 10, question: 'What is a data type?', answer: 'A classification that specifies the kind of value a variable can hold, such as integer, string, or boolean.' },
];

export default function FlashcardsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const courseId = params.courseId as string;
  const docName = searchParams.get('docName') || 'Document';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [cards, setCards] = useState(mockFlashcards);
  const [isShuffled, setIsShuffled] = useState(false);

  const shuffleCards = () => {
    if (isShuffled) {
      setCards(mockFlashcards);
    } else {
      const shuffled = [...mockFlashcards].sort(() => Math.random() - 0.5);
      setCards(shuffled);
    }
    setIsShuffled(!isShuffled);
    setCurrentIndex(0);
  };

  const totalCards = cards.length;

  const isFirstCard = currentIndex === 0;
  const isLastCard = currentIndex === totalCards - 1;

  const goToPrevious = () => {
    if (!isFirstCard) setCurrentIndex((prev) => prev - 1);
  };

  const goToNext = () => {
    if (!isLastCard) setCurrentIndex((prev) => prev + 1);
  };

  const handleGenerateMore = () => {
    // Phase 3: will call AI to generate a new set of 10 flashcards
    setCurrentIndex(0);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-16 py-7 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/courses/${courseId}/learning`)}
            className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-[#1a1a2e]">
            {decodeURIComponent(docName)}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <MessagesSquare size={20} className="text-gray-500" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <Bookmark size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Flashcard area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* key={currentIndex} forces React to remount the card, resetting flip state */}
        <FlashCard
          key={currentIndex}
          question={cards[currentIndex].question}
          answer={cards[currentIndex].answer}
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

        {/* Generate More — only on last card */}
        {isLastCard && (
          <button
            onClick={handleGenerateMore}
            className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-[#1a1a2e] text-white
                       text-sm font-medium rounded-lg hover:bg-[#2a2a3e] transition-colors"
          >
            <RefreshCw size={16} />
            Generate More Flashcards
          </button>
        )}
      </div>
    </div>
  );
}