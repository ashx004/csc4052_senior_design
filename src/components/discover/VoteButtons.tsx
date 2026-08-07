"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { voteOnStudySet } from "@/src/library/discover/voteOnStudySet";

interface VoteButtonsProps {
  publicSetId: string;
  currentVoterId: string;
  isOwner: boolean;
  initialPositive: number;
  initialNegative: number;
}

export default function VoteButtons({
  publicSetId,
  currentVoterId,
  isOwner,
  initialPositive,
  initialNegative,
}: VoteButtonsProps) {
  const [positive, setPositive] = useState(initialPositive);
  const [negative, setNegative] = useState(initialNegative);
  const [myVote, setMyVote] = useState<"up" | "down" | null>(null);
  const [checkingVote, setCheckingVote] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadExistingVote = async () => {
      setCheckingVote(true);
      try {
        const voteRef = doc(db, "publicStudySets", publicSetId, "votes", currentVoterId);
        const snap = await getDoc(voteRef);
        if (cancelled) return;
        if (snap.exists()) {
          setMyVote((snap.data().vote as "up" | "down") ?? null);
        }
      } catch (error) {
        console.error("Error loading existing vote:", error);
      } finally {
        if (!cancelled) setCheckingVote(false);
      }
    };

    loadExistingVote();
    return () => {
      cancelled = true;
    };
  }, [publicSetId, currentVoterId]);

  const handleVote = async (choice: "up" | "down") => {
    if (isOwner || pending || checkingVote) return;

    const nextVote = myVote === choice ? "none" : choice;
    const previousVote = myVote;

    // Optimistic UI update — reverses on failure.
    setPending(true);
    setPositive((count) => {
      let next = count;
      if (previousVote === "up") next -= 1;
      if (nextVote === "up") next += 1;
      return next;
    });
    setNegative((count) => {
      let next = count;
      if (previousVote === "down") next -= 1;
      if (nextVote === "down") next += 1;
      return next;
    });
    setMyVote(nextVote === "none" ? null : nextVote);

    try {
      await voteOnStudySet({ publicSetId, voterId: currentVoterId, vote: nextVote });
    } catch (error) {
      console.error("Error casting vote:", error);
      // Revert optimistic update on failure.
      setPositive((count) => {
        let next = count;
        if (nextVote === "up") next -= 1;
        if (previousVote === "up") next += 1;
        return next;
      });
      setNegative((count) => {
        let next = count;
        if (nextVote === "down") next -= 1;
        if (previousVote === "down") next += 1;
        return next;
      });
      setMyVote(previousVote);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 text-xs text-text-muted">
      <button
        type="button"
        onClick={() => handleVote("up")}
        disabled={isOwner || pending || checkingVote}
        title={isOwner ? "You can't vote on your own set" : undefined}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          myVote === "up"
            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "border-border-light hover:bg-bg-warm"
        }`}
      >
        {checkingVote ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
        {positive}
      </button>
      <button
        type="button"
        onClick={() => handleVote("down")}
        disabled={isOwner || pending || checkingVote}
        title={isOwner ? "You can't vote on your own set" : undefined}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          myVote === "down"
            ? "border-red-400 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            : "border-border-light hover:bg-bg-warm"
        }`}
      >
        {checkingVote ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
        {negative}
      </button>
    </div>
  );
}
