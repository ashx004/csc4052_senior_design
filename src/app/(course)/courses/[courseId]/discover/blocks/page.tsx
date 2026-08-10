"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Volume2, VolumeX, X } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import BlocksIntro from "@/src/components/discover/blocks/BlocksIntro";
import BlocksGame from "@/src/components/discover/blocks/BlocksGame";
import BlocksGameOver from "@/src/components/discover/blocks/BlocksGameOver";

type View = "intro" | "playing" | "gameover";

export default function BlocksPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const courseId = params.courseId as string;

  const [view, setView] = useState<View>("intro");
  const [result, setResult] = useState<{
    finalScore: number;
    highScore: number;
    beatHighScore: boolean;
  } | null>(null);
  // Bumped on "Play Again" to force BlocksGame to remount with fresh state,
  // rather than adding a manual reset path to its internal state machine.
  const [gameKey, setGameKey] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  const handleGameOver = (finalScore: number, highScore: number, beatHighScore: boolean) => {
    setResult({ finalScore, highScore, beatHighScore });
    setView("gameover");
  };

  const handlePlayAgain = () => {
    setGameKey((k) => k + 1);
    setResult(null);
    setView("playing");
  };

  const handleExit = () => {
    if (view === "playing") {
      if (!window.confirm("Leave the game? Your progress won't be saved.")) return;
    }
    router.push(`/courses/${courseId}/discover`);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-6 py-8 md:px-14">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleExit}
          aria-label="Back to Discover"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-bold text-[#1a1a2e]">Blocks</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            type="button"
            onClick={handleExit}
            aria-label="Exit game"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {view === "intro" && <BlocksIntro onStart={() => setView("playing")} />}
      {view === "playing" && <BlocksGame key={gameKey} uid={user.uid} onGameOver={handleGameOver} isMuted={isMuted} />}
      {view === "gameover" && result && (
        <BlocksGameOver
          finalScore={result.finalScore}
          highScore={result.highScore}
          beatHighScore={result.beatHighScore}
          onPlayAgain={handlePlayAgain}
          onBackToDiscover={() => router.push(`/courses/${courseId}/discover`)}
        />
      )}
    </div>
  );
}
