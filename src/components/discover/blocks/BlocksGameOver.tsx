"use client";

import { Trophy } from "lucide-react";

interface BlocksGameOverProps {
  finalScore: number;
  highScore: number;
  beatHighScore: boolean;
  onPlayAgain: () => void;
  onBackToDiscover: () => void;
}

export default function BlocksGameOver({
  finalScore,
  highScore,
  beatHighScore,
  onPlayAgain,
  onBackToDiscover,
}: BlocksGameOverProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">Game Over</h1>
      <p className="text-4xl font-black text-[#1a1a2e]">{finalScore}</p>
      <p className="text-sm text-gray-500">blocks placed</p>

      <div className="mt-2 flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
        <Trophy size={16} />
        {beatHighScore ? "New high score!" : `Best: ${highScore}`}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-full bg-[#1a1a2e] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onBackToDiscover}
          className="rounded-full border border-border-light bg-bg-warm px-8 py-3 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB]"
        >
          Back to Discover
        </button>
      </div>
    </div>
  );
}
