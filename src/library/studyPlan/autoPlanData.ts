import { collection, getDocs, limit, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyTasksCollection } from "./firestorePaths";
import type { NewestDocument } from "./planStarter";
import type { StudyTask } from "./types";

export async function loadTasksSince(
  uid: string,
  fromDate: string
): Promise<Pick<StudyTask, "courseId">[]> {
  const snap = await getDocs(
    query(collection(db, studyTasksCollection(uid)), where("scheduledDate", ">=", fromDate))
  );
  return snap.docs.map((d) => ({ courseId: d.data().courseId as StudyTask["courseId"] }));
}

export async function loadNewestDocument(
  uid: string,
  classIds: readonly string[]
): Promise<NewestDocument | null> {
  let best: { millis: number; doc: NewestDocument } | null = null;
  for (const classId of classIds) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "enrollment", classId, "resources"),
          orderBy("uploadedAt", "desc"),
          limit(1)
        )
      );
      const d = snap.docs[0];
      if (!d) continue;
      const data = d.data();
      const millis = (data.uploadedAt as Timestamp | undefined)?.toMillis() ?? 0;
      if (!best || millis > best.millis) {
        best = {
          millis,
          doc: { courseId: classId, resourceId: d.id, name: data.name ?? "your document" },
        };
      }
    } catch {
      continue;
    }
  }
  return best ? best.doc : null;
}
