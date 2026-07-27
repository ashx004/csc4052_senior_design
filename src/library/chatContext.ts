import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { Term } from "./academicTerm";

export type ChatDocument = {
  resourceId: string;
  name: string;
  fileType: string;
  category: string;
  url: string;
  // True once this document's chunks have been upserted into Qdrant
  // (src/library/vectorStore.ts), set at index time in api/embed-document —
  // lets searchDocuments (api/chat/route.ts) route straight to the fast
  // Qdrant path instead of inferring it from "did a search happen to return
  // anything," which would wrongly re-scan Firestore for every document a
  // given query just didn't match.
  vectorIndexed?: boolean;
};

export type ChatClass = {
  classId: string;
  className: string;
  classCode: string;
  term: string;
  facultyName: string;
  facultyEmail: string;
  facultyPhoneNumber: string;
  facultyOfficeNumber: string;
  classSchedule: string;
  classRoom: string;
  classDescription: string;
  documents: ChatDocument[];
  // Structured mirrors of classCode/term — present for enrollments added
  // after src/library/academicTerm.ts existed, absent (and parseable via
  // parseTermString/parseCourseCode) on older ones.
  termSeason?: Term;
  termYear?: number;
  subject?: string;
  courseNumber?: string;
};

// Describes what page the student is currently viewing, so the AI side
// panel (src/components/aiPanel/AIPanel.tsx) can answer "what am I looking
// at" style questions grounded in the real on-screen data instead of
// guessing. Kept as one free-text `summary` block rather than a rigid
// per-page schema, mirroring how the rest of this context gets turned into
// prose for the system prompt anyway.
export type PageAIContext = {
  page: string;
  label: string;
  summary: string;
  data?: Record<string, unknown>;
};

export type ChatContext = {
  userId: string;
  email: string;
  name: string;
  college: string;
  classes: ChatClass[];
  pageContext?: PageAIContext;
};

// Pulls together everything the AI assistant is allowed to know about the
// current student: identity, enrolled classes, and the course documents
// available to each one (metadata only — full text is fetched on demand
// server-side via the read_document tool).
export async function buildChatContext(userId: string, email: string): Promise<ChatContext> {
  let name = "";
  let college = "";
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      name = userData.name ?? "";
      college = userData.college ?? "";
    }
  } catch (error) {
    console.error("Error fetching user profile for chat context:", error);
  }

  const classes: ChatClass[] = [];
  try {
    const enrollmentRef = collection(db, "users", userId, "enrollment");
    const enrollmentSnap = await getDocs(enrollmentRef);

    for (const enrollmentDoc of enrollmentSnap.docs) {
      const data = enrollmentDoc.data();
      const documents: ChatDocument[] = [];

      try {
        const resourcesRef = collection(
          db,
          "users",
          userId,
          "enrollment",
          enrollmentDoc.id,
          "resources"
        );
        const resourcesSnap = await getDocs(resourcesRef);
        resourcesSnap.forEach((resourceDoc) => {
          const resourceData = resourceDoc.data();
          documents.push({
            resourceId: resourceDoc.id,
            name: resourceData.name ?? "Untitled",
            fileType: resourceData.fileType ?? "",
            category: resourceData.category ?? "",
            url: resourceData.url ?? "",
            vectorIndexed: resourceData.vectorIndexed === true,
          });
        });
      } catch (error) {
        console.error(`Error fetching resources for class ${enrollmentDoc.id}:`, error);
      }

      classes.push({
        classId: enrollmentDoc.id,
        className: data.className ?? "",
        classCode: data.classCode ?? "",
        term: data.term ?? "",
        facultyName: data.facultyName ?? "",
        facultyEmail: data.facultyEmail ?? "",
        facultyPhoneNumber: data.facultyPhoneNumber ?? "",
        facultyOfficeNumber: data.facultyOfficeNumber ?? "",
        classSchedule: data.classSchedule ?? "",
        classRoom: data.classRoom ?? "",
        classDescription: data.classDescription ?? "",
        termSeason: data.termSeason,
        termYear: data.termYear,
        subject: data.subject,
        courseNumber: data.courseNumber,
        documents,
      });
    }
  } catch (error) {
    console.error("Error fetching enrollments for chat context:", error);
  }

  return { userId, email, name, college, classes };
}
