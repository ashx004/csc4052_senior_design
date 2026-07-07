'use client';

import { useState } from 'react';

interface FlashCardProps {
  question: string;
  answer: string;
}

export default function FlashCard({ question, answer }: FlashCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className="w-full max-w-xl mx-auto cursor-pointer"
      style={{ perspective: '1200px' }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className="relative w-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '280px',
        }}
      >
        {/* Front — Question */}
        <div
          className="absolute inset-0 bg-white rounded-2xl border border-gray-200 shadow-md
                     px-8 py-10 flex flex-col items-center justify-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-sm text-gray-400 mb-4">Question</p>
          <p className="text-base font-semibold text-[#1a1a2e] text-center leading-relaxed mb-8">
            {question}
          </p>
          <span className="px-5 py-2 text-sm font-medium border border-gray-800 rounded-md text-gray-800">
            Reveal Answer
          </span>
        </div>

        {/* Back — Answer */}
        <div
          className="absolute inset-0 bg-white rounded-2xl border border-gray-200 shadow-md
                     px-8 py-10 flex flex-col items-center justify-center"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <p className="text-sm text-gray-400 mb-4">Answer</p>
          <p className="text-base font-semibold text-[#1a1a2e] text-center leading-relaxed mb-8">
            {answer}
          </p>
          <span className="px-5 py-2 text-sm font-medium border border-gray-800 rounded-md text-gray-800">
            Back to question
          </span>
        </div>
      </div>
    </div>
  );
}