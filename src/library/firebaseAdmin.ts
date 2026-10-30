import { cert, getApps, initializeApp, } from "firebase-admin/app";
import { getFirestore, } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const isLocalE2e = process.env.E2E_LOCAL === "true";
// E2E_LOCAL must take precedence over .env's production Admin project ID.
// firebase emulators:exec supplies the matching local project to every
// server process spawned by the test runner.
const projectId = isLocalE2e
  ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "catalyst-e2e"
  : process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "studora-933f8";

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : isLocalE2e
      ? initializeApp({ projectId })
      : initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
