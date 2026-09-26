// Keeps users/{uid}/courseConfidence/{courseId}.quizEstimate current, so the
// AI's running picture of how a student is doing updates the moment they
// finish a quiz (the chat reads this cache on every turn - see
// loadConfidenceSnapshot in api/chat/route.ts). Same maths as the chat's
// get_course_confidence tool (courseConfidence.ts).
import { collection, doc, getDocs, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { quizEstimate, type QuizAttemptSummary } from "./courseConfidence";

export async function refreshCourseConfidence(uid: string, courseId: string, courseCode?: string): Promise<void> {
  const quizzes = await getDocs(collection(db, "users", uid, "enrollment", courseId, "quizSets"));
  const attempts: QuizAttemptSummary[] = [];
  await Promise.all(
    quizzes.docs.map(async (quiz) => {
      const snap = await getDocs(collection(quiz.ref, "attempts"));
      for (const a of snap.docs) {
        const d = a.data();
        const at = (d.completedAt as Timestamp | undefined)?.toDate?.();
        if (typeof d.score === "number" && typeof d.total === "number" && at) {
          const quizLength = Array.isArray(quiz.data().questions) ? quiz.data().questions.length : undefined;
          attempts.push({ quizName: String(quiz.data().name ?? ""), score: d.score, total: d.total, completedAt: at.toISOString(), quizLength });
        }
      }
    })
  );
  await setDoc(
    doc(db, "users", uid, "courseConfidence", courseId),
    { quizEstimate: quizEstimate(attempts), attemptCount: attempts.length, estimatedAt: serverTimestamp(), ...(courseCode ? { courseCode } : {}) },
    { merge: true }
  );
}
