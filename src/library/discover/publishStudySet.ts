import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { sanitizeStudySet } from "./sanitizeStudySet";
import type { FlashcardCard, QuizQuestion } from "./types";

/** Remove keys whose value is undefined — Firestore rejects them. */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

interface RawSetData {
  name?: string;
  questions?: QuizQuestion[];
  cards?: FlashcardCard[];
}

/**
 * Publishes a sanitized copy of a study set to the public collection.
 * Called after a set is created (or toggled) with visibility === "public".
 *
 * SECURITY NOTE: this repo has no committed firestore.rules (confirmed
 * during Phase 0 investigation), so the ownerMapping subcollection this
 * writes to is NOT actually access-restricted today — any authenticated
 * client could query it directly and de-anonymize a creator or read
 * `originalPath`. Rules to lock `ownerMapping` reads down to the owner only
 * are out of scope for this batch per the "don't touch firestore.rules"
 * instruction, but this must be closed before this feature is safe to rely
 * on for real anonymity guarantees.
 */
export async function publishStudySet(params: {
  type: "quiz" | "flashcard";
  setData: RawSetData;
  courseCode: string;
  ownerUid: string;
  originalPath: string;
  creatorDisplayName?: string; // defaults to "Anonymous"
}): Promise<string> {
  const sanitized = sanitizeStudySet({
    type: params.type,
    setData: params.setData,
    courseCode: params.courseCode,
    schoolDomain: "latech.edu", // hardcoded for now
    creatorDisplayName: params.creatorDisplayName || "Anonymous",
  });

  // Write the public snapshot
  const publicRef = await addDoc(
    collection(db, "publicStudySets"),
    stripUndefined({
      ...sanitized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Write the private owner mapping (subcollection, intended to never be
  // exposed to other users — see the security note above).
  await addDoc(collection(db, "publicStudySets", publicRef.id, "ownerMapping"), {
    ownerUid: params.ownerUid,
    originalPath: params.originalPath,
    publishedAt: serverTimestamp(),
  });

  return publicRef.id;
}
