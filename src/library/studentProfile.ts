import { doc, getDoc, updateDoc, deleteField, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { firestoreGet } from "./firestoreRest";

// The "Core memory" tier of a small, tiered memory system — a short,
// always-loaded profile of durable facts about a student (academic/career
// goals, what teaching styles work for them), refreshed periodically rather
// than on every message. Deliberately small-form: a single evolving text
// summary, not a knowledge graph or vector store — this is the "Learner
// Model" component of a classic adaptive-tutoring-system architecture.
// recall_past_chat (searchable full history) is the "Recall" tier; raw
// Firestore chat storage is "Archival". This is the missing Core tier.
// Updating the profile with AI is server-side: studentProfileUpdate.ts.

export interface StudentProfile {
  summary: string;
  messageCount: number;
  updatedAt?: Date;
}

function parseLearnerProfileUpdatedAt(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

export async function getStudentProfile(userId: string, idToken?: string): Promise<StudentProfile> {
  try {
    const data = idToken
      ? await firestoreGet(idToken, "users", userId)
      : await getClientUserData(userId);
    if (!data) return { summary: "", messageCount: 0 };
    return {
      summary: typeof data.learnerProfileSummary === "string" ? data.learnerProfileSummary : "",
      messageCount: typeof data.learnerProfileMessageCount === "number" ? data.learnerProfileMessageCount : 0,
      updatedAt: parseLearnerProfileUpdatedAt(data.learnerProfileUpdatedAt),
    };
  } catch (error) {
    console.error("Error loading student profile:", error);
    return { summary: "", messageCount: 0 };
  }
}

async function getClientUserData(userId: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  return snap.data() as Record<string, unknown>;
}

// Full removal, not just clearing the text — a student should be able to
// make the assistant "forget" them completely, matching the transparency
// pattern ChatGPT's memory settings use (view + delete your own profile).
export async function clearStudentProfile(userId: string): Promise<void> {
  await updateDoc(doc(db, "users", userId), {
    learnerProfileSummary: deleteField(),
    learnerProfileMessageCount: deleteField(),
    learnerProfileUpdatedAt: deleteField(),
  });
}
