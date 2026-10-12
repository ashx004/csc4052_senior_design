import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { Term } from "./academicTerm";
import { EnrollmentStatus, getEnrollmentStatus } from "./enrollmentStatus";
import type { StructuredClassSchedule } from "./classSchedule";

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
  // Documents remain visible in the class, but are excluded from AI search
  // until their newest indexing run is complete. This prevents a retry from
  // surfacing old chunks while its replacement is still being written.
  indexStatus?: "queued" | "processing" | "complete" | "failed";
  // True when this document's text came from OCR-transcribing an uploaded
  // image rather than a native text/PDF file — see
  // embed-document/route.ts's persistImageTranscriptionAsResource.
  ocrScanned?: boolean;
};

export type ChatClass = StructuredClassSchedule & {
  classId: string;
  className: string;
  classCode: string;
  term: string;
  facultyName: string;
  facultyEmail: string;
  facultyPhoneNumber: string;
  facultyOfficeNumber: string;
  classSchedule: string;
  /** Meeting time, e.g. "3:30 - 4:45" */
  time?: string;
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
  // The AI must never present a "completed" class as one the student is
  // currently taking — see getEnrollmentStatus for how this is derived.
  status: EnrollmentStatus;
};

// Describes what page the student is currently viewing — the external API
// for useSetPageContext (src/context/AIPageContext.tsx). Kept as one
// free-text `summary` block rather than a rigid per-page schema, since
// that's cheap for a page to produce and useAIPanelChat converts it into a
// PageTextPageContext (src/library/Contextual_AI/contextualAi.ts) at send
// time — the single mechanism the server actually turns page context into
// prompt text with (see buildPageContextPrompt), shared with
// ContextualAiPanel's course/flashcard/quiz-result contexts.
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
  /** The browser's IANA time zone - the chat's calendar tools and "current
   *  time" read and write wall-clock times in it (the server runs in UTC). */
  timeZone?: string;
};

export function toChatDocument(resourceId: string, resourceData: Record<string, any>): ChatDocument {
  return {
    resourceId,
    name: resourceData.name ?? "Untitled",
    fileType: resourceData.fileType ?? "",
    category: resourceData.category ?? "",
    url: resourceData.url ?? "",
    vectorIndexed: resourceData.vectorIndexed === true,
    indexStatus:
      resourceData.indexStatus === "queued" ||
      resourceData.indexStatus === "processing" ||
      resourceData.indexStatus === "complete" ||
      resourceData.indexStatus === "failed"
        ? resourceData.indexStatus
        : undefined,
    ocrScanned: resourceData.ocrScanned === true,
  };
}

export function toChatClass(classId: string, data: Record<string, any>, documents: ChatDocument[]): ChatClass {
  return {
    classId,
    className: data.className ?? "",
    classCode: data.classCode ?? "",
    term: data.term ?? "",
    facultyName: data.facultyName ?? "",
    facultyEmail: data.facultyEmail ?? "",
    facultyPhoneNumber: data.facultyPhoneNumber ?? "",
    facultyOfficeNumber: data.facultyOfficeNumber ?? "",
    classSchedule: data.classSchedule ?? "",
    time: data.time ?? "",
    classRoom: data.classRoom ?? "",
    classDescription: data.classDescription ?? "",
    meetingDays: Array.isArray(data.meetingDays) ? data.meetingDays : undefined,
    meetingStartTime: typeof data.meetingStartTime === "string" ? data.meetingStartTime : undefined,
    meetingEndTime: typeof data.meetingEndTime === "string" ? data.meetingEndTime : undefined,
    meetingTimeZone: typeof data.meetingTimeZone === "string" ? data.meetingTimeZone : undefined,
    termStartDate: typeof data.termStartDate === "string" ? data.termStartDate : undefined,
    termEndDate: typeof data.termEndDate === "string" ? data.termEndDate : undefined,
    termSeason: data.termSeason,
    termYear: data.termYear,
    subject: data.subject,
    courseNumber: data.courseNumber,
    status: getEnrollmentStatus(data),
    documents,
  };
}

export function browserTimeZone(): string | undefined {
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
}

// Pulls together everything the AI assistant is allowed to know about the
// current student: identity, enrolled classes, and the course documents
// available to each one (metadata only — full text is fetched on demand
// server-side via the read_document tool). A one-time snapshot; screens that
// stay open while files change use useChatContext (src/hooks) instead.
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
    const enrollmentSnap = await getDocs(collection(db, "users", userId, "enrollment"));

    for (const enrollmentDoc of enrollmentSnap.docs) {
      const documents: ChatDocument[] = [];
      try {
        const resourcesSnap = await getDocs(collection(db, "users", userId, "enrollment", enrollmentDoc.id, "resources"));
        resourcesSnap.forEach((resourceDoc) => documents.push(toChatDocument(resourceDoc.id, resourceDoc.data())));
      } catch (error) {
        console.error(`Error fetching resources for class ${enrollmentDoc.id}:`, error);
      }
      classes.push(toChatClass(enrollmentDoc.id, enrollmentDoc.data(), documents));
    }
  } catch (error) {
    console.error("Error fetching enrollments for chat context:", error);
  }

  return { userId, email, name, college, classes, timeZone: browserTimeZone() };
}
