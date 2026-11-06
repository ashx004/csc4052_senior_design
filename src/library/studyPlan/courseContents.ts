import { collection, getDocsFromServer } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import type { CourseContents } from "./staleTaskPruning";
import type { RecommendationResource } from "./recommendationEngine";

/**
 * What each course still holds, for deciding whether a study task's target still exists.
 *
 * The safety rule this module exists to make structural: a course may only be recorded as
 * holding something when the read actually succeeded against the server. Anything else is
 * recorded as `null`, which the classifier reads as "unknown" and never prunes.
 *
 * The reads use `getDocsFromServer`, not `getDocs`. The default `getDocs` source attempts the
 * server and *falls back to the local cache* when the server is unreachable, resolving with
 * `metadata.fromCache === true` instead of rejecting. An offline client would therefore record
 * an empty `quizSetIds` / `flashcardSetIds` as a successful "this course has no sets left" and
 * every quiz and flashcard task in the plan would be deleted. `getDocsFromServer` rejects
 * instead, so a short-circuited read lands in the same `catch` as a thrown one. The cost is
 * that pruning always needs a round trip, and on a flaky connection it simply does nothing
 * that day — which is the safe direction.
 */
export async function loadCourseContents(
  uid: string,
  classIds: readonly string[]
): Promise<Map<string, CourseContents>> {
  const contentsByCourse = new Map<string, CourseContents>();
  await Promise.all(
    classIds.map(async (classId) => {
      try {
        // One Promise.all over the three collections, so a partial failure rejects the whole
        // course: there is no path that can build a CourseContents from a half-read course.
        const [resourceSnap, quizSnap, flashcardSnap] = await Promise.all([
          getDocsFromServer(collection(db, "users", uid, "enrollment", classId, "resources")),
          getDocsFromServer(collection(db, "users", uid, "enrollment", classId, "quizSets")),
          getDocsFromServer(collection(db, "users", uid, "enrollment", classId, "flashcardSets")),
        ]);
        contentsByCourse.set(classId, {
          resources: resourceSnap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as RecommendationResource
          ),
          quizSetIds: new Set(quizSnap.docs.map((d) => d.id)),
          flashcardSetIds: new Set(flashcardSnap.docs.map((d) => d.id)),
        });
      } catch (err) {
        // A failed read proves nothing about what this course holds. An empty CourseContents
        // would read as "this course has nothing left" and delete every task in it, so the
        // only safe record of a failure is null. It is logged because the failure is otherwise
        // invisible: a persistent permission-denied would silently stop pruning for good.
        console.error("Couldn't read a course's contents for study-task pruning:", classId, err);
        contentsByCourse.set(classId, null);
      }
    })
  );
  return contentsByCourse;
}
