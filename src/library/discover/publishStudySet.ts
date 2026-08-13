import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
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
 * The ownerMapping subdoc is written at a fixed ID ("owner") so
 * firestore.rules can restrict its read/write to the owner — see that
 * file's `publicStudySets/{setId}/ownerMapping/{mappingId}` rule.
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

  // Write the private owner mapping at a fixed doc ID ("owner") rather than
  // an auto-generated one — firestore.rules can only get() a document at a
  // known path, and this is the path its owner-only read/write rule checks.
  await setDoc(doc(db, "publicStudySets", publicRef.id, "ownerMapping", "owner"), {
    ownerUid: params.ownerUid,
    originalPath: params.originalPath,
    publishedAt: serverTimestamp(),
  });

  return publicRef.id;
}
