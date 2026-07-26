"use client";

import { GoogleAuthProvider, OAuthProvider, signInWithPopup, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// OAuth sign-in doesn't go through the email/password signup form, so it
// never gets a users/{uid} profile doc on its own — create a baseline one
// (matching what signup.tsx writes) the first time we see this user.
export async function ensureUserProfile(user: User): Promise<void> {
  const userDoc = doc(db, "users", user.uid);
  const existing = await getDoc(userDoc);
  if (existing.exists()) return;

  await setDoc(userDoc, {
    name: user.displayName ?? "",
    email: user.email ?? "",
    role: "",
    college: "",
    joinedAt: serverTimestamp(),
  });
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await ensureUserProfile(result.user);
  return result.user;
}

// Requires Sign in with Apple to be configured in the Firebase console
// (Authentication > Sign-in method > Apple), which itself requires an
// active Apple Developer Program membership and a Services ID — this code
// is correct and complete, but will error until that's set up on Apple's
// and Firebase's side.
export async function signInWithApple(): Promise<User> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  const result = await signInWithPopup(auth, provider);
  await ensureUserProfile(result.user);
  return result.user;
}
