import { FieldValue } from "firebase-admin/firestore";
import {
  LOCAL_E2E_ADMIN_UID,
  LOCAL_E2E_FIXTURES,
  LOCAL_E2E_PROJECT_ID,
  LOCAL_E2E_STUDENT_UID,
} from "../src/library/e2eLocal";
import { TERMS_VERSION } from "../src/library/legalVersion";

if (process.env.E2E_LOCAL !== "true" || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("seedLocalE2E must run inside firebase emulators:exec.");
}

async function ensureUser(uid: string, email: string, displayName: string, admin = false) {
  const { adminAuth } = await import("../src/library/firebaseAdmin");
  await adminAuth.getUser(uid).catch(() => adminAuth.createUser({ uid, email, displayName, emailVerified: true, password: "local-e2e-password" }));
  await adminAuth.setCustomUserClaims(uid, admin ? { admin: true } : {});
}

async function main() {
  const { adminDb } = await import("../src/library/firebaseAdmin");
  await ensureUser(LOCAL_E2E_STUDENT_UID, "student@catalyst.e2e", "E2E Student");
  await ensureUser(LOCAL_E2E_ADMIN_UID, "admin@catalyst.e2e", "E2E Administrator", true);

  const ids = LOCAL_E2E_FIXTURES;
  const user = adminDb.collection("users").doc(LOCAL_E2E_STUDENT_UID);
  const course = user.collection("enrollment").doc(ids.courseId);
  const now = FieldValue.serverTimestamp();

  await user.set({
    name: "E2E Student", email: "student@catalyst.e2e", college: "Catalyst Test University",
    tutorialsOptedOut: true, termsAcceptedAt: now, termsVersion: TERMS_VERSION, joinedAt: now,
  });
  await adminDb.collection("users").doc(LOCAL_E2E_ADMIN_UID).set({
    name: "E2E Administrator", email: "admin@catalyst.e2e", tutorialsOptedOut: true, termsAcceptedAt: now, termsVersion: TERMS_VERSION, joinedAt: now,
  });
  await user.collection("settings").doc("analytics").set({ enabled: false, updatedAt: now });
  await adminDb.collection("users").doc(LOCAL_E2E_ADMIN_UID).collection("settings").doc("analytics").set({ enabled: false, updatedAt: now });
  await course.set({
    className: "E2E Software Testing", classCode: "E2E 101", facultyName: "Test Instructor", facultyEmail: "instructor@catalyst.e2e",
    status: "in-progress", term: "Fall 2026", termSeason: "Fall", termYear: 2026, color: "#5b7fa6", createdAt: now, updatedAt: now,
  });
  await course.collection("quizSets").doc(ids.quizId).set({
    name: "E2E Quiz", visibility: "private", questionCount: 1,
    questions: [{ id: "e2e-question", type: "multiple_choice", question: "Does this local test run?", options: ["Yes", "No"], correctAnswer: "Yes" }],
    createdAt: now, updatedAt: now,
  });
  await course.collection("flashcardSets").doc(ids.flashcardSetId).set({
    name: "E2E Flashcards", visibility: "private", cards: [{ front: "Local", back: "Emulator" }], cardCount: 1, createdAt: now, updatedAt: now,
  });
  await course.collection("practiceSets").doc(ids.practiceSetId).set({
    name: "E2E Practice", kind: "fill_blank", difficulty: "exam", bestPercent: null, attempts: 0,
    items: [{ id: "e2e-practice-item", kind: "fill_blank", text: "The local backend is a {{blank}}.", answers: ["Firebase emulator"], explanation: "Tests use Firebase Emulator Suite." }],
    sourceDocKey: "", sourceName: "E2E fixture", createdAt: now, updatedAt: now,
  });
  await user.collection("notes").doc(ids.noteId).set({
    kind: "typed", title: "E2E Note", courseId: ids.courseId, notebookId: null,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Seeded local E2E note." }] }] },
    plainText: "Seeded local E2E note.", pageCount: 1, createdAt: now, updatedAt: now,
  });
  await user.collection("customSets").doc(ids.customSetId).set({
    name: "E2E Custom Set", items: [{ question: "Fixture", answer: "Ready" }], createdAt: now, updatedAt: now,
  });
  await adminDb.collection("publicStudySets").doc(ids.publicSetId).set({
    title: "E2E Public Flashcards", type: "flashcard", courseCode: "E2E 101", itemCount: 1,
    cards: [{ front: "Public", back: "Fixture" }], status: "active", positiveVotes: 0, negativeVotes: 0, createdAt: now, updatedAt: now,
  });
  await adminDb.collection("publicStudySets").doc(ids.publicSetId).collection("ownerMapping").doc("owner").set({ ownerUid: LOCAL_E2E_ADMIN_UID });
  await adminDb.collection("publicNoteShares").doc(ids.shareId).set({
    ownerUid: LOCAL_E2E_STUDENT_UID, noteId: ids.noteId, allowEdit: false, createdAt: now,
  });

  console.log(`Local E2E fixtures seeded in ${LOCAL_E2E_PROJECT_ID}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
