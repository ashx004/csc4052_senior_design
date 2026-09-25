import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";

/**
 * Handles Public → Private for a previously published study set.
 *
 * Soft-deletes the public doc (status: "deleted") instead of removing it,
 * so students who already saved an independent copy of it are unaffected —
 * their copy lives entirely under their own users/{uid}/... tree and has no
 * live dependency on this document. Marking it "deleted" just removes it
 * from future Discover query results (status === "active" is one of the
 * required filters on that query).
 *
 * If this set was published before ownerMapping existed, the mapping is
 * created first so firestore.rules can verify ownership on the status write.
 */
export async function unpublishStudySet(
  publicSetId: string,
  ownerUid: string
): Promise<void> {
  const mappingRef = doc(db, "publicStudySets", publicSetId, "ownerMapping", "owner");
  const mappingSnap = await getDoc(mappingRef);

  if (!mappingSnap.exists()) {
    await setDoc(mappingRef, {
      ownerUid,
      originalPath: "",
      publishedAt: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, "publicStudySets", publicSetId), {
    status: "deleted",
    updatedAt: serverTimestamp(),
  });
}
