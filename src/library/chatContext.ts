import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export type ChatDocument = {
  resourceId: string;
  name: string;
  fileType: string;
  category: string;
  url: string;
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
};

export type ChatContext = {
  userId: string;
  email: string;
  name: string;
  college: string;
  classes: ChatClass[];
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
        documents,
      });
    }
  } catch (error) {
    console.error("Error fetching enrollments for chat context:", error);
  }

  return { userId, email, name, college, classes };
}
