"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface BlocksIntroProps {
  onStart: () => void;
}

export default function BlocksIntro({ onStart }: BlocksIntroProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1a1a2e] text-2xl font-black text-white">
        B
      </div>
      <h1 className="text-2xl font-bold text-[#1a1a2e]">Build, Play, And Learn With Blocks!</h1>
      <p className="max-w-sm text-sm text-gray-500">Answer questions, build with blocks, and make studying fun!</p>

      <div className="mt-2 flex flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-[#1a1a2e] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          Play Blocks
        </button>
        <button
          type="button"
          onClick={() => setShowInstructions(true)}
          className="rounded-full border border-border-light bg-bg-warm px-8 py-3 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB]"
        >
          How to Play
        </button>
      </div>

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-xl">
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              aria-label="Close instructions"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <h2 className="mb-3 text-lg font-bold text-[#1a1a2e]">How to Play</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Drag pieces from your hand onto the 8×8 board.</li>
              <li>Fill a full row or column to clear it and free up space.</li>
              <li>Your score is the total number of blocks you place.</li>
              <li>Once you've placed all 4 pieces in your hand, answer a study question to earn your next 4.</li>
              <li>A wrong answer just shows the correct one — try again, no penalty.</li>
              <li>You get 3 skips per game if you want a different question.</li>
              <li>The game ends when none of your pieces can fit on the board anymore.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
