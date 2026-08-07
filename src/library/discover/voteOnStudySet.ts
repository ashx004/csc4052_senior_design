import { doc, increment, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";

/**
 * Cast, change, or remove a vote on a public study set.
 * Uses a Firestore transaction to atomically update the vote record and the
 * aggregate positive/negative counts together.
 *
 * SECURITY NOTE: this function does NOT check whether `voterId` (the voting
 * user's uid) is the set's owner — Firestore transactions can only `get()`
 * individual documents, not run a collection query, so the ownerMapping
 * lookup needed for that check can't happen inside the transaction. Per the
 * spec, ownership is instead checked by the calling component (VoteButtons'
 * `isOwner` prop), which disables the vote buttons for the owner. That is a
 * CLIENT-SIDE-ONLY guard — nothing here stops a malicious client from
 * calling this function directly (e.g. via devtools) to vote on their own
 * set, since there is no committed firestore.rules in this repo to enforce
 * it server-side either. Flagging this as a known, deferred gap consistent
 * with the "don't touch firestore.rules in this batch" instruction — it
 * should be closed before this feature is relied on for real integrity
 * guarantees.
 */
export async function voteOnStudySet(params: {
  publicSetId: string;
  voterId: string;
  vote: "up" | "down" | "none"; // "none" removes the vote
}): Promise<void> {
  const { publicSetId, voterId, vote } = params;
  const setRef = doc(db, "publicStudySets", publicSetId);
  const voteRef = doc(db, "publicStudySets", publicSetId, "votes", voterId);

  await runTransaction(db, async (transaction) => {
    const setSnap = await transaction.get(setRef);
    const voteSnap = await transaction.get(voteRef);

    if (!setSnap.exists()) throw new Error("Study set not found");

    const previousVote = voteSnap.exists() ? voteSnap.data().vote : null;

    // Calculate delta
    let positiveDelta = 0;
    let negativeDelta = 0;

    // Remove old vote effect
    if (previousVote === "up") positiveDelta -= 1;
    if (previousVote === "down") negativeDelta -= 1;

    // Apply new vote effect
    if (vote === "up") positiveDelta += 1;
    if (vote === "down") negativeDelta += 1;

    // Update aggregates on the public set doc
    transaction.update(setRef, {
      positiveVotes: increment(positiveDelta),
      negativeVotes: increment(negativeDelta),
      updatedAt: serverTimestamp(),
    });

    // Write or delete vote record
    if (vote === "none") {
      transaction.delete(voteRef);
    } else {
      transaction.set(voteRef, {
        voterId,
        vote,
        votedAt: serverTimestamp(),
      });
    }
  });
}
