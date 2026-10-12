import { collection, doc, getDocs, writeBatch, type Firestore } from "firebase/firestore";

// Firestore doesn't delete a document's subcollections along with it, so
// removing a practice set has to remove its saved attempts too or they linger
// unseen. Attempts first, then the set: if this stops partway the set is still
// listed and the student can simply delete it again.

const BATCH_LIMIT = 400;

export async function deletePracticeSet(db: Firestore, uid: string, courseId: string, setId: string): Promise<void> {
  const setRef = doc(db, "users", uid, "enrollment", courseId, "practiceSets", setId);
  const attempts = await getDocs(collection(setRef, "attempts"));
  for (let i = 0; i < attempts.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const attempt of attempts.docs.slice(i, i + BATCH_LIMIT)) batch.delete(attempt.ref);
    await batch.commit();
  }
  const last = writeBatch(db);
  last.delete(setRef);
  await last.commit();
}
