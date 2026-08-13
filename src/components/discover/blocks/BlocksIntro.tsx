"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface BlocksIntroProps {
  onStart: () => void;
}

export default function BlocksIntro({ onStart }: BlocksIntroProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-8 text-center">
      <div className="relative mb-8 h-[240px] w-full max-w-[620px] overflow-hidden rounded-2xl sm:h-[300px]">
        <img
          src="/block_game.png"
          alt="Blocks"
          className="absolute inset-0 h-full w-full scale-110 object-cover object-center"
        />
      </div>

      <h1 className="max-w-xl text-2xl font-bold text-[#1a1a2e] sm:text-3xl">
        Build, Play, And Learn With Blocks!
      </h1>
      <p className="mt-3 max-w-[460px] text-base text-gray-500">
        Answer questions, build with blocks, and make studying fun!
      </p>

      <div className="mt-8 flex w-full max-w-[220px] flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-full bg-[#1a1a2e] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e]"
        >
          Play Blocks
        </button>
        <button
          type="button"
          onClick={() => setShowInstructions(true)}
          className="w-full rounded-full border border-border-light bg-bg-warm px-8 py-3 text-sm font-semibold text-[#1a1a2e] transition-colors hover:bg-[#F5F0EB]"
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
