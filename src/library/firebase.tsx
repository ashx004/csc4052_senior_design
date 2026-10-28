import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const isLocalE2e = process.env.NEXT_PUBLIC_E2E_LOCAL === "true";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "studora-933f8";

const firebaseConfig = {
  // The Auth emulator accepts any non-empty API key. Production continues to
  // require the real public key from the environment.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? (isLocalE2e ? "e2e-local-api-key" : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  messagingSenderId: "138752872821",
  appId: "1:138752872821:web:0b1e85d21e9d392fd8c33c",
  measurementId: "G-VYRVY2KVQN"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (isLocalE2e && typeof window !== "undefined") {
  type LocalE2EWindow = Window & {
    __catalystE2eEmulatorsConnected?: boolean;
    __catalystE2eSignIn?: (token: string) => Promise<void>;
  };

  const localWindow = window as LocalE2EWindow;

  // Next's development hot reload can evaluate this module more than once.
  // The Firebase SDK rejects a second emulator connection, which previously
  // prevented the test-only sign-in hook from being published to the page.
  if (!localWindow.__catalystE2eEmulatorsConnected) {
    connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080"));
    localWindow.__catalystE2eEmulatorsConnected = true;
  }

  // Available only in a locally started E2E browser. Playwright exchanges a
  // fixture-role custom token here so the normal Firebase client, Firestore
  // rules, and AuthContext flow are all exercised.  Set the middleware cookie
  // here as well: in a newly-created test page, React's AuthContext listener
  // may not have attached before the custom-token request resolves.
  localWindow.__catalystE2eSignIn = async (token) => {
    const credential = await signInWithCustomToken(auth, token);
    const idToken = await credential.user.getIdToken();
    document.cookie = `fb_token=${idToken}; path=/; max-age=3600; SameSite=Lax`;
  };
}
